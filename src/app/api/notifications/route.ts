import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { dbIdSchema } from "@/lib/validations/common";
import { handleRouteError, parseBody } from "@/lib/api/http";
import { getSocketServer, userRoom } from "@/lib/realtime/notify";

// Everyone has a bell, so these need a signed-in user but no permission
async function signedInUser() {
    const user = await getCurrentUser();
    if (!user) throw new Error("UNAUTHORIZED");
    return user;
}

// The bell: your 30 newest notifications, and how many you haven't read
export async function GET() {
    try {
        const user = await signedInUser();

        const [items, unread] = await Promise.all([
            prisma.notification.findMany({
                where: { userId: user.id },
                orderBy: { createdAt: "desc" },
                take: 30,
                include: { actor: { select: { id: true, name: true } } },
            }),
            prisma.notification.count({ where: { userId: user.id, readAt: null } }),
        ]);

        return NextResponse.json({ ok: true, data: items, unread });
    } catch (error) {
        return handleRouteError(error, "Get notifications");
    }
}

const markReadSchema = z.union([z.object({ ids: z.array(dbIdSchema).min(1).max(100) }), z.object({ all: z.literal(true) })]);

// Mark some notifications read (the one you clicked), or all of them
export async function PATCH(req: NextRequest) {
    try {
        const user = await signedInUser();

        const body = await parseBody(req, markReadSchema);

        if (!body.success) {
            return body.response;
        }

        // userId in the where: nobody can mark someone else's
        const { count } = await prisma.notification.updateMany({
            where: { userId: user.id, readAt: null, ...("ids" in body.data && { id: { in: body.data.ids } }) },
            data: { readAt: new Date() },
        });

        // your other tabs' bells catch up too (only yours: it's your room)
        getSocketServer()?.to(userRoom(user.id)).emit("changed", { topic: "notifications" });

        return NextResponse.json({ ok: true, affected: count });
    } catch (error) {
        return handleRouteError(error, "Mark notifications read");
    }
}
