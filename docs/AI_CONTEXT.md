# Flash CRM: full project context for AI agents

Read this first. It explains what the project is, how it's built, what exists, the rules the code
depends on, and how the owner likes to work. Deeper docs are listed at the end; the code is the
final word if anything here disagrees with it.

_Last updated: 2026-11-10_

---

## 1. What Flash is

**Flash** is a multi-tenant sales CRM SaaS for small sales teams (built with India in mind: ₹, GST,
IndiaMART, WhatsApp, Razorpay). Each company signs up for its own **workspace**; its team captures
leads, works them through stages, converts them into deals, and tracks tasks, calls, meetings,
notes and email. Managers watch a live dashboard.

It's a **portfolio project** (maybe a startup later), built solo by Kavya Thakur to show real
backend and distributed-systems understanding: deep vertical slices (database → API → validation
→ permissions → logic → UI → live events → tests), not shallow CRUD screens.

- Repo: `github.com/kavya-thakur/crm`, working branch `kavyachanges`, PRs into `main`
- Live demo: one-click logins on the login page ("Explore as a manager / as a sales agent")
- Product name **Flash**; marketing site in `src/app/(marketing)`

---

## 2. Tech stack

| Layer | What | Notes |
|---|---|---|
| Framework | **Next.js 16.3** (App Router), **React 19.2**, TypeScript | **This Next.js has breaking changes from older versions.** Read `node_modules/next/dist/docs/` before writing Next code. `src/proxy.ts` is Next 16's "middleware". Route `params` are a `Promise` |
| Server | **Custom Node server `server.ts`**: Next.js + Socket.IO + BullMQ workers in one process | Route handlers can't hold WebSockets. Run with `npm run dev`, never `next dev` |
| Database | **PostgreSQL** + **Prisma 7.10** with the `pg` driver adapter | Client generated into `src/generated/prisma` (never edit). CLI always needs `--config prisma7.config.ts`. JSONB for custom fields, `pg_trgm` for search, triggers for match keys |
| Jobs / limits | **Redis** + **BullMQ 5** + ioredis | Queues: imports, bulk, emails, automations, demo. Rate limits in Redis (fail open) |
| Realtime | **Socket.IO 4.8** | Same port as the app; authenticated by the login cookie |
| Validation | **Zod 4** | One schema per action, shared by react-hook-form and the API route |
| Data fetching | **TanStack React Query 5** + axios | `staleTime` 5 min; live events invalidate queries |
| Forms | react-hook-form + `zodResolver` | |
| UI | **Tailwind CSS 4**, Tabler icons, sonner toasts, **GSAP**, three.js, Lenis (marketing scroll) | Light-only, twenty.com-style design. Tokens in `src/app/globals.css` |
| Auth | JWT (`jsonwebtoken`) in an **httpOnly cookie** `access_token` (1 day), `bcryptjs` | No third-party auth |
| Email | **Nodemailer** over SMTP | One team mailbox per workspace (app password, AES-256-GCM encrypted). Flash's own `SMTP_*` mailbox only for password resets |
| Payments | **Razorpay** Standard Checkout + signed webhook, no SDK (REST calls) | `src/lib/billing/` |
| CSV | Papaparse | Import and streamed export |
| Tests | **Vitest 3** integration tests against a **real Postgres** (`crm_test`) | 205 tests, 42 files. No mocks except `getCurrentUser` |
| CI | GitHub Actions (`.github/workflows/ci.yml`) | `prisma generate`, migrate, `next typegen && tsc --noEmit`, `npm test` |
| Hosting | Render (app + Key Value Redis, `render.yaml` blueprint), Neon (Postgres) | Needs a long-running Node process, so no serverless-only hosts |

---

## 3. Running it

```bash
brew install redis && brew services start redis
cp .env.example .env                                   # DATABASE_URL, JWT_SECRET, REDIS_URL
npm install
npx prisma migrate deploy --config prisma7.config.ts
npx prisma generate --config prisma7.config.ts
npx tsx prisma/seed.ts                                 # permissions + default stages
npm run db:demo                                        # optional demo workspace (DEMO_SCALE=25 → ~10k leads)
npm run dev                                            # http://localhost:3000
```

Demo login: `johndoe@flash-demo.dev` / `demo1234`, or the one-click buttons.

