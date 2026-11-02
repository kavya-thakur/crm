import { prisma } from "@/lib/db/prisma";
import { contactScope, dealScope, hasPermission, leadScope, userForJob, type CurrentUser } from "@/lib/auth/requirePermission";
import { broadcastChange, getSocketServer, userRoom } from "@/lib/realtime/notify";
import type { Prisma } from "@/generated/prisma/client";

/*
 * Bulk actions too big for one request, e.g. deleting every one of 4,000 filtered leads. The
 * request saves a BulkJob (the ids picked, as a snapshot) and queues it; the BullMQ worker
 * runs it here, BATCH records at a time. Like imports (src/lib/jobs/leadImport.ts), each batch and the
 * job's counters are saved in one transaction, so a retried job carries on where it stopped.
 * See docs/QUEUES.md.
 */

export { MAX_BULK } from "@/lib/validations/common";

// records per batch (each batch is one transaction)
const BATCH = 500;

export type BulkEntity = "lead" | "deal" | "contact";

// Deletes one batch, only among the records this person may still touch (the same scope as the
// list and the single delete); anything already gone or now out of reach is simply skipped
function deleteBatch(tx: Prisma.TransactionClient, entity: BulkEntity, ids: number[], user: CurrentUser) {
    const where = { id: { in: ids } };
    if (entity === "lead") return tx.lead.deleteMany({ where: { ...where, ...leadScope(user) } });
    if (entity === "deal") return tx.deal.deleteMany({ where: { ...where, ...dealScope(user) } });
    return tx.contact.deleteMany({ where: { ...where, ...contactScope(user) } });
}

// What the live progress carries
const progressSelect = { id: true, entity: true, action: true, status: true, total: true, processed: true, affected: true, error: true } as const;

function report(userId: number, progress: object) {
    getSocketServer()?.to(userRoom(userId)).emit("bulk-progress", progress);
}

export async function runBulkJob(bulkJobId: number) {
    const job = await prisma.bulkJob.findUnique({ where: { id: bulkJobId } });
    if (!job || job.status === "DONE") return;

    const user = await userForJob(job.userId);
    if (!user) throw new Error("The person who started this has left the workspace");
    // checked again now, not just when it was started: permissions can change in between
    if (!hasPermission(user, `${job.entity}:delete`)) throw new Error(`You can no longer delete ${job.entity}s`);

    report(user.id, await prisma.bulkJob.update({ where: { id: job.id }, data: { status: "RUNNING" }, select: progressSelect }));

    for (let start = job.processed; start < job.ids.length; start += BATCH) {
        const batch = job.ids.slice(start, start + BATCH);

        const progress = await prisma.$transaction(
            async (tx) => {
                const { count } = await deleteBatch(tx, job.entity as BulkEntity, batch, user);
                return tx.bulkJob.update({
                    where: { id: job.id },
                    data: { processed: { increment: batch.length }, affected: { increment: count } },
                    select: progressSelect,
                });
            },
            // deleting 500 leads also removes their timelines, notes, tasks and activities
            { timeout: 120_000, maxWait: 10_000 },
        );

        report(user.id, progress);
        // everyone's lists shrink as it goes
        broadcastChange(job.organizationId, `${job.entity}s`);
    }

    report(user.id, await prisma.bulkJob.update({ where: { id: job.id }, data: { status: "DONE", finishedAt: new Date() }, select: progressSelect }));
}

export async function failBulkJob(bulkJobId: number, reason: string) {
    const job = await prisma.bulkJob.update({
        where: { id: bulkJobId },
        data: { status: "FAILED", error: reason, finishedAt: new Date() },
        select: { ...progressSelect, userId: true },
    });
    report(job.userId, job);
}

export { progressSelect as bulkJobSelect };
