# Redis, background jobs and rate limits

How Flash does work that's too big for a web request (CSV imports), and how it limits
abuse (rate limits). Written to be learned from, like [REALTIME.md](REALTIME.md).

_Last updated: 2026-11-02_

---

## 1. Redis in one paragraph

Redis is a separate program, a database that keeps everything **in memory**, so reads and
writes take well under a millisecond. Like Postgres, it runs on its own (`brew services
start redis` locally, port 6379) and the app connects to it (`REDIS_URL`). It stores simple
things under string keys: numbers, lists, sorted sets... Flash uses it for two jobs where
*fast* and *shared between requests* matter more than *permanent*:

| | What's in Redis | Why Redis and not Postgres |
|---|---|---|
| **Job queue** (BullMQ) | which jobs are waiting, running, done, failed | workers wait on Redis for new jobs instantly, without polling a table |
| **Rate limits** | a counter per visitor/user, e.g. `ratelimit:login:1.2.3.4:a@b.com = 3` | thousands of tiny increments with automatic expiry; Postgres would be the wrong tool |

**Nothing in Redis is the source of truth.** Leads, imports and their progress live in
Postgres. If Redis were wiped, no data would be lost: rate-limit counters would reset, and
queued imports could be re-queued from their `ImportJob` rows.

---

## 2. Why a queue? (the CSV import)

Importing 20,000 rows inside one HTTP request would mean a browser waiting minutes and
timing out, no progress bar, a half-finished import if the server restarts, and everyone
else's requests slowed down meanwhile.

With a queue, the request only **hands the work over**:

```
Browser                 POST /api/imports                Redis (queue)           Worker (in server.ts)
  │ file + mapping ───►  check it, save ImportJob row
  │                      queue.add({ importJobId: 12 }) ──► waiting: [12]
  │ ◄── 201 { id: 12 }   (answers in milliseconds)                    ◄── takes job 12
  │                                                                       reads the CSV from Postgres
  │ ◄════════ Socket.IO "import-progress" (every 200 rows) ══════════════ imports 200 rows at a time
  │ ◄════════ notification "Import finished: 980 leads added" ═══════════ done
```

The words you'll meet:

- **Producer:** code that adds jobs (`importsQueue().add(...)` in `POST /api/imports`).
- **Queue:** the waiting line, kept in Redis under keys like `bull:imports:wait`.
- **Worker:** code that takes jobs off the queue and runs them (`startWorkers()`).
- **Job states:** waiting → active → completed, or failed (after its retries).
- **Concurrency:** how many jobs one worker runs at once (2 for imports).

In Express terms: the route is a normal `app.post(...)`, but instead of doing the work it
`push`es a task onto a list that a separate loop is processing. BullMQ is that list and that
loop, built properly: it survives restarts, retries failures, and never gives one job to
two workers.

---

## 3. How an import stays correct

**Only the id goes in the job.** `{ importJobId: 12 }`. The CSV, the mapping, the counts
and the problem rows are all in the `ImportJob` row in Postgres. Redis only says what to work on.

**Batches with their own bookkeeping.** `runImport` (`src/lib/jobs/leadImport.ts`) handles 200 rows
at a time. Each batch is **one database transaction** that creates its leads, contacts,
notes and timeline entries *and* moves the job's counters on (`processed`, `created`,
`skipped`, `failed`). Either the whole batch and its counts are saved, or neither is.

**Retries resume, never repeat.** If the server dies mid-import, the unfinished batch rolls
back. BullMQ sees the job never finished and hands it out again. The worker starts from
`processed`, the first row not yet saved, so no row is imported twice. A job gets
**4 attempts**, 10s → 20s → 40s apart (`defaultJobOptions` in `src/lib/jobs/queues.ts`).
After the last one, `failImport` marks it FAILED and tells its owner.

**The same rules as adding a lead by hand.** The same zod validation, the
one-open-lead-per-person check (against the database *and* earlier rows in the same file),
a contact for each new person, custom fields checked by type, and "your own leads only"
without `lead:all`. Rows that can't be added go into a "problems" CSV with the reason.