| Script | Does |
|---|---|
| `npm run dev` | `tsx server.ts`: app + Socket.IO + workers |
| `npm run build` / `npm start` | `next build`, then esbuild bundles `server.ts` → `dist/server.cjs`; start runs it with node |
| `npm test` | `vitest run` (needs `crm_test` migrated) |
| `npm run lint` | ESLint |
| `npm run db:demo` | build/rebuild the demo workspace |

**Env vars:** `DATABASE_URL`, `JWT_SECRET`, `REDIS_URL` (required); `APP_URL` (production: links,
open tracking, OG image); `SITE_ADMIN_EMAILS` (root site admins); `DEMO_FORM_KEY` (marketing "Book a
demo" form → a web form); `TEST_DATABASE_URL`; `SMTP_HOST/PORT/USER/PASS/FROM` (password-reset mail;
without it the link prints in the terminal); `RAZORPAY_KEY_ID/KEY_SECRET/WEBHOOK_SECRET` (without
them, choosing a plan is a request a site admin approves).

**Gotchas**
- After changing `schema.prisma`: create the migration, `prisma generate`, apply it to `crm_test` too,
  and **restart `npm run dev`**. The Prisma client is cached on `globalThis`, so the running server
  keeps the old one.
- If Redis won't start locally: the Homebrew Redis config had broken module lines (commented out, a backup was kept).
- `next dev` alone has no Socket.IO and no workers.

---

## 4. Architecture

```
Browser (React client components, React Query + axios)
  │  HTTPS /api/*  ─────────────────────────────►  server.ts (one Node process)
  │  WebSocket (Socket.IO) ◄── live events ──────    ├─ billing gate: locked workspace → 402 before any route
  ▼                                                  ├─ Next.js: pages + route handlers
Other tools (Google Ads, IndiaMART, Zapier) ──►      ├─ Socket.IO: rooms org:<id>, user:<id>
  POST /api/public/leads/:key                        ├─ after every /api response: announceChange()
Mail apps ── tracking pixel ──►                      └─ BullMQ workers (imports, bulk, emails, automations, demo)
Razorpay ── webhook ──►                                     │                     │
                                                       PostgreSQL (Prisma)     Redis (queues, rate limits)
```

### server.ts in short
1. If the request is `/api/*` and the workspace is locked (trial/plan ended), answer **402** with
   `{ ok:false, locked:true }`. One check for every route (`src/lib/billing/gate.ts`, `apiLocked`).
2. On every `/api/*` response `finish`, `announceChange(req, status)` broadcasts
   `changed { topic }` to the workspace for successful writes. **No route contains realtime code.**
3. `startRealtime(httpServer)` and `startWorkers()`. On SIGINT/SIGTERM workers close; an unfinished
   import batch rolls back and resumes next start.

### A request, start to finish
1. Browser: a React Query mutation calls `api.put("/leads/12", ...)` (`src/lib/api/client.ts`); the cookie goes along.
2. Auth: `getCurrentUser()` verifies the JWT and loads the user with role + permissions, or
   `requirePermission("lead:update")` (`src/lib/auth/requirePermission.ts`). No user → 401, missing permission → 403.
3. Validate: `parseBody(req, schema)` / `schema.safeParse` + `validationError()` (`src/lib/api/http.ts`, `src/lib/validations/*`).
4. Scope: every query spreads a scope helper: `leadScope(user)`, `dealScope`, `contactScope`,
   `taskScope`, `activityScope` = `{ organizationId }` plus "only mine" unless the user has `*:all`.
   This one helper is both multi-tenancy and own-vs-everyone permissions.
5. Write with the scope in the `where`, so the write itself is checked. Timeline rows in the same transaction.
6. Errors: `handleRouteError(error, "Label")` maps `UNAUTHORIZED`/`FORBIDDEN`/Prisma P2025 to status codes.
7. Response shape is always JSON `{ ok, data?, message? }`.
8. Other tabs get `changed { topic: "leads" }` and refetch through the same permission checks.

### Route handler template (the house style)

