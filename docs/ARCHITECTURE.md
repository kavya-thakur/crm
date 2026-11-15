# Architecture

How Flash is put together: the request lifecycle, the folders, and how each feature works.
For *what* is built and *why* it was decided, see [PROJECT.md](PROJECT.md). For the live
updates and notifications, see [REALTIME.md](REALTIME.md). For email from the CRM, see
[EMAIL.md](EMAIL.md); for leads sent in by other tools, [INTEGRATIONS.md](INTEGRATIONS.md); for rules that act on new
leads, [AUTOMATIONS.md](AUTOMATIONS.md).

_Last updated: 2026-11-02_

---

## 1. The shape of it

```
Browser (React, client components)
  │  pages fetch data with React Query  ──►  axios  ──►  /api/...  (JSON)
  │  one Socket.IO connection per tab   ◄──────────────  live events
  ▼
server.ts  ── one Node process: Next.js + Socket.IO + job worker (REALTIME.md, QUEUES.md)
  │            uses Redis for the job queue and rate limits
  │
  ├─ src/proxy.ts            optimistic check: no login cookie → /login
  ├─ app/(dashboard)/…/page.tsx   server component: who's signed in, what may they do → passes `can` flags
  └─ app/api/…/route.ts      route handler: auth → permission → validate → scoped Prisma query → JSON
                                   │
                                   ▼
                     Prisma 7 (driver adapter: pg)  ──►  PostgreSQL
```

It's a **full-stack Next.js app**: the "backend" is the route handlers in `src/app/api`,
the "frontend" is the React components. If you know Express, a route handler is an
`app.get(...)` handler that lives in a file whose folder path is its URL:
`src/app/api/leads/[id]/route.ts` ≈ `app.get("/api/leads/:id")` + `app.put(...)` + `app.delete(...)`.

---

## 2. A request, start to finish

Take "save a lead's company" (`PUT /api/leads/12 { companyName: "Acme" }`):

1. **Browser:** `LeadPanel` calls `update.mutate({ companyName })`, a React Query mutation that
   calls `api.put("/leads/12", ...)` (axios, `src/lib/api/client.ts`). The `access_token`
   cookie goes along automatically.
2. **Auth:** `requirePermission("lead:update")` (`src/lib/auth/requirePermission.ts`) calls
   `getCurrentUser()`, which verifies the JWT and loads the user with role and permissions.
   No user → `UNAUTHORIZED` (401). Missing permission → `FORBIDDEN` (403). A 401 outside
   `/api/auth/*` sends the browser to `/login` (the axios interceptor in `client.ts`).
3. **Validate:** `parseBody(req, updateLeadSchema)` uses zod (`src/lib/validations/leads.ts`).
   The **same schema** validates the form in the browser (react-hook-form + `zodResolver`),
   so client and server agree on the rules.
4. **Scope:** every query includes `leadScope(user)`: `{ organizationId }`, plus
   `{ assignedToId: me }` unless the user has `lead:all`. That one helper is how both
   **multi-tenancy** (never see another workspace) and **"agents only see their own"** work.
5. **Write:** Prisma `update` with the scope in the `where`, so the write itself is checked.
   A timeline entry is created in the same query where relevant.
6. **Errors:** `handleRouteError` turns `UNAUTHORIZED`/`FORBIDDEN`/Prisma "not found" (P2025)
   into proper status codes.
7. **Back in the browser:** `onSuccess` puts the saved lead into the cache and invalidates
   the lists, so they refetch.
8. **Everyone else:** `server.ts` sees a successful write to `/api/leads` and tells the
   workspace "leads changed". Their open pages refetch ([REALTIME.md](REALTIME.md)).

---

## 3. Folder structure

