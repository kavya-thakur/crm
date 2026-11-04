# Flash: project overview

Flash is a multi-tenant sales CRM: each company signs up for its own workspace, and its
team works leads → deals, with contacts, tasks, calls/meetings, notes, a dashboard and live
updates. It's a portfolio project, built to be clean and production-minded rather than
feature-for-feature with Salesforce.

**Docs:** this file (what, why, status) · [ARCHITECTURE.md](ARCHITECTURE.md) (how it's
built, folder structure, how each feature works) · [REALTIME.md](REALTIME.md) (Socket.IO) ·
[QUEUES.md](QUEUES.md) (Redis, background jobs, rate limits).
They're updated whenever a feature lands.

_Last updated: 2026-11-02_

---

## 1. Stack, and why

| Layer | Choice | Why |
|---|---|---|
| App | **Next.js 16** (App Router), React 19, TypeScript | one codebase for pages and API; server components check permissions before anything renders. This Next version has breaking changes, so the docs in `node_modules/next/dist/docs` come first |
| Server | **`server.ts`**: Next.js + **Socket.IO** + the queue worker on one Node process | route handlers can't keep WebSockets open; one process lets routes push events directly ([REALTIME.md](REALTIME.md)) |
| Jobs & limits | **Redis** + **BullMQ** | CSV imports run in the background with retries and live progress; rate limits shared and kept across restarts ([QUEUES.md](QUEUES.md)) |
| Database | **PostgreSQL** + **Prisma 7** (pg driver adapter) | relational data (workspaces, roles, records, timelines), JSONB for custom fields, `pg_trgm` for fast search, triggers where they keep data honest |
| Auth | JWT in an **httpOnly cookie** (`access_token`, 1 day), bcrypt passwords | simple, no third party; the same cookie authenticates the socket |
| Validation | **zod 4**, shared by forms (react-hook-form) and routes | one set of rules on both sides |
| Data fetching | **React Query** + axios | caching, paging (`useInfiniteQuery`), and one-line refetches for live updates |
| UI | **Tailwind v4**, Tabler icons, sonner toasts, **GSAP** (motion), three.js (onboarding) | light, Twenty-style design; tokens in `globals.css` |
| Tests | **Vitest** integration tests against a real Postgres | tests the real routes and queries, not mocks |

---

## 2. Running it

```bash
brew install redis && brew services start redis   # Redis, for the job queue and rate limits
cp .env.example .env              # DATABASE_URL, JWT_SECRET, REDIS_URL (+ optional DEMO_FORM_KEY)
npm install
npx prisma migrate deploy --config prisma7.config.ts
npx prisma generate --config prisma7.config.ts
npx tsx prisma/seed.ts            # permissions + default stages
npm run dev                       # Next.js + Socket.IO on http://localhost:3000
```

- `npm run db:demo` builds a demo workspace with 18 months of activity (sign in as
  `demo@flash-demo.dev` / `demo1234`). `DEMO_SCALE=25 npm run db:demo` makes it 25× bigger.
- `npm test` runs the integration tests (migrate `crm_test` first; see ARCHITECTURE §9).
- **After changing `schema.prisma`:** create the migration, run `prisma generate`, apply it to
  `crm_test`, and **restart `npm run dev`**. The running server holds the old Prisma client.
- Use `npm run dev`, not `next dev`: only `server.ts` has Socket.IO.

---

## 3. What's built

### Core CRM
- [x] Workspaces (sign up creates one, with an Admin role), members, invite by creating accounts
- [x] Roles & permissions, built in Settings as checkboxes; "own records" vs "everyone's"
- [x] **Leads**: table + kanban by stage, filters (multi-stage, source, owner, created/modified
      by and date, custom fields, possible duplicates), saved filters, inline edit, bulk
      stage/assign/edit/merge/delete, side panel with timeline, notes, tasks, activities
- [x] **Deals**: the same, with amount, probability, expected close, pipeline value per column
- [x] **Contacts**: every lead gets one; deduplicated by phone
- [x] Convert lead → deal
- [x] **Tasks** (to-do with due date, priority, status, completion time) and **activities**
      (calls/meetings at a time, with attendees), both with list + kanban, linked to a record
- [x] **Notes** with @mentions, and a notes feed
- [x] **Custom fields** per record type (text, number, date, select, ...), filterable, inline editable
- [x] Stages and sources editor (one settings page), with won/lost/converted flags
- [x] Global **⌘K search** with previews
- [x] Profile (name, password)