```ts
import { handleRouteError, validationError } from "@/lib/api/http";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { taskScope } from "@/lib/auth/requirePermission";
import { prisma } from "@/lib/db/prisma";
import { idParamSchema } from "@/lib/validations/common";
import { NextRequest, NextResponse } from "next/server";

type Params = { params: Promise<{ id: string }> };      // Next 16: params is a Promise

export async function GET(req: NextRequest, { params }: Params) {
    try {
        const user = await getCurrentUser();
        if (!user) throw new Error("UNAUTHORIZED");

        const id = idParamSchema.safeParse((await params).id);
        if (!id.success) return validationError(id.error);

        const task = await prisma.task.findFirst({ where: { id: id.data, ...taskScope(user) } });
        if (!task) return NextResponse.json({ ok: false, message: "Task not found" }, { status: 404 });

        return NextResponse.json({ ok: true, data: task });
    } catch (error) {
        return handleRouteError(error, "Get task");
    }
}
```

A record outside the scope answers **404, never 403**, so another workspace's ids can't be confirmed.

### Page pattern
`page.tsx` is a **server component**: loads the user and permissions, then renders a client view
(`LeadsView.tsx`) with `can={{ create, update, delete, ... }}`. The client only uses `can` to hide
buttons; the API re-checks everything.

---

## 5. Folder map

```
server.ts                      Next.js + Socket.IO + workers + billing gate, one port
prisma/schema.prisma           37 models, commented
prisma/migrations/             58 migrations (commit them)
prisma/seed.ts · demo.ts       permissions/default stages · demo workspace
prisma7.config.ts              Prisma CLI config (always pass --config)
render.yaml                    Render blueprint
src/proxy.ts                   signed-out → /login (Next 16 middleware)
src/generated/prisma/          generated client, never edit
src/app/
  (marketing)/                 landing, /product, /pricing, /demo, /privacy, /terms (3D, GSAP, Lenis)
  (auth)/                      login, register, forgot-password, reset-password
  onboarding/                  first-run: workspace name, your name, currency (dark 3D scene)
  f/[key]/                     a web form's public hosted page
  quote/[dealId]/              printable quote (print → PDF)
  (dashboard)/                 the signed-in app
    layout.tsx                 sidebar, ⌘K, bell, LiveUpdates, billing lock, "logged in as" bar
    my-day/ dashboard/ leads/ deals/ contacts/ companies/ tasks/ activities/ notes/
    leads/import/              CSV import screen
    settings/                  profile, members, roles, stages, custom-fields, lead-forms,
                               integrations, email-templates, automations, products, workspace,
                               billing, recycle-bin, site-admin
    shared/                    used by several record types: notes, tasks, activities, emails,
                               mailbox, whatsapp, customFields, CompanyPicker, FullPageForm,
                               useListQuery, useUrlState, useSelectAll, usePanelEnter
    LiveUpdates.tsx            the Socket.IO client
    NotificationBell.tsx  CommandMenu.tsx (⌘K)  ActivityAlert.tsx (start-time popup)
    BackgroundJobs.tsx (progress cards)  LoggedInAsBar.tsx  SidebarShell.tsx (mobile drawer)
  api/                         108 route handlers, one folder per resource; api/public = no login
  providers/QueryProvider.tsx  React Query defaults
  globals.css                  Tailwind 4 + design tokens
src/components/                DataTable, Board (kanban), FilterPanel, ListPage, Dropdown, Select,
                               Modal, SidePanel, MergePanel, LostReasonPrompt, Pill, StageBadge, Toast…
src/lib/                       logic with no React:
  auth/        getCurrentUser, jwt, password, requirePermission (+ scopes), logInAs, siteAdmin, passwordReset
  db/          prisma.ts, redis.ts
  api/         client.ts (axios), http.ts (parseBody, handleRouteError, validationError), rateLimit.ts, csvExport.ts
  realtime/    socketServer.ts (startRealtime, announceChange), notify.ts (notify, broadcastChange, rooms)
  jobs/        queues.ts, worker.ts, leadImport.ts, bulkActions.ts
  imports/     rows.ts (shared row rules for check + import), upload.ts
  leads/       capture.ts (captureLead), duplicates.ts, webhookPayload.ts (toSubmission), stages, sources, lostReasons
  deals/       stages.ts, select.ts, dealProducts.ts, quote.ts (discount then tax)
  work/        tasks.ts, activities.ts
  emails/      send.ts (queueEmail, sendEmail), account.ts (encrypt, checkMailbox), templates.ts, system.ts
  automations/ engine.ts (startAutomations, runAutomations, matches), checkRule.ts
  billing/     plans.ts (prices), gate.ts (lock), razorpay.ts, payments.ts (settlePayment), reminders.ts
  settings/    customFields.ts, optionLists.ts, stageColors.ts
  dashboard/   periods.ts
  demo/        workspace.ts (build demo, isDemoWorkspace, assertNotDemo)
  utils/       format.ts (dates, money, relative time)
  validations/ one Zod file per resource
  history.ts   "changed Amount from X to Y" timeline rows
  recycleBin.ts  companies.ts  whatsapp.ts
tests/helpers.ts               createOrgWithUser, cleanupOrg, …
tests/integration/             41 files, one per feature
docs/                          PROJECT, ARCHITECTURE, REALTIME, QUEUES, AUTOMATIONS, EMAIL, INTEGRATIONS, this file
```