```
crm/
├── server.ts                 Next.js + Socket.IO on one port (npm run dev / npm start)
├── prisma/
│   ├── schema.prisma         the database: every model, with comments
│   ├── migrations/           one folder per change, applied in order (commit these!)
│   ├── seed.ts               permissions + default stages for every workspace
│   └── demo.ts               fills a demo workspace with 18 months of fake activity (npm run db:demo)
├── prisma7.config.ts         Prisma CLI config (pass --config prisma7.config.ts)
├── src/
│   ├── proxy.ts              (Next 16's "middleware") redirects signed-out visitors to /login
│   ├── generated/prisma/     Prisma client, generated, never edited by hand
│   ├── app/
│   │   ├── layout.tsx        root HTML, fonts, React Query provider, toaster
│   │   ├── globals.css       Tailwind v4 + design tokens (colors, shadows, scrollbars)
│   │   ├── (marketing)/      public site: landing page, /pricing, /demo (Book a demo form)
│   │   ├── (auth)/           /login, /register
│   │   ├── onboarding/       first-run setup after sign up (workspace name, your name, currency), 3D scene
│   │   ├── f/[key]/          a web form's own public page (shareable link, no login)
│   │   ├── (dashboard)/      the app itself (signed in)
│   │   │   ├── layout.tsx    sidebar, ⌘K search, bell, LiveUpdates, LostReasonPrompt
│   │   │   ├── dashboard/    charts, team table, source performance, lost reasons
│   │   │   ├── leads/import/  the CSV import screen (QUEUES.md)
│   │   ├── leads/  deals/  contacts/   each: page.tsx (server) + XView (client) +
│   │   │   │                               XTable, XBoard, XPanel, NewXDialog, shared.tsx
│   │   │   ├── tasks/  activities/  notes/
│   │   │   ├── settings/     profile, members, roles, pipelines, lead stages & sources, custom fields, web forms
│   │   │   ├── shared/       pieces used by several record types (notes, tasks and activities tabs,
│   │   │   │                 custom fields, the full-page form, list query hook)
│   │   │   ├── CommandMenu.tsx      ⌘K global search
│   │   │   ├── LiveUpdates.tsx      the Socket.IO connection (REALTIME.md)
│   │   │   └── NotificationBell.tsx the bell
│   │   ├── api/              route handlers, one folder per resource (see §5)
│   │   └── providers/        React Query provider
│   ├── components/           app-wide UI: DataTable, Board, FilterPanel, Dropdown, Select,
│   │                         Modal, SidePanel, MergePanel, Toast, LostReasonPrompt, ...
│   └── lib/                  logic without React, grouped by what it's for:
│       ├── auth/             who's signed in: getCurrentUser, jwt, password, requirePermission (+ the scopes)
│       ├── db/               connections to our two databases: prisma.ts (Postgres), redis.ts (Redis)
│       ├── api/              for API routes and the browser's API client:
│       │                     client.ts (axios, browser), http.ts (parseBody, handleRouteError),
│       │                     rateLimit.ts (limits in Redis), csvExport.ts (streamed CSV downloads)
│       ├── realtime/         Socket.IO: socketServer.ts (the server), notify.ts (notify(), broadcastChange())
│       ├── jobs/             background work on the Redis queue (QUEUES.md): queues.ts, worker.ts,
│       │                     leadImport.ts (CSV import, batch by batch), bulkActions.ts (big bulk deletes)
│       ├── leads/            lead rules: capture.ts (web form → lead), duplicates.ts (matching people,
│       │                     "already a lead"), stages.ts, sources.ts (defaults), lostReasons.ts
│       ├── deals/            deal rules: stages.ts (pipeline defaults, closedAt), select.ts (its lead's contact details)
│       ├── work/             tasks.ts and activities.ts: what their API responses include, timeline entries
│       ├── settings/         what admins set up: customFields.ts (validating values), optionLists.ts
│       │                     (stage/source editing), stageColors.ts
│       ├── demo/             workspace.ts: builds the demo workspace (npm run db:demo, and nightly),
│       │                     isDemoWorkspace(), assertNotDemo()
│       ├── dashboard/        periods.ts: date ranges and chart buckets
│       ├── utils/            format.ts: dates, money, "2 hours ago"
│       └── validations/      zod schemas, one file per resource, shared by forms and routes
├── tests/
│   ├── helpers.ts            createOrgWithUser, cleanupOrg, ...
│   └── integration/          Vitest against a real Postgres (crm_test), one file per feature
└── docs/                     these files
```

**Conventions**

- A page is a **server component** (`page.tsx`) that checks who's signed in and what they
  may do, then renders a **client component** (`LeadsView.tsx`) with `can={{ update, delete, ... }}`.
  The client never decides permissions; it only hides buttons the server would refuse anyway.
- A route file may only export HTTP handlers (`GET`, `POST`, ...). Helpers live in `src/lib`.
- One zod schema per action, shared by the form and the route.
- Comments explain *why*, in plain words.

