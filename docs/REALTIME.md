# Real time (Socket.IO)

How Flash pushes changes and notifications to the browser the moment they happen. Written
to be learned from: each idea is introduced before it's used, with the Express version
alongside where it helps.

_Last updated: 2026-11-02_

---

## 1. What "real time" means here

Two different things, built on the same connection:

| | "Something changed" | Notifications |
|---|---|---|
| **Example** | Priya moves a deal to Won; Aarav's deals board updates without a reload | Ananya assigns Priya a lead; Priya's bell goes to 1 and a toast pops up |
| **Who gets it** | everyone signed in to the same workspace (except the tab that made the change) | one person |
| **What's sent** | just a word: `{ topic: "deals" }` | the notification itself (title, body, link) |
| **Saved?** | no, it's only a nudge to refetch | yes, a `Notification` row, so the bell survives a reload |

Plus **reminders**: 10 minutes before a call or meeting, everyone on it gets a notification.

---

## 2. Socket.IO in five ideas

If you've used Express, this is the part that's new.

1. **A connection that stays open.** HTTP is ask → answer → done. A socket stays open, so
   the *server* can speak first ("this changed") without the browser asking.
2. **Events.** Both sides send named messages: `socket.emit("changed", { topic: "leads" })`
   on one side, `socket.on("changed", handler)` on the other. It's like `app.post("/x", handler)`,
   but it can go either way.
3. **Middleware.** `io.use((socket, next) => ...)` runs once when a browser connects, just
   like `app.use((req, res, next) => ...)`. That's where we check who's logged in.
4. **Rooms.** A room is a named group of connections, kept by the server. `socket.join("org:5")`
   puts a connection in it; `io.to("org:5").emit(...)` sends to everyone in it. The browser
   never sees or chooses rooms; the server decides.
5. **Reconnects.** If the wifi drops, the client reconnects by itself. Anything sent while
   it was away is lost, so after a reconnect we refetch everything once.

---

## 3. The big picture

```
                         ONE Node process (server.ts), port 3000
 ┌─────────────────────────────────────────────────────────────────────────────┐
 │                                                                             │
 │   http.createServer ──► Next.js handler (pages + /api routes)              │
 │        │                     │                                              │
 │        │                     │ route calls notify(...)  ──────┐             │
 │        │                     ▼                                ▼             │
 │        │              res "finish" ──► announceChange ──► Socket.IO server   │
 │        │                                                (rooms: org:5,      │
 │        └── /socket.io/ upgrade ────────────────────────► user:12, ...)      │
 │                                                                │            │
 │   setInterval(sendReminders, 30s) ── notify(...) ──────────────┘            │
 └─────────────────────────────────────────────────────────────────────────────┘
                                      │  WebSocket
                                      ▼
            Browser tab: <LiveUpdates /> (one socket per tab) + <NotificationBell />
```

### Why a custom server?

Next.js route handlers answer a request and finish. They can't hold a WebSocket open. So
`server.ts` creates the HTTP server itself, gives normal requests to Next.js, and attaches
Socket.IO to the **same** server. That's exactly the Express pattern:

```js
// Express                                 // Flash (server.ts)
const app = express();                     const handle = next({ dev }).getRequestHandler();
const server = http.createServer(app);     const httpServer = createServer((req, res) => handle(req, res));
const io = new Server(server);             startRealtime(httpServer);   // new Server(httpServer) inside
server.listen(3000);                       httpServer.listen(3000);
```

`npm run dev` runs `tsx server.ts` (not `next dev`), compiling it as it goes. For production,
`npm run build` also compiles it once into `dist/server.cjs` (esbuild, `build:server`), and
`npm start` runs that with plain Node: on Render's free CPU it starts about twice as fast and
uses about 90 MB less memory (measured: 320 → 229 MB) than compiling at every start. **Only one** of them can run per project folder; there's no separate socket terminal.

**Trade-off we accepted:** a custom server can't be deployed to Vercel's serverless
functions. Railway, Render, Fly.io or any VPS run it fine. At bigger scale you'd move
Socket.IO into its own service (see §9).

---

## 4. Who is this socket? (authentication)

Login already sets an `access_token` cookie holding a JWT `{ userId, organizationId }`.
The browser sends cookies with the socket's first request (the "handshake") as it does
with any request to the same site, so the server can read the same cookie:

```ts
// src/lib/realtime/socketServer.ts
io.use(async (socket, next) => {
    const session = signedIn(socket.handshake.headers.cookie);   // verify the JWT
    if (!session) return next(new Error("Not signed in"));       // connection refused
    const user = await prisma.user.findUnique(...);              // still a member?
    // signed in before the password last changed? that session is over
    if (!user || signedBefore(session.signedAt, user.passwordChangedAt)) return next(new Error("Not signed in"));
    socket.data.user = user;                                      // like req.user
    next();
});

io.on("connection", (socket) => {
    socket.join([orgRoom(organizationId), userRoom(id)]);         // "org:5", "user:12"
});
```