---

## 6. Data model (37 models, the core)

```
Organization (workspace) ─┬─ User ── Role ── RolePermission ── Permission
                          ├─ Lead ──┬─ LeadTimeline, LeadNote, Task, ScheduledActivity, Email
                          │         └─ Deal ── DealTimeline, DealNote, DealProduct (quote lines)
                          ├─ Contact ── ContactTimeline, ContactNote   (every lead has a contact)
                          ├─ Company ── Contact                         (deal's company = its lead's contact's company)
                          ├─ LeadStage, LeadSource, Pipeline → PipelineStage (admin-editable)
                          ├─ CustomFieldDefinition                      (values in each record's customFields JSONB)
                          ├─ Product                                    (catalogue)
                          ├─ LeadForm (kind FORM | WEBHOOK) ── LeadFormDelivery
                          ├─ AutomationRule ── AutomationRun
                          ├─ EmailTemplate, EmailAccount (one team mailbox per workspace: SMTP, or Gmail via Connect with Google)
                          ├─ ImportJob, BulkJob                         (job state lives in Postgres)
                          ├─ SavedFilter, Notification, DeletedRecord (recycle bin), Payment
                          └─ PasswordReset (sha256 of the token only)
```

Key facts:
- Every business row has `organizationId`. Everything is scoped by it.
- `*Timeline` = automatic read-only log; `*Note` = written by people, supports @mentions.
- Leads/deals/contacts have `createdById` / `updatedById`.
- `Lead.phoneKey` (last 10 digits) and `Lead.emailKey` (lower case) are filled by a **DB trigger**; indexed.
- Custom field values: `customFields` JSONB, single edits merged with `jsonb ||`.
- Stages carry flags: lead `isConverted` / `isLost`; deal `isWon` / `isLost`. Won/lost sets `closedAt`.
- UTM: `utmSource`, `utmMedium`, `utmCampaign` plain columns on Lead, first touch wins.
- `Organization.trialEndsAt`, paid-until fields; `User.isOwner`, `canLogInAs`, `isSiteAdmin`, `needsOnboarding`.

---

## 7. Auth, tenancy, permissions

- **Sign up** = email + password → creates a workspace with an Admin role, default stages, sources,
  pipeline, starter email templates. `/onboarding` then names workspace + person + currency
  (`User.needsOnboarding`, set only by sign up).
- **Session**: JWT in httpOnly `access_token`; same cookie authenticates the socket. Sign-in rate limited.
- **Forgot password**: one-time link (1 hour), only its sha256 stored, says "No account uses this email" when none does (sign up already reveals that), sends nothing.
- **Permissions** (admins build roles from checkboxes):
  - `lead:create/read/update/delete` (same for `deal:`, `contact:`) → own records
  - `lead:all`, `deal:all`, `contact:all` → everyone's; also assign to others, see the team on the dashboard
  - `task:all`, `activity:all`
  - `user:*`, `role:*`, `pipeline:manage`, `lead-stages:manage`, `lead-sources:manage`,
    `custom-fields:manage`, `lead-forms:manage`, `email-templates:manage`, `automations:manage`, `workspace:manage`
- **Log in as a teammate**: the workspace owner (and people the owner allows, `canLogInAs`) opens a
  teammate's account for an hour (token with `actingAs`); own session kept in `own_access_token`;
  `/api/auth/back` returns. Orange bar, teammate notified. Off in the demo.
- **Site admin** (people who run Flash): root admins by `SITE_ADMIN_EMAILS`, others via
  `User.isSiteAdmin`. See every workspace and user, log in as anyone (not notified, decided by the owner).