---

## 4. Data model (PostgreSQL via Prisma)

```
Organization ─┬─ User ── Role ── RolePermission ── Permission
 (workspace)  ├─ Lead ──┬─ LeadTimeline, LeadNote            (+ Contact: every lead has one)
              │         └─ Deal ── DealTimeline, DealNote
              ├─ Contact ── ContactTimeline, ContactNote
              ├─ LeadStage, LeadSource, Pipeline → PipelineStage (admin-editable option lists)
              ├─ CustomFieldDefinition                        (values live in each record's customFields JSON)
              ├─ Task, ScheduledActivity (+ attendees)        (linked to at most one lead/deal/contact)
              ├─ LeadForm                                      (web forms)
              ├─ SavedFilter                                   (per user)
              ├─ ImportJob                                     (a CSV import: file, mapping, progress, problem rows)
              ├─ BulkJob                                       (a big bulk delete: the ids, progress)
              └─ Notification                                  (the bell)
```

- **Multi-tenant by column:** every business row has `organizationId`, and every query is
  scoped by it (§2, step 4).
- **Timeline vs notes:** `*Timeline` is an automatic, read-only log (created, stage changed,
  assigned, merged). `*Note` is written by people and can @-mention teammates.
- **Custom fields:** an admin defines fields (`CustomFieldDefinition`: key, type, options,
  required, show-in-filter); values live in a `customFields` JSONB column on the record.
  Single edits merge into the JSON with SQL (`jsonb ||`), so two people editing different
  fields don't overwrite each other.
- **Who did what:** leads, deals and contacts have `createdById`/`updatedById`.
- **Matching people:** `Lead.phoneKey` (last 10 digits) and `Lead.emailKey` (lower case) are
  filled by a **database trigger**, so "+91 98765-43210" and "9876543210" match, fast and indexed.
- **Search:** `pg_trgm` GIN indexes make "contains" search across names, emails and titles fast.

---

## 5. API map

All under `/api`, JSON in and out (`{ ok, data, message }`), most needing a login:

| Area | Routes |
|---|---|
| Auth | `auth/login`, `auth/register` (email + password only), `onboarding` (finishes setup once), `auth/logout`, `auth/demo` (one-click demo sign-in), `me`, `me/password` |
| Leads | `leads` (list with filters, create), `leads/[id]` (get, edit, delete), `.../assign`, `.../convert` (→ deal), `.../merge`, `.../notes`, `.../timeline`, `leads/bulkUpdate`, `leads/duplicates` |
| Deals | the same shape, plus `deals/[id]/duplicates`, and `deals/[id]/products` (+ `/[lineId]`): the quote's lines |
| Contacts | the same shape (no convert or merge) |
| Work | `tasks`, `tasks/[id]`, `activities`, `activities/[id]`, `notes` (the feed) |
| Settings | `lead-stages`, `lead-sources`, `pipelines` (+ `[id]`), `pipeline-stages` (`?pipelineId=`), `custom-fields`, `lead-forms`, `agents`, `roles`, `permissions`, `saved-filters`, `products` (the catalogue) |
| Other | `dashboard`, `search`, `notifications` |
| Public | `public/forms/[key]`: web form submissions (no login; CORS, honeypot, rate limit) |

---

## 6. Permissions

Roles are made of permissions; an admin builds roles in Settings → Roles.

| Permission | Means |
|---|---|
| `lead:create/read/update/delete` (same for `deal:`, `contact:`) | the basic actions, on **your own** records |
| `lead:all`, `deal:all`, `contact:all` | widen those to **everyone's** records in the workspace (also: assign to others, see the team on the dashboard) |
| `task:all`, `activity:all` | see everyone's tasks / calls and meetings, not only your own |
| `pipeline:manage`, `lead-stages:manage`, `lead-sources:manage` | edit stages and sources |
| `custom-fields:manage`, `lead-forms:manage` | edit custom fields, web forms |

Checked on the server in every route (`requirePermission`, `hasPermission`, the `*Scope`
helpers), and mirrored in the UI by the `can` flags.

---

## 7. How the features work