### Selling better
- [x] **Dashboard**: revenue won and trend, win rate, weighted pipeline, closing soon, lead
      funnel, **team performance table** (who's doing well), **source performance**
      (leads → conversion → revenue), **campaign performance** (the same per ad campaign), **lost reasons**, my tasks and upcoming calls, filters by
      period and agent
- [x] **Web forms**: embed on any site; leads arrive with source, owner and a reply task;
      spam trap and rate limit; **round-robin** assignment; Book a demo page on the marketing site
- [x] **Form builder + hosted form page**: set the title, intro, button, thank-you message or
      redirect, which built-in fields are required/optional/off, and which **lead custom fields**
      to ask; each form has its own shareable page (`/f/<key>`) for social bios, WhatsApp and QR
      codes; answers are saved into the lead's real custom fields
- [x] **Campaign tracking (UTM tags)**: `?utm_campaign=…` on the link to a form's page (or the
      site page an embedded form sits on) is saved on the lead; shown on the lead, as a list
      column and in exports; the dashboard shows each campaign's leads, conversions and revenue won
- [x] **Lead integrations (webhooks)**: a private link per tool (Google Ads lead forms, IndiaMART,
      Facebook/Typeform/Sheets via Zapier, Make or Pabbly, or any code); leads go through the same
      rules as web forms; a log of what arrived and why anything was rejected; test button; new
      link on demand. See [INTEGRATIONS.md](INTEGRATIONS.md)
- [x] `/api/health` for the host's health check and a free uptime ping (keeps a sleeping free server awake)
- [x] **Lost reasons** asked when anything moves to a lost stage
- [x] **Duplicates**: one open lead per person (enforced), warning while typing, "possible
      duplicates" filter, **merge** for leads and deals

### Data in and out
- [x] **CSV import** of leads (Leads → Import ▾, which also has Export and a sample CSV built from the
      workspace's own fields): column mapping with automatic guesses (incl. every custom field;
      teammates by name or email for "Assigned to" and Agent fields), defaults
      for stage/source/owner, preview, background job (BullMQ on Redis) with live progress, retries
      that resume where they stopped, duplicate checks, and a downloadable file of rows not added
- [x] **CSV export** of leads, deals and contacts: streamed, follows the filters on screen,
      safe against spreadsheet formula injection, re-importable
- [x] **Bulk actions on thousands** (leads, deals, contacts): "select all N matching" the filters,
      then delete, move to a stage or assign as a background job in batches, with a progress card
      on every page (up to 200 stay instant; both paths run the same code)
- [x] **Rate limits** on Redis: web forms, sign-in attempts, imports, big bulk actions

### Real time
- [x] Socket.IO: other people's changes appear live on every list, board, panel and dashboard
- [x] **Notifications** with a bell: assigned a lead/deal/task, added to a meeting, @mentioned,
      new web form lead
- [x] **Reminders** 10 minutes before calls and meetings, and a **popup in the middle of the
      screen at the start time** on any page (chime; mark done, reschedule, open)
- [x] **Reschedule** an activity: the When pencil in the list and on board cards, or one click in its panel and the start-time popup (in 10/30/60 minutes, tomorrow same time, or any time)

### Automations
- [x] **When → If → Then rules** on every new lead (by hand, web form or integration): conditions on
      source, where it came in, campaign, owner or any custom field; actions: assign (one person or
      taking turns), send an email template, add a task. Run in the background, in order, with a
      log of what each rule did. See [AUTOMATIONS.md](AUTOMATIONS.md)
- [x] Safe by design: never runs twice for one lead (retries), rules can't trigger rules, imports
      don't trigger them, a broken step stops with a clear reason

### Email
- [x] **Email from a lead, deal or contact** (its Emails tab): sent through a queue over free SMTP (Gmail),
      replies go to the sender's own inbox, status live (Sending → Sent / Not sent → Opened),
      logged on the timeline. See [EMAIL.md](EMAIL.md)
- [x] **Email templates** with placeholders (`{{lead.firstName}}`, `{{me.name}}`...), filled in as
      you pick one; three starters for a new workspace
- [x] **Open tracking**: "Rahul opened your email" in the bell, live
- [x] Demo workspace never really sends (marked "Demo, not delivered"); 100 emails per person a day