- **Billing**: 7-day trial, then Pro ₹1,499/month or ₹14,990/year (`src/lib/billing/plans.ts`).
  Expired → app shows Billing, API answers 402 (except sign-in, billing, site admin, health, public
  forms/webhooks). Never locked: the demo and site admins. Razorpay order → verify (or webhook) →
  `settlePayment` fetches order + payment from Razorpay, checks workspace/amount/INR, captures, records
  a unique `Payment`, activates Pro **once**. Reminders hourly: before trial/Pro ends and when ended.
- **Demo workspace**: `/api/auth/demo` signs in as fixed demo users; password, profile, members, roles
  locked; never sends real email; rebuilt nightly 03:00 IST by a BullMQ job scheduler.

---

## 8. Realtime (Socket.IO), see docs/REALTIME.md

- One connection per tab, joins `org:<id>` and `user:<id>`.
- Events:
  | Event | To | Client does |
  |---|---|---|
  | `changed { topic }` | workspace | invalidates React Query keys for that topic |
  | `notification` | one user | adds to bell + toast |
  | `import-progress` / `bulk-progress` | the starter | moves the progress card |
- **Events never carry data**, only a topic; the client refetches through the API. Permissions stay in one place.
- `server.ts` announces writes automatically; background code calls `broadcastChange(orgId, topic)`.
- `notify(recipients, { organizationId, actorId, type, title, body?, link? })` **saves first, then pushes**
  (skips the actor). Types: `LEAD_ASSIGNED, DEAL_ASSIGNED, TASK_ASSIGNED, ACTIVITY_INVITED, MENTIONED,
  REMINDER, IMPORT_FINISHED, EMAIL_OPENED, EMAIL_FAILED, AUTOMATION, LOGGED_IN_AS, BILLING`.
- **Reminders**: a 30 s loop (only while someone is connected, so a free DB can sleep) notifies people 10 minutes before calls/meetings, claimed atomically via
  `reminderSentAt`. At the start time the **browser** opens a popup (1 s clock check, chime).
- The tab that makes a change also hears its own `changed` (keeps its other views current).

---

## 9. Background jobs, see docs/QUEUES.md

| Queue | Work |
|---|---|
| `imports` | CSV import in batches; each batch saves rows **and** progress counters in one transaction → retries resume exactly |
| `bulk` | delete / move / assign / restore thousands, in batches (≤200 records are done in the request instead) |
| `emails` | SMTP send, 4 tries (10/20/40 s backoff), then "Not sent" + sender notified |
| `automations` | match rules → act → log |
| `demo` | nightly demo rebuild |

Rules: **jobs carry only ids**; Postgres is the source of truth; Redis never is. Rate limits (sign-in,
forms per visitor, webhooks per link, imports, bulk, email 100/person/day) **fail open** if Redis is down.
CSV export is **streamed** (pages by id), not queued.

---

## 10. Features (what's built)

**Records**
- Leads: table + kanban by stage, filters (multi-stage, source, owner, created/modified by and date,
  custom fields, possible duplicates), saved views, inline edit, bulk stage/assign/edit/merge/delete,
  "select all N matching", side panel with timeline, notes, tasks, activities, emails.
- Convert lead → deal (lead moves to "converted" stage). Deals: amount, probability, expected close,
  pipeline value per column, contact info from its lead.
- Contacts (one per person, deduped by phone); Companies (auto-filed from lead company names, company picker everywhere).
- **Duplicates**: one open lead per person (phone or email), 409 with a link to the existing one;
  warning while typing; merge for leads and deals (pick winning values, history moves over).
- **Lost reasons** asked whenever something moves to a lost stage (fixed list + Other).
- **Custom fields** (text, number, date, yes/no, dropdown, team member), filterable, inline editable.
- **Activity history**: every field edit leaves "changed X from A to B" on the timeline.
- **Products & quotes**: catalogue with price + tax; deal lines copy price/tax; deal amount = lines total;
  printable quote `/quote/<dealId>`.
- **Recycle bin**: delete = copy into `DeletedRecord` then real delete (one transaction); restore with
  same ids for 30 days; bulk restore/delete forever/empty bin.
- Workspace **currency** (display only, 14 currencies).