**Live progress.** After each batch the worker emits `import-progress` to the importer's
Socket.IO room. `LiveUpdates.tsx` writes it straight into the import page's React Query
cache, so the bar moves without refetching. Everyone's lead lists refresh as rows arrive.

---

## 4. Big bulk actions (deleting, moving, assigning thousands)

The same idea as imports, for "delete / move to Lost / assign to Priya all 4,230 leads that match
my filters". It works on leads, deals and contacts (contacts have no stages):

1. **Select all matching.** Ticking the header checkbox selects the rows loaded so far; a bar
   then offers *"Select all 4,230 matching leads"*. The page asks the list endpoint for every
   match's id (`GET /api/leads?format=ids` with the same filters, so the same permissions).
2. **Small or big?** Up to `INSTANT_BULK_LIMIT` (200) records are deleted in the request as
   before. More become a **BulkJob** row holding the ids, a *snapshot* of what was selected, so
   leads added a second later aren't swept up. Its id goes on the `bulk` queue.
3. **The worker** (`runBulkJob`, `src/lib/jobs/bulkActions.ts`) works 500 at a time. The functions
   that change a batch (`moveLeads`, `assignLeads`, `moveDeals`, `assignDeals`, `assignContacts`)
   are the *same ones* the bulk routes use for a small selection, so timeline entries, lost reasons
   and won/lost dates come out identical either way; an assignment sends one notification for the
   whole job. Each batch
   and the job's counters (`processed`, `affected`) are one transaction, so a retry resumes. It
   re-checks the person's permission (and that the stage or teammate still exists) first, and acts
   only within their scope, so records that became out of reach, were already deleted or were
   already that way are skipped, and `affected` says how many really changed.
4. **Progress anywhere.** Each batch emits `bulk-progress` to the person's room; a small card in
   the corner of every page (`BackgroundJobs.tsx`) shows *"Deleting 4,230 leads… 2,000 of 4,230"*.
   When it finishes there's a toast, and everyone's lists have been shrinking as it went.

## 5. Rate limits (`src/lib/api/rateLimit.ts`)

```ts
const count = await redis().incr("ratelimit:login:1.2.3.4:a@b.com");   // +1, creating it at 1
if (count === 1) await redis().pexpire(key, 15 * 60 * 1000);           // the window starts now
return count > 10;                                                    // the 11th try is refused
```

A **fixed window**: when the key expires, the count starts again. It's simple, and plenty
for stopping bots and password guessing.

| What | Limit | Key |
|---|---|---|
| Web form submissions | 5 per 10 min | visitor IP + form |
| Sign-in attempts | 10 per 15 min | visitor IP + email (so nobody can lock a real user out from elsewhere) |
| Starting imports | 10 per hour | user |
| Starting big bulk actions | 20 per hour | user |

**If Redis is down, limits let requests through** ("fail open"): better an unlimited form for a
minute than a site that's down because its rate limiter is. Commands give up after half a
second (`commandTimeout`).

---

## 6. Export doesn't use the queue