### Lists, filters and boards
- **Lists** (`LeadsView` → `LeadsTable`): one page of `GET /api/leads` at a time, with a
  **Pagination** bar underneath (rows per page 25 / 50 / 100, previous / next, "1–50 of 4,230").
  The page and its size are in the URL (`?page=3&size=25`, `usePaging`); a filter or tab change
  goes back to page 1. Kanban boards keep their own "Load more" per column. Columns can be shown, hidden,
  reordered and resized (`useColumnPrefs`, saved per browser).
- **Filters** (`FilterPanel.tsx`): each page lists its filter fields (stage multi-select,
  source, owner, created/modified by and date, possible duplicates, custom fields marked
  "show in filter"). They become query params (`toQueryParams`) that the list route turns
  into a Prisma `where`. Filters can be saved (`SavedFilter`).
- **Inline edit:** a column with an `edit` config gets a pencil; saving `PUT`s one field. Text editors save on blur; menu editors (select, company) open at once and the editor closes with the menu (a pick, a click outside, Esc).
- **Bulk actions:** select rows → stage, assign, edit a field for all, merge (2 selected), delete.
  On leads, "Select all N matching" selects every lead the filters match; deleting more than 200
  runs as a background job with a progress card ([QUEUES.md](QUEUES.md)).
- **Kanban boards** (`Board.tsx`): one column per stage, each column its own paged query
  (`useBoardColumn`, 25 cards at a time). Dragging a card `PUT`s its new stage.
  Phones can't drag, so on touch screens each card has "Move to…", then "Move here" on a column.
  Leads, deals, tasks (by status), activities and notes all have boards.

### Page state lives in the URL
What you're looking at is kept in the address bar, e.g. `/leads?view=board&open=12&filters={"stageIds":[3]}`
(`useUrlState` in `shared/useUrlState.ts`; filters via `useListQuery`). So a refresh keeps the view,
filters and open record, Back closes a record you opened, and a pasted link opens the same screen.
It's written with the browser's own `history.pushState/replaceState`, which Next.js follows, so
nothing reloads. Tasks and Activities keep their tabs, "whose" and priority there too. Each page's last
view and filters are also remembered in the browser (`rememberedUrl`), so the sidebar and the ⌘K
menu take you back to a page the way you left it.

### Record panels
`LeadPanel`, `DealPanel`, `ContactPanel`: fields you click to edit, then tabs for the
timeline, notes (with @mentions), tasks and activities. Opened by `?open=<id>` in the URL,
so any link (notes feed, search, notification) can land on a record.

### Leads → deals
`POST /api/leads/:id/convert` creates a deal for the lead and moves the lead to the
"converted" stage. Stages are flagged `isConverted`/`isLost` (leads) and `isWon`/`isLost`
(deals). Moving a deal into won/lost sets `closedAt`, which the dashboard counts by.
A deal has no phone or email of its own: it shows its **lead's** (`dealLeadSelect` in
`src/lib/deals/select.ts`), as Phone/Email columns and a Contact section in the deal panel, where
the lead can also be linked or changed. A deal without a lead has no way to reach anyone.

### Lost reasons
Moving a lead or deal to a lost stage (drag, panel, table, bulk) first asks "Why was this
lost?" (`askLostReason()` → `LostReasonPrompt`, a promise-based modal). The reason is saved
on the record and in the timeline, cleared if it reopens, and charted on the dashboard.

### Duplicates and merging
- **One open lead per person.** Creating (or editing into) a second **open** lead with the
  same phone or email is refused (409) with the existing lead's name; the New lead form
  warns while typing and disables Create. A person whose earlier lead was lost or converted
  can come back as a new lead.
- **Merging** (`MergePanel.tsx`, `POST /api/{leads,deals}/:id/merge`): for leftovers, pick
  values where two records differ. The duplicate's timeline, notes, tasks, activities (and,
  for leads, deals) move over, then it's deleted. Offered as a one-line suggestion in the
  panel, by selecting two rows, and through the "Possible duplicates" filter.

### Web forms and lead capture
An admin creates a form (Settings → Web forms) and gets a key, embed code and a JSON
endpoint. `POST /api/public/forms/:key` (`lib/leads/capture.ts`) validates, drops bots (a
hidden honeypot field), rate-limits, then either adds to the existing open lead or creates
lead + contact + a "Reply to <name>" task due today.