**Work**: Tasks (due, priority, status) and Activities (calls/meetings with attendees, reschedule),
list + kanban + **calendar** (month/week); Notes feed with @mentions; **My day** page (overdue/today
tasks, today's calls, leads waiting for first contact, deals closing this week; top 5 + totals).

**Lead capture**
- **Web forms**: builder, hosted page `/f/<key>`, HTML embed, JSON endpoint; honeypot + rate limit;
  answers into real custom fields; returning lead only fills empty fields.
- **Integrations**: `LeadForm` with `kind = WEBHOOK`; private link `/api/public/leads/<key>` (rotatable);
  reads plain JSON, Google Ads and IndiaMART shapes (`toSubmission`); delivery log; test button.
- Everything goes through `captureLead()`: duplicate check → owner or **round-robin** (atomic DB
  `increment`) → "Reply to …" task due today → automations.
- **UTM campaigns** → revenue per campaign on the dashboard.
- **CSV import**: column mapping with guesses, **check first** (`/api/imports/check` runs every row
  through the same rules, shows what will happen, fixes per problem group), background job, problem
  rows downloadable. **CSV export** of leads, deals, contacts with every field, formula-injection safe.

**Automations** (`docs/AUTOMATIONS.md`): When → If → Then.
- 7 triggers: lead added / moves stage / lost; deal created / moves stage / won / lost.
- Conditions: source, campaign, form, owner, stage, amount, lost reason, custom fields; operators
  is, is not, contains, more than, less than, empty, filled in.
- Actions: assign (one or round-robin), send template, create task, notify, move to stage.
- Safety: unique `(ruleId, eventKey)` claim before acting (retries never double-send); actions don't
  trigger rules; imports don't trigger rules; stage events once per record per stage; a job does
  nothing if the record moved on; saving never depends on rules (Redis down → lead still saves);
  failures logged with a reason.

**Email & WhatsApp** (`docs/EMAIL.md`)
- One **team mailbox** per workspace, connected by an admin in Settings → Workspace (address + app
  password, verified by logging in, AES-256-GCM encrypted, key derived from `JWT_SECRET`, never sent
  to the browser). Everyone sends from it as "Name (Company)". No personal mailboxes.
- Queued sending, live status (Sending → Sent / Not sent → Opened), open-tracking pixel with random token.
- Templates with `{{lead.firstName}}`, `{{deal.amount}}`, `{{me.name}}`, `{{workspace.name}}`, filled **in the browser**.
- WhatsApp: `wa.me` link with template text, noted on the timeline (no API).

**Insight**: dashboard (`/api/dashboard?range=&agentId=&pipelineId=&timeZone=`, browser's time zone for days, filters in the page URL, parallel `groupBy`/`aggregate`): revenue won
+ trend, open pipeline, weighted forecast, win rate, avg deal, days to close, closing soon, lead funnel,
source & campaign performance, lost reasons, team table (drill into an agent). ⌘K search over
leads, deals, contacts, tasks, activities (trigram indexes).

**Platform**: multi-tenant, roles, billing, site admin, log in as, demo mode, notifications bell,
mobile layouts (sidebar drawer, stacked panels), SEO (robots, sitemap, per-page metadata, OG image).

**Marketing site**: landing page (Twenty layout + Attio-style footer/quote, pill buttons, three.js
halftone objects, GSAP pinned sections, Lenis scroll), product page (glass logo + orbiting features,
real screenshots), pricing, Book a demo, privacy, terms, 404.

---

## 11. Frontend patterns

- **React Query owns server data.** Keys start with the resource (`["leads", filters]`, `["lead", 12]`),
  so invalidating `["leads"]` refreshes every lead view. `staleTime` 5 min; `staleTimes.dynamic` 30 s.
- **Page state lives in the URL** (`useUrlState`, `useListQuery`): view, filters, page, open record
  (`?open=12`). Refresh, Back and shared links restore the screen. Last view remembered per page.
- Lists page on the server (25/50/100); boards load 25 cards per column with "Load more".
- Record panels (`LeadPanel`, `DealPanel`, `ContactPanel`) open via `?open=<id>`.
- **Dropdowns float in a portal** so `overflow: hidden` parents can't clip them; inside native
  `<dialog>` (Modal, SidePanel) use lists of buttons instead.
- Mobile below 768px: ☰ drawer, sideways-scrolling toolbars, one-column panels, `h-dvh`.
- **Design**: light only, twenty.com style; tokens (`--color-accent: #4a38f5`, `ink`, `muted`, `faint`,
  `line`, …) in `globals.css`. Onboarding is the one dark/3D exception. List actions (Import/Export)
  sit in the toolbar with Search/Filter/Sort/Options, not the page header.
- **Animation**: transform and opacity only, expand/collapse feel, respect reduced motion; WebGL
  canvases release their context on unmount.

---

## 12. Testing

- `tests/integration/*.test.ts` call the real route handlers against real Postgres (`crm_test`).
  Each test makes its own workspace (`createOrgWithUser`) and cleans up. `getCurrentUser` is mocked to choose who's signed in.
- They prove: workspace isolation, own-vs-all permissions, duplicate refusal and merge, automation
  retries never double-send, import resume, webhook payload parsing, open tracking, payments
  (genuine once; wrong amount / other workspace / forged webhook refused), recycle bin, log in as, etc.
- Setup: `createdb crm_test`, then
  `DATABASE_URL="postgresql://localhost:5432/crm_test" npx prisma migrate deploy --config prisma7.config.ts`, then `npm test`.

---

## 13. Rules the code depends on (don't break these)

1. Every query on business data includes the workspace scope helper. Never hand-write `organizationId` filters in routes.
2. Out-of-scope record → 404, not 403.
3. Socket events carry topics, never data.
4. Jobs carry ids only; state in Postgres; anything with side effects claims a unique row before acting.
5. Saving a record never depends on Redis, rules or email succeeding.
6. Route files export only HTTP handlers; logic goes in `src/lib`.
7. One Zod schema per action, shared by form and route.
8. Duplicate match keys come from the DB trigger; don't compute them in app code.
9. Recycle bin is copy-then-delete, **not** soft delete (no `deletedAt` filters anywhere).
10. Prices only in `src/lib/billing/plans.ts`; never trust amounts from the browser.
11. Quote lines copy product price/tax at the time added.
12. Rate limits fail open.
13. Comments explain *why*, in plain words.

---

## 14. Known gaps and what's next

- Next candidates: "wait N days, then…" automation steps; speed-to-lead alerts (delayed job);
  booking link (pick a slot → lead + meeting); Facebook/Instagram Lead Ads built in; calendar
  drag-to-reschedule + ICS feed; presence ("Priya is viewing").
- Gaps: moving lost leads back to open **in bulk** doesn't check duplicates; a few old lint errors;
  JWT sessions can't be revoked (no session table); some comments still describe per-person
  mailboxes (`src/lib/emails/send.ts` header, `EmailAccount` comment in `schema.prisma`, `.env.example`).
- Agent "deactivation" was deliberately deferred (it confused the owner); explain simply before revisiting.

---

## 15. Working with the owner

- Background: MERN developer (Express + Mongo + React), learning Next.js auth, Postgres/SQL, Redis,
  Socket.IO and React Query through this project. Explain new ideas by mapping to Express/Mongoose.
- **The owner writes most code by hand.** Default to explaining and reviewing; generate code only when asked.
- **Keep it minimal**: simple, readable code, no extra files or abstractions. "Production grade" means clean, not feature-complete.
- **Never commit or push** unless asked in that message; offer a commit message instead.
- **Keep docs updated** with every feature: `docs/PROJECT.md`, `ARCHITECTURE.md`, `REALTIME.md` (and this file).
- **Don't open a browser / Playwright** unless asked that turn.
- UI work: check the 1-row case, make sure menus are really visible (no dropdowns inside `overflow-hidden`),
  ship small slices, ask for a reference before redesigning something they called bad.
- UI reference: the Twenty CRM (twenty.com) look. No fake customer testimonials on the marketing site.

---

## 16. More detail

| Doc | Covers |
|---|---|
| `README.md` | public overview, "hard parts", diagrams, deploy steps |
| `docs/PROJECT.md` | full feature checklist with dates, and the **decisions log** (why each choice) |
| `docs/ARCHITECTURE.md` | request lifecycle, folders, how each feature works |
| `docs/REALTIME.md` | Socket.IO auth, flows, notifications, reminders |
| `docs/QUEUES.md` | Redis, BullMQ, imports, bulk jobs, rate limits |
| `docs/AUTOMATIONS.md` | triggers, conditions, actions, safety |
| `docs/EMAIL.md` | team mailbox, sending, tracking, templates, WhatsApp |
| `docs/INTEGRATIONS.md` | webhook payloads and capture |
| `prisma/schema.prisma` | every model, commented |