Nothing from the browser decides which rooms it's in, so nobody can listen to another
workspace or another person's notifications.

**A changed or reset password** also closes that person's open sockets
(`disconnectSockets()` on their room). Socket.IO doesn't reconnect by itself after the server
closes a connection, so `LiveUpdates` tries again a second later. The browser that changed the
password has its new token by then and gets back in. Any session from before the change is
refused at the handshake above.

---

## 5. Flow 1: "something changed"

```
Priya's tab                        server.ts                              Aarav's tab
    │ PUT /api/deals/7 ───────────►  Next.js route saves the deal
    │ ◄──────────────── 200 OK       │
    │ (refreshes itself, as before)  res "finish" ─► announceChange(req, 200)
    │                                   topic = "deals" (from the URL)
    │                                   org   = 5     (from the cookie)
    │                                   io.to("org:5").except(priya's socket)
    │                                     .emit("changed", { topic: "deals" }) ───► on("changed")
    │                                                                                invalidate ["deals"], ["deal"],
    │                                                                                ["dashboard"], ...
    │                                                                                React Query refetches GET /api/deals
```

How the pieces do it:

- **One hook for every route.** `server.ts` watches each `/api/...` response finish. If it
  was a write (`POST`/`PUT`/`PATCH`/`DELETE`) and succeeded (status < 400), it announces the
  first part of the path: `/api/leads/12/assign` → `"leads"`. No route had to change. Think
  of it as an Express middleware that runs after the response.
- **Only the topic travels.** The other tabs refetch through the normal API, which applies
  permissions as always. An agent who only sees their own leads still only sees their own
  leads. The socket can't leak data because it doesn't carry any.
- **The tab that made the change hears it too.** Its own `onSuccess` refreshes what it changed;
  the message refreshes everything else that depends on it there (the dashboard, My day, a
  company's totals). That matters because fetched data is kept for 5 minutes (`staleTime` in
  `QueryProvider`) instead of being fetched on every visit: the live messages are what keep it
  current, and after the connection drops and comes back, everything is fetched again. Pages
  themselves are kept for 30 seconds in the browser (`staleTimes.dynamic` in `next.config.ts`),
  and a role, member or billing change calls `router.refresh()`, which drops them.
- **Topic → what to refetch** lives in one map in `LiveUpdates.tsx` (`REFRESH`): a change to
  `tasks` refetches the task lists, the lead/deal/contact panels (their task tabs) and the
  dashboard.
- **Some writes are quiet:** `auth`, `me`, `notifications`, `saved-filters` change nothing
  anyone else is looking at. (Marking notifications read does tell *your own* other tabs,
  through your user room, so every bell shows the same count.)
- **No session, no hook:** a website visitor submitting a web form has no cookie, so
  `captureLead` announces `leads` and `tasks` itself with `broadcastChange(orgId, topic)`.
- **Pipelines** (`/api/pipelines`, and stage lists saved per pipeline) announce the
  `pipeline-stages` topic themselves; it refetches the pipelines, every stage list, the deals and
  the dashboard, so a pipeline added in Settings shows up in everyone's switcher.

---

## 6. Flow 2: notifications

```
Ananya's tab            Next.js route (POST /api/leads/12/assign)            Priya's tab
   │ assign to Priya ─►  saves the lead
   │                     await notify([priyaId], { type: "LEAD_ASSIGNED", ... })
   │                        1. INSERT a Notification row (for the bell)
   │                        2. io.to("user:<priya>").emit("notification", row) ─► on("notification")
   │                                                                               refetch ["notifications"] (bell count)
   │                                                                               toast "Ananya assigned you a lead"
```

`notify()` (in `src/lib/realtime/notify.ts`) is the only way to send one. It:

- leaves out the person who caused it (you're not notified about your own action);
- saves first, then pushes, so a person who's offline sees it in the bell later;
- never throws: if it fails, the change it's about is already saved, so it just logs.

### How a route reaches the Socket.IO server

Next.js bundles route code separately from `server.ts`, so a normal exported variable
wouldn't be the same object in both. But they run in **one Node process**, and
`globalThis` is shared across the whole process. `startRealtime` stores the server with
`setSocketServer(io)`, and routes read it with `getSocketServer()`. In tests there's no
server, so `getSocketServer()` is `undefined`. The row is still saved, nothing is pushed,
and the tests still pass.

### What sends a notification today

| Type | When | Where in the code |
|---|---|---|
| `LEAD_ASSIGNED` | someone assigns you a lead (one, or several in bulk), creates one for you, or a web form gives you one | `api/leads/[id]/assign`, `api/leads/bulkUpdate`, `api/leads` POST, `lib/leads/capture.ts` |
| `DEAL_ASSIGNED` | the same for deals | `api/deals/[id]/assign`, `api/deals/bulkUpdate`, `api/deals` POST |
| `TASK_ASSIGNED` | someone writes a task for you, or hands you one | `api/tasks` POST, `api/tasks/[id]` PUT |
| `ACTIVITY_INVITED` | you're made the owner of, or tagged on, a call/meeting (only when newly added) | `api/activities` POST, `api/activities/[id]` PUT |
| `MENTIONED` | someone @-mentions you in a note on a lead, deal or contact | `api/{leads,deals,contacts}/[id]/notes` POST |
| `REMINDER` | a call/meeting you own or are tagged on starts in ≤ 10 minutes | `sendReminders()` in `socketServer.ts` |

### Adding a new kind

1. Add the name to `NotificationType` in `notify.ts`.
2. Call `await notify([recipientId], { organizationId, actorId: user.id, type, title, body, link })`
   in the route, **after** the write succeeds.
3. Pick its icon in `SECTION_OF` in `NotificationBell.tsx`.
4. Add a test in `tests/integration/notifications.test.ts`.

---

## 7. Flow 3: reminders

`startRealtime` starts `setInterval(sendReminders, 30_000)`. Every 30 seconds:

1. Find activities that are `SCHEDULED`, start within the next 10 minutes, and have no
   `reminderSentAt`.
2. **Claim** each one: `updateMany({ where: { id, reminderSentAt: null }, data: { reminderSentAt: now } })`.
   Only the run whose update changed a row (`count === 1`) sends. Even if two runs overlap,
   or someday two servers run, nobody is reminded twice.
3. `notify()` the owner and everyone tagged: "Call in 7 minutes · Call Rahul".

When an activity is moved to another time, its `reminderSentAt` is cleared
(`api/activities/[id]` PUT), so the reminder goes out again for the new time.

### At the start time: the popup (browser side)

The 10-minute reminder is a toast, and the 30-second loop can't hit an exact moment. So the
start itself is handled in the browser by `ActivityAlert.tsx` (mounted once in the dashboard
layout, so it works on every page):

1. It loads your next scheduled calls/meetings (`GET /api/activities?status=SCHEDULED&assignedTo=me&from=<15 min ago>`).
   The query key starts with `"activities"`, so any change to activities (yours or, over the
   socket, anyone's) refetches it.
2. Every second it checks the clock; when one's time arrives it opens a **centered modal**
   with a short chime: Mark as done, Reschedule (quick picks or any time), Open, Dismiss.
   One that started up to 15 minutes before you opened the app still pops up ("started 4 min ago").
3. Whatever you do, `<id>@<scheduledAt>` is saved in localStorage, so it doesn't pop again on
   refresh, and other tabs close theirs (the `storage` event). A rescheduled activity has a
   new `scheduledAt`, so it pops up again at its new time.

---

## 8. The bell

- `GET /api/notifications` returns your 30 newest plus your unread count.
  `PATCH /api/notifications` with `{ ids: [...] }` or `{ all: true }` marks them read, and
  only ever your own.
- `NotificationBell.tsx` (sidebar, next to the workspace name) shows the count and the list.
  Clicking one marks it read and goes to its link (`/leads?open=12`).
- The record pages follow `?open=` even when you're already on them, so a notification
  opens the right panel.

---

## 9. Files

| File | What it does |
|---|---|
| `server.ts` | Starts Next.js + Socket.IO on one port; hooks `announceChange` onto every API response |
| `src/lib/realtime/socketServer.ts` | Socket.IO server: login check, rooms, `announceChange`, the reminder loop |
| `src/lib/realtime/notify.ts` | `notify()`, `broadcastChange()`, room names, the shared server handle. Safe to import from routes |
| `src/app/(dashboard)/LiveUpdates.tsx` | Browser: the socket, the topic → refetch map, toasts, reconnect handling |
| `src/app/(dashboard)/NotificationBell.tsx` | Browser: the bell |
| `src/app/api/notifications/route.ts` | Bell API |
| `prisma/schema.prisma` → `Notification`, `ScheduledActivity.reminderSentAt` | Storage |
| `tests/integration/notifications.test.ts` | Tests for notifications and reminders |

---

## 10. Debugging

- **Is the socket connected?** In the browser DevTools → Network → filter `socket.io`.
  You should see a `101 Switching Protocols` WebSocket. Its "Messages" tab shows every event.
- **"Not signed in" errors:** the cookie is missing or expired (tokens last 30 days). Log in again.
- **Nothing updates in another tab:** check the request succeeded (status < 400) and that its
  topic is in `REFRESH` in `LiveUpdates.tsx`.
- **Ran `next dev` by habit?** Pages work but nothing is live. Use `npm run dev`, which runs `server.ts`.

---

## 11. Later (when it's worth it)

- **More than one server:** rooms live in one process's memory. With two servers behind a
  load balancer, add the Socket.IO **Redis adapter**, and each `emit` reaches sockets on every server.
- **Presence** ("Priya is viewing this lead"): `socket.join("lead:12")` when a panel opens,
  and broadcast who's in the room.
- **Email for missed notifications**, and a per-person "what notifies me" setting.
