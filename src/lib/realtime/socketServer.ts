import type { IncomingMessage, Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import { signedIn } from "@/lib/auth/jwt";
import { sendBillingReminders } from "@/lib/billing/reminders";
import { prisma } from "@/lib/db/prisma";
import { broadcastChange, notify, orgRoom, setSocketServer, userRoom } from "./notify";

/*
 * Real time, in two parts (docs/REALTIME.md walks through it):
 *
 * 1. "Something changed": after any API request that writes (POST/PUT/PATCH/DELETE) and
 *    succeeds, everyone else in the same workspace is told which kind of record changed
 *    ("leads"). Their pages refetch it through the normal API, which checks permissions as
 *    always; the socket only ever carries the word "leads", never the data.
 *
 * 2. Notifications: a message for one person ("Priya assigned you a lead"), saved for their
 *    bell and pushed to their own room. Sent by the routes through notify(), and by the
 *    reminder loop below.
 */

// Writes that don't change anything other people are looking at
// (bulk-jobs and imports report their own progress as they go)
const QUIET = new Set(["auth", "me", "public", "notifications", "saved-filters", "bulk-jobs"]);

export function startRealtime(httpServer: HttpServer) {
    const io = new Server(httpServer, {
        // leave other upgrade requests (Next.js's hot reload in dev) alone instead of closing them
        destroyUpgrade: false,
    });
    setSocketServer(io);

    // Like an Express middleware, but for the connection: no valid login, no socket
    io.use(async (socket, next) => {
        const session = signedIn(socket.handshake.headers.cookie);
        // the token can outlive its user (removed from the workspace), so check they still exist
        const user = session && (await prisma.user.findUnique({ where: { id: session.userId }, select: { id: true, organizationId: true } }));
        if (!user) return next(new Error("Not signed in"));
        socket.data.user = user;
        next();
    });

    io.on("connection", (socket) => {
        const { id, organizationId } = socket.data.user as { id: number; organizationId: number };
        socket.join([orgRoom(organizationId), userRoom(id)]);
    });

    setInterval(() => void sendReminders(), 30_000);
    // "your trial / Pro plan ends soon", to workspace owners: hourly is plenty for days-ahead notice
    setTimeout(() => void sendBillingReminders(), 60_000);
    setInterval(() => void sendBillingReminders(), 60 * 60_000);

    return io;
}

/**
 * Called by server.ts once a request's response has gone out. A successful write under
 * /api/<topic>/... tells the whole workspace that <topic> changed, the tab that made it included.
 */
export function announceChange(req: IncomingMessage, status: number) {
    if (req.method === "GET" || req.method === "HEAD" || status >= 400) return;

    const topic = req.url?.match(/^\/api\/([^/?]+)/)?.[1];
    if (!topic || QUIET.has(topic)) return;

    const session = signedIn(req.headers.cookie);
    if (!session) return;

    broadcastChange(session.organizationId, topic);
}

const REMIND_BEFORE_MS = 10 * 60 * 1000;
const TYPE_LABELS = { CALL: "Call", MEETING: "Meeting", OTHER: "Activity" } as const;

// Calls and meetings starting in the next 10 minutes: a reminder to whoever it's for and
// everyone tagged on it, once (reminderSentAt), even if the loop overlaps itself
export async function sendReminders() {
    try {
        const now = new Date();
        const soon = await prisma.scheduledActivity.findMany({
            where: { status: "SCHEDULED", reminderSentAt: null, scheduledAt: { gt: now, lte: new Date(now.getTime() + REMIND_BEFORE_MS) } },
            select: { id: true, organizationId: true, type: true, title: true, scheduledAt: true, assignedToId: true, attendees: { select: { id: true } } },
        });

        for (const activity of soon) {
            // claim it first: only the run that flips reminderSentAt sends the reminder
            const { count } = await prisma.scheduledActivity.updateMany({ where: { id: activity.id, reminderSentAt: null }, data: { reminderSentAt: now } });
            if (count === 0) continue;

            const minutes = Math.max(1, Math.round((activity.scheduledAt.getTime() - now.getTime()) / 60_000));
            await notify([activity.assignedToId, ...activity.attendees.map((attendee) => attendee.id)], {
                organizationId: activity.organizationId,
                actorId: null,
                type: "REMINDER",
                title: `${TYPE_LABELS[activity.type]} in ${minutes} minute${minutes === 1 ? "" : "s"}`,
                body: activity.title,
                link: `/activities?open=${activity.id}`,
            });
        }
    } catch (error) {
        console.error("Couldn't send reminders", error);
    }
}
