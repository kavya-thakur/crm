import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { handleRouteError, parseBody } from "@/lib/api/http";
import { dbIdSchema, optionalText } from "@/lib/validations/common";
import { tooManyAttempts } from "@/lib/api/rateLimit";
import { bulkJobSelect, findAgent, findStage, MAX_BULK, mayDo, prepareEdit } from "@/lib/jobs/bulkActions";
import { bulkQueue } from "@/lib/jobs/queues";

const ids = z.array(dbIdSchema).min(1).max(MAX_BULK);
const entity = z.enum(["lead", "deal", "contact"]);

const startBulkJobSchema = z.discriminatedUnion("action", [
    z.object({ action: z.literal("delete"), entity, ids }),
    // contacts have no stages
    z.object({ action: z.literal("stage"), entity: z.enum(["lead", "deal"]), ids, stageId: dbIdSchema, lostReason: optionalText(200) }),
    // null = unassign
    z.object({ action: z.literal("assign"), entity, ids, assignedToId: dbIdSchema.nullable() }),
    // one field (or custom field) set to the same value; which fields depends on the entity (prepareEdit checks)
    z.object({ action: z.literal("update"), entity, ids, changes: z.record(z.string(), z.unknown()) }),
]);

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
 * Starts a big bulk action (deleting, moving, assigning or editing thousands of records): saves which
 * ones (the ids, a snapshot of what was selected) and what to do, and queues it. The worker
 * works through them in batches, only among the records this person may touch, and reports
 * progress live.
 */
export async function POST(req: NextRequest) {
    try {
        const user = await signedInUser();

        const body = await parseBody(req, startBulkJobSchema);
        if (!body.success) return body.response;

        const data = body.data;
        if (!mayDo(user, data.entity, data.action)) throw new Error("FORBIDDEN");

        // what the action needs, checked now so a mistake is told straight away, not later
        const params =
            data.action === "stage"
                ? { stageId: data.stageId, lostReason: data.lostReason }
                : data.action === "assign"
                  ? { assignedToId: data.assignedToId }
                  : data.action === "update"
                    ? { changes: data.changes as Prisma.InputJsonValue }
                    : {};
        if (data.action === "stage" && !(await findStage(user.organizationId, data.entity, data.stageId))) {
            return NextResponse.json({ ok: false, message: "Invalid stage" }, { status: 400 });
        }
        if (data.action === "assign" && (await findAgent(user.organizationId, data.assignedToId)) === undefined) {
            return NextResponse.json({ ok: false, message: "Agent not found in your organization" }, { status: 404 });
        }
        if (data.action === "update") {
            const prepared = await prepareEdit(user, data.entity, data.changes);
            if (!prepared.ok) return NextResponse.json({ ok: false, message: prepared.message, errors: prepared.errors }, { status: 400 });
        }

        if (await tooManyAttempts(`bulk:${user.id}`, 20, 60 * 60 * 1000)) {
            return NextResponse.json({ ok: false, message: "That's a lot of bulk actions in an hour. Please wait a little." }, { status: 429 });
        }

        const unique = [...new Set(data.ids)];
        const job = await prisma.bulkJob.create({
            data: { organizationId: user.organizationId, userId: user.id, entity: data.entity, action: data.action, params, ids: unique, total: unique.length },
            select: bulkJobSelect,
        });

        try {
            await bulkQueue().add(data.action, { bulkJobId: job.id }, { jobId: `bulk-${job.id}` });
        } catch {
            await prisma.bulkJob.update({ where: { id: job.id }, data: { status: "FAILED", error: "The job queue isn't available" } });
            return NextResponse.json({ ok: false, message: "Big bulk actions aren't available right now. Please try again in a few minutes." }, { status: 503 });
        }

        return NextResponse.json({ ok: true, data: job }, { status: 201 });
    } catch (error) {
        return handleRouteError(error, "Start bulk job");
    }
}