**What a form asks** is set in the form builder (Settings → Web forms → Edit form) and saved
as `LeadForm.settings` (see `leadFormSettingsSchema` in `src/lib/validations/leadForms.ts`):
page texts, email/company/message as required/optional/off (name and phone are always
asked), and lead custom fields, each required or not. A form is used in three ways, all
following the same settings and the same endpoint: its **hosted page** `/f/<key>`
(`src/app/f/[key]`), the **HTML embed** generated from the settings (custom field answers are
named `cf_<key>`), or a developer's own form posting JSON (`customFields: { key: value }`).
Answers are checked against the field types and saved into the lead's `customFields`; a
returning lead only gets its empty fields filled. The owner is fixed, or **rotates** round-robin
through chosen people (an atomic counter in the database, so two leads at once never share
a turn). The marketing site's `/demo` page posts to a form in Flash's own workspace.

**Campaigns (UTM tags).** A marketer puts `?utm_source=google&utm_medium=cpc&utm_campaign=diwali-sale`
on the link to an ad's landing page. The hosted page sends the tags in its own URL with the
submission; the HTML embed has hidden `utm_*` inputs that a three-line script fills from the
page's URL; a developer's JSON can send them as fields. They're saved on the lead
(`utmSource`, `utmMedium`, `utmCampaign`), and mentioned in the timeline entry. A returning lead
keeps the campaign it first came from (first touch). The dashboard groups leads by
`utmCampaign`, and won deals by their lead's `utmCampaign`, for revenue per campaign. An
imported file's "Campaign" column fills it too.

### Dashboard
`GET /api/dashboard?range=30d&agentId=` computes everything with `groupBy`/`aggregate` in
parallel: revenue won and its trend vs the previous period, win rate, weighted pipeline,
deals closing soon, lead funnel, sources and ad campaigns (leads, conversion, revenue), lost reasons, the
team table (per agent) and your own tasks and upcoming calls. Managers see the team;
others see their own numbers.

### Global search (⌘K)
`GET /api/search?q=` searches leads, deals, contacts, tasks and activities you're allowed
to see (trigram indexes), with a preview pane and type filters in `CommandMenu.tsx`.

### Import and export
Leads → **Import ▾** opens a menu: *Import leads from CSV*, *Export these leads to CSV*, and *Download
sample CSV* (`GET /api/imports/sample`: the usual columns plus every lead custom field, with an example
row from this workspace's stages, sources and people). Importing: pick a CSV, map its columns (guessed
from the headers), choose defaults, then a **BullMQ job** imports it with live progress. Teammates are
written by name or email ("Assigned to", Agent fields); a name that matches nobody goes to the problem
file rather than silently to someone else. Deals and Contacts have an **Export** button.
See [QUEUES.md](QUEUES.md).

### Real time
See [REALTIME.md](REALTIME.md).

---

## 8. Frontend patterns

- **React Query** owns all server data. Query keys start with the resource (`["leads", filters]`,
  `["lead", 12]`, `["dashboard", range]`), so invalidating `["leads"]` refreshes every lead list,
  which is exactly what live updates do.
- **Dropdowns** float in a portal (so no `overflow: hidden` parent can clip them), except
  inside native `<dialog>`s (Modal, SidePanel), where lists of buttons are used instead.
- **Phones** (below Tailwind's `md`, 768px): the sidebar becomes a ☰ drawer (`SidebarShell.tsx`),
  toolbars and the bulk bar scroll sideways, record panels and forms stack into one column, and
  dropdowns never get wider than the screen (`maxWidth` in `Dropdown`'s placement). The app uses
  `h-dvh` so mobile browser bars don't hide its bottom. Desktop layouts are unchanged.
- **Design:** light theme in the style of twenty.com; tokens (`--color-accent: #4a38f5`,
  `ink`, `muted`, `faint`, `line`, ...) in `globals.css`. Animations use only transform and
  opacity (GSAP, respecting reduced motion).

---

## 9. Testing

- **Integration tests** (`tests/integration/*.test.ts`, Vitest) call the real route handlers
  against a real Postgres (`crm_test`). Each test creates its own workspace and cleans it up.
  `getCurrentUser` is mocked to pick who's signed in.
- Run: `npm test`. Before that, apply migrations to the test database:
  `DATABASE_URL="postgresql://mac@localhost:5432/crm_test" npx prisma migrate deploy --config prisma7.config.ts`
- CI (`.github/workflows`) runs the type check and the tests against a throwaway Postgres.
