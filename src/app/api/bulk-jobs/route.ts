import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { hasPermission } from "@/lib/auth/requirePermission";
import { handleRouteError, parseBody } from "@/lib/api/http";
import { dbIdSchema } from "@/lib/validations/common";
import { tooManyAttempts } from "@/lib/api/rateLimit";
import { bulkJobSelect, MAX_BULK } from "@/lib/jobs/bulkActions";
import { bulkQueue } from "@/lib/jobs/queues";

const startBulkJobSchema = z.object({
    entity: z.enum(["lead", "deal", "contact"]),
    action: z.literal("delete"),
    ids: z.array(dbIdSchema).min(1).max(MAX_BULK),
});

async function signedInUser() {
    const user = await getCurrentUser();
    if (!user) throw new Error("UNAUTHORIZED");
    return user;
}

// Your bulk actions still running, for the progress card (it also gets them live over the socket)
export async function GET() {
    try {
        const user = await signedInUser();

        const jobs = await prisma.bulkJob.findMany({
            where: { userId: user.id, status: { in: ["QUEUED", "RUNNING"] } },
            orderBy: { createdAt: "asc" },
            select: bulkJobSelect,
        });

        return NextResponse.json({ ok: true, data: jobs });
    } catch (error) {
        return handleRouteError(error, "Get bulk jobs");
    }
}

/**
 * Starts a big bulk action (deleting thousands of records): saves which ones (the ids, a
 * snapshot of what was selected) and queues it. The worker deletes them in batches, only
 * among the records this person may touch, and reports progress live.
 */
export async function POST(req: NextRequest) {
    try {
        const user = await signedInUser();

        const body = await parseBody(req, startBulkJobSchema);
        if (!body.success) return body.response;

        const { entity, action, ids } = body.data;
        if (!hasPermission(user, `${entity}:delete`)) throw new Error("FORBIDDEN");

        if (await tooManyAttempts(`bulk:${user.id}`, 20, 60 * 60 * 1000)) {
            return NextResponse.json({ ok: false, message: "That's a lot of bulk actions in an hour. Please wait a little." }, { status: 429 });
        }

        const unique = [...new Set(ids)];
        const job = await prisma.bulkJob.create({
            data: { organizationId: user.organizationId, userId: user.id, entity, action, ids: unique, total: unique.length },
            select: bulkJobSelect,
        });

        try {
            await bulkQueue().add(action, { bulkJobId: job.id }, { jobId: `bulk-${job.id}` });
        } catch {
            await prisma.bulkJob.update({ where: { id: job.id }, data: { status: "FAILED", error: "The job queue isn't available" } });
            return NextResponse.json({ ok: false, message: "Big bulk actions aren't available right now. Please try again in a few minutes." }, { status: 503 });
        }

        return NextResponse.json({ ok: true, data: job }, { status: 201 });
    } catch (error) {
        return handleRouteError(error, "Start bulk job");
    }
}