### Live demo
- [x] **One-click demo**: "Explore as a manager / as a sales agent" on the login page (and a link
      under the landing page's hero): `/api/auth/demo?as=manager|agent`, no sign-up
- [x] A card in the demo's sidebar: who you're exploring as, "resets every night", switch view,
      create your own workspace
- [x] Locked in the demo: password, profile, members and roles (everything else is open to try)
- [x] **Nightly reset**: a BullMQ job scheduler rebuilds the demo workspace at 3:00 AM IST

### Site
- [x] Marketing landing page (Flash), product page (/product), pricing, /demo, privacy policy and terms (/privacy, /terms)
- [x] Product page: a glass Flash logo (a hand-written glass shader on the extruded logo bars) with every feature
      orbiting it on two rings, then six feature groups (capture, pipeline, follow-ups, email, team, at scale), each
      with real demo-workspace screenshots (`public/product`) or app-style pictures, and the app's own cards floating
      in front in 3D
- [x] Landing page 3D: halftone shapes, the untangling knot, a team swarm behind the quote, a spotlight on the
      pricing plans, an orb in the FAQ; every WebGL canvas hands its context back on unmount (browsers allow ~16)
- [x] 404 page in the landing look; link-preview image (`src/app/opengraph-image.tsx`, fonts in `assets/fonts`, site address from `APP_URL`): the real dashboard on a violet panel
- [x] Basic SEO: `robots.txt` (keeps crawlers out of `/api/`) and `sitemap.xml` (`src/app/robots.ts`, `sitemap.ts`); every public page gets its title, description, canonical address and link preview from `pageMetadata()` in `(marketing)/metadata.ts`; the app stays noindex
- [x] Onboarding intro

### Engineering
- [x] 126 integration tests across 25 files; CI with Postgres
- [x] Large-data checked: 10k+ leads, lists and boards in tens of milliseconds (indexes, paging)

---

## 4. What's next (candidates, roughly in order)

1. **Speed-to-lead rule**: alert the owner (then their manager) if a new lead isn't contacted in X hours (a delayed job)
2. **Booking link**: a public page where a visitor picks a free slot → lead + meeting
3. Products & quotes on deals
4. README for the repo, and deployment (Railway/Render, since the custom server needs a long-running Node process)
5. Presence ("Priya is viewing this lead"), email for missed notifications

Known gaps: moving lost leads back to open **in bulk** doesn't check for duplicates yet;
11 old lint errors remain (none in new code).

---

## 5. Decisions log

Newest first. The reason matters more than the choice.

| Date | Decision | Why |
|---|---|---|
| 2026-11-03 | **Lenis** smooth scrolling on the marketing pages (not GSAP's ScrollSmoother) | a mouse wheel jumps ~100px a notch, so scroll-linked text animations stepped; Lenis keeps native scrolling, so `position: sticky` (nav, quote, steps) still works, which ScrollSmoother breaks |
| 2026-11-03 | Automations run from a **queue after the save**, and only if the workspace has a rule | saving a lead never waits on or fails because of a rule; no jobs at all for workspaces without rules |
| 2026-11-03 | **One run per rule per lead**, claimed with a unique row before acting | BullMQ retries a failed job; without this a retry would send a second email |
| 2026-11-03 | **Actions don't trigger rules**; **imports don't trigger rules** (for now) | no loops between rules; a big import can't send thousands of emails by surprise |
| 2026-11-03 | Rule conditions and actions as **JSON checked by Zod**, not tables per action | a new action type needs no migration; same approach as web form settings |
| 2026-11-03 | **Campaign and Lost reason columns hidden by default** (turn on in Options) | empty for most records; the data still feeds the dashboard. A column added later starts hidden for people with saved column settings too |
| 2026-11-03 | A new integration gets a **source of its own name**, created if missing; a new web form starts as "Website" | its leads are told apart in filters and on the source card from the first lead, with no setup step |
| 2026-11-03 | A lead integration is a **`LeadForm` with `kind = WEBHOOK`**, not a new model | the same source, owner, rotation and capture rules for free; only the payload reader and a delivery log are new |
| 2026-11-03 | One webhook that **reads many payload shapes** (plain JSON, Google Ads, IndiaMART) instead of a connector per tool | one small feature covers dozens of tools through Zapier/Make/Pabbly; field names matched like the CSV import |
| 2026-11-03 | Email over **SMTP via Nodemailer**, from **one Gmail account** with Reply-To = the sender | free with no domain, lands in inboxes; switching to Resend/Brevo is only .env; per-user Gmail sign-in (OAuth) needs Google's app review |
| 2026-11-03 | Emails are **queued** (BullMQ), placeholders filled **in the browser** | sending never makes anyone wait and retries itself; the sender sees and can edit the exact text before it goes |
| 2026-11-03 | **View, filters and the open record live in the URL**, not page memory or browser storage | they survive a refresh, Back works, links can be shared, and the server sees them too (no flash of the wrong view) |
| 2026-11-03 | Demo login is a **plain link** (`GET /api/auth/demo`), into the demo workspace only | works from the landing page, the login page and a README; it can only ever sign in as the demo's two fixed people |
| 2026-11-03 | The demo is **rebuilt from scratch nightly** by a BullMQ job scheduler, rather than undoing changes | always the same clean demo whatever visitors did; the schedule lives in Redis, so it runs once even with several servers |
| 2026-11-03 | In the demo, only **password, profile, members and roles** are locked | visitors should be able to try everything; only changes that would break it for the next visitor are blocked |
| 2026-11-02 | `src/lib` **grouped into folders by purpose** (auth, db, api, realtime, jobs, leads, deals, work, settings, dashboard, utils, validations) | 30 loose files were hard to find your way around; a folder's name now says what's inside |
| 2026-11-02 | **Redis + BullMQ** for background jobs (over a Postgres-backed queue) | the standard Node stack; also gives delayed/repeatable jobs and shared rate limits; worth learning |
| 2026-11-02 | Jobs carry **only ids**; imports save each batch **with its counters in one transaction** | Redis is never the source of truth; a retried job resumes exactly where it stopped, importing nothing twice |
| 2026-11-02 | Big bulk deletes **snapshot the ids** and run as a job; up to 200 stay instant | "all matching" means what was matching when you clicked; small deletes don't need a queue's overhead |
| 2026-11-02 | The worker runs **inside `server.ts`** for now | one command, one deploy; it can move to its own process with no other change |
| 2026-11-02 | Rate limits **fail open** when Redis is down | an unlimited form for a minute beats a site that's down because of its limiter |
| 2026-11-02 | Export is **streamed, not queued** | memory stays flat and the download starts at once; a queue only pays off at far larger sizes |
| 2026-11-02 | Web form setup in **one `settings` JSON column** with zod defaults | old forms keep working with no data change; the builder, the hosted page, the embed code and the endpoint all read it through `readFormSettings()` |
| 2026-11-02 | Name and phone are **always** on a form; email/company/message can be required, optional or off | every lead and its contact need a name and phone (duplicates are matched on them) |
| 2026-11-02 | Form answers go into the lead's **real custom fields**; a returning lead only gets its **empty** fields filled | filterable and reportable, and a second submission never overwrites what sales already knows |
| 2026-11-02 | Custom field **names saved capitalized** ("Collaborator"); the stored key and select options never change | a name is a heading; the key and option text are what saved values point at, so changing them would disconnect data |
| 2026-11-02 | **Socket.IO in the same process as Next.js** (`server.ts`), not a separate service | routes can `notify()` directly; one thing to run. Separate service + Redis adapter later if it ever needs more than one server |
| 2026-11-02 | Live updates send **only the topic** ("leads"), never data; clients refetch | permissions stay in one place (the API); nothing can leak over the socket; no per-route code (one hook in `server.ts`) |
| 2026-11-02 | Notifications are **saved, then pushed** | the bell survives reloads and works for people who were offline |
| 2026-11-03 | The start-time popup is **timed in the browser**, not pushed by the server | a 1-second clock check is exact to the second; a server push would need a job per activity or a tighter loop; the server reminder (toast + bell) still covers people not in the app |
| 2026-11-02 | Reminders by a 30-second loop with an **atomic claim** (`reminderSentAt`) | no extra job system; never double-sends |
| 2026-11-02 | **One open lead per person** (by phone or email); returning after lost/converted is allowed | two reps shouldn't chase one customer; a returning customer is a new opportunity |
| 2026-11-02 | Phone/email match keys kept by a **database trigger** | every write path (API, web forms, imports, scripts) stays correct without remembering to |
| 2026-11-02 | **Merge** kept as a cleanup tool (one-line suggestion, filter, select two) | blocking stops new duplicates; old and imported ones still need fixing |
| 2026-11-02 | Lost reasons from a **fixed list + "Other"** | comparable numbers on the dashboard; free text for the rest |
| 2026-11-03 | UTM tags saved as **three plain columns on Lead**, not a Campaign table; **first touch wins** | campaigns are named by whoever writes the ad link, so there's nothing to set up; the campaign that first brought someone in keeps the credit for their revenue |
| 2026-11-02 | Web form round-robin with a **database counter** (`increment`) | two leads arriving together never get the same person |
| 2026-11-01 | Dropdowns float in a portal; **inside dialogs, lists of buttons** | native dialogs clip floating menus |
| 2026-11-01 | Bulk edit is a **side panel**, like record panels | consistency, and no clipped menus |
| 2026-11-01 | Boards page **25 cards per column**, lists 50 per page | stays fast with thousands of records |
| 2026-10-25 | Product name **Flash** | |
| 2026-10 | **Light-only, Twenty-style** UI (dashboard has its own look) | a calm, modern CRM look; one theme done well |
| 2026-10 | Agent "deactivation" deferred | confusing to explain; revisit with a clear design |
| 2026-10 | Integration tests on a real database, not mocks | the queries and permissions *are* the product |
