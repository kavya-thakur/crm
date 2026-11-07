import type { Server } from "socket.io";
import { prisma } from "@/lib/db/prisma";

/*
 * The one Socket.IO server lives on globalThis: server.ts creates it (see ./socketServer)
 * and the API routes reach it from here. Next.js bundles the routes separately from
 * server.ts, so a plain module variable wouldn't be shared, but globalThis is the same
 * object for the whole Node process. In tests there's no server, so nothing is pushed.
 */
const holder = globalThis as unknown as { crmSocketServer?: Server };

export function setSocketServer(io: Server) {
    holder.crmSocketServer = io;
}

export function getSocketServer() {
    return holder.crmSocketServer;
}

// Everyone signed in to a workspace is in its room; each person is also in their own
export const orgRoom = (organizationId: number) => `org:${organizationId}`;
export const userRoom = (userId: number) => `user:${userId}`;

/**
 * "Something changed": tells everyone in a workspace that a kind of record changed
 * ("leads"), so their open pages refetch it. Only the word goes out, never the records.
 * server.ts calls it after every successful write; code that changes things without a
 * signed-in request (a web form) calls it itself. `exceptSocketId` is the tab that made
 * the change, which has already refreshed.
 */
export function broadcastChange(organizationId: number, topic: string, exceptSocketId?: string) {
    const room = getSocketServer()?.to(orgRoom(organizationId));
    (exceptSocketId ? room?.except(exceptSocketId) : room)?.emit("changed", { topic });
}

export type NotificationType = "LEAD_ASSIGNED" | "DEAL_ASSIGNED" | "TASK_ASSIGNED" | "ACTIVITY_INVITED" | "MENTIONED" | "REMINDER" | "IMPORT_FINISHED" | "EMAIL_OPENED" | "EMAIL_FAILED" | "AUTOMATION" | "LOGGED_IN_AS";

/**
 * Puts a notification in each recipient's bell and pushes it to them live:
 *   await notify([agentId], { organizationId, actorId: user.id, type: "LEAD_ASSIGNED",
 *                             title: "Priya assigned you a lead", body: "Rahul Mehta", link: "/leads?open=12" });
 * Nobody is told about their own action, so the actor is left out. A notification that
 * fails is logged, never thrown: the change it's about has already been saved.
 */
export async function notify(
    recipients: (number | null | undefined)[],
    notification: { organizationId: number; actorId: number | null; type: NotificationType; title: string; body?: string | null; link?: string },
) {
    const userIds = [...new Set(recipients)].filter((id): id is number => typeof id === "number" && id !== notification.actorId);
    if (userIds.length === 0) return;

    try {
        const created = await prisma.notification.createManyAndReturn({
            data: userIds.map((userId) => ({ ...notification, userId })),
        });

        const io = getSocketServer();
        for (const row of created) io?.to(userRoom(row.userId)).emit("notification", row);
    } catch (error) {
        console.error("Couldn't send notification", error);
    }
}

// "Priya" for the titles ("Priya assigned you a lead"); the first name reads better in a bell
export function firstName(name: string) {
    return name.split(" ")[0];
}