`GET /api/leads?format=csv` (and deals, contacts) **streams** the file: it reads 1,000 rows,
sends them, reads the next 1,000 (`id > last`, using the primary key's index), and so on. Memory
stays flat however big the list is, and the first bytes arrive at once, so there's nothing to
queue. It reuses the list's own `where`, so the file has exactly the filters and permissions
that are on screen. Cells are protected against formula injection (`'=HYPERLINK(...)`).

A queued export (build the file in the background, notify with a link) only becomes worth it
at hundreds of thousands of rows.

---

## 7. Files

| File | What it does |
|---|---|
| `src/lib/db/redis.ts` | The Redis connections: one shared for commands, one per BullMQ queue/worker |
| `src/lib/jobs/queues.ts` | The queues (`importsQueue()`) and their retry settings |
| `src/lib/jobs/worker.ts` | `startWorkers()`: runs jobs, marks failed ones; started by `server.ts` |
| `src/lib/jobs/leadImport.ts` | `runImport()` / `failImport()`: the import itself, batch by batch |
| `src/lib/jobs/bulkActions.ts` | `runBulkJob()` / `failBulkJob()`: big bulk deletes, batch by batch |
| `src/app/api/bulk-jobs/route.ts` | Start a bulk job; list your running ones |
| `src/app/(dashboard)/BackgroundJobs.tsx` | The progress card in the corner |
| `src/lib/validations/imports.ts` | Import fields, column guessing, file limits (shared with the browser) |
| `src/lib/api/csvExport.ts` | Streamed CSV exports |
| `src/lib/api/rateLimit.ts` | `tooManyAttempts()` |
| `src/app/api/imports/...` | Start an import, read one, list recent ones, download its problem rows |
| `src/app/(dashboard)/leads/import/` | The import screen: pick → map columns → progress |
| `prisma/schema.prisma` → `ImportJob` | An import's file, mapping, counts and problem rows |
| `tests/integration/imports.test.ts`, `bulkJobs.test.ts`, `rateLimit.test.ts` | Tests (the queue is replaced by a stand-in; the job functions are called directly) |

---

## 8. Looking inside Redis

```bash
redis-cli ping                                    # PONG = it's running
redis-cli --scan --pattern 'bull:imports:*'       # everything BullMQ keeps for the imports queue
redis-cli --scan --pattern 'bull:bulk:*'          # ...and for big bulk actions
redis-cli LRANGE bull:imports:wait 0 -1           # job ids waiting
redis-cli ZRANGE bull:imports:completed 0 -1      # recently finished job ids
redis-cli HGETALL bull:imports:import-12          # one job: its data, attempts, failure reason
redis-cli --scan --pattern 'ratelimit:*'          # live rate-limit counters
redis-cli TTL ratelimit:login:unknown:johndoe@flash-demo.dev   # seconds until that window resets
```

---

## 9. Adding another kind of job

1. Add a queue in `queues.ts` (`emailsQueue()`), with its own retry settings.
2. Write the job's function in `src/lib/` (save state in Postgres, so it can resume).
3. Start a `Worker` for it in `startWorkers()`.
4. Add jobs from the routes with only ids in the data.

The **nightly demo reset** is one: a job *scheduler* (`upsertJobScheduler` in `startWorkers`,
cron `0 3 * * *` in Asia/Kolkata) adds a job to the `demo` queue every night, and its worker runs
`buildDemoWorkspace()`. Look at it with `redis-cli --scan --pattern 'bull:demo:*'`.

**Emails** are another: `POST /api/emails` saves the email and adds `{ emailId }` to the `emails`
queue; the worker's `sendEmail()` sends it over SMTP, and after 4 failed tries `failEmail()`
marks it failed and tells the sender. See [EMAIL.md](EMAIL.md).

**Automations** too: saving, moving, winning or losing a lead or deal adds
`{ trigger, organizationId, leadId | dealId, stageId? }` to the `automations` queue (only for
triggers the workspace has a rule for), and the worker runs the rules. A retry never repeats a rule
for the same event (a unique run row is claimed first). A bulk job queues its batch's events after
the batch is saved, so the worker never reads the old stage. See [AUTOMATIONS.md](AUTOMATIONS.md).

Good next candidates: **speed-to-lead alerts**
(a delayed job: "in 2 hours, check whether this lead was contacted"), and moving meeting
**reminders** from the 30-second loop to delayed jobs at the exact minute.

---

## 10. Running it elsewhere

- **More capacity:** move the worker into its own process (`tsx worker.ts` calling
  `startWorkers()`) and run as many as needed. Nothing else changes: the queue in Redis sits
  between the website and the workers.
- **Deploying:** set `REDIS_URL`. Use a Redis that keeps a persistent connection and doesn't
  bill per command: BullMQ talks to Redis constantly even when idle, which burns per-request
  free tiers. Redis on Railway, or Render's Key Value, are fine.
