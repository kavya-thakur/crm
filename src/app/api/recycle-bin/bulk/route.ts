import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { handleRouteError, parseBody } from "@/lib/api/http";
import { tooManyAttempts } from "@/lib/api/rateLimit";
import { dbIdSchema, MAX_BULK } from "@/lib/validations/common";
import { BIN_ENTITIES, binWhere, restoreMany } from "@/lib/recycleBin";
import { bulkJobSelect } from "@/lib/jobs/bulkActions";
import { bulkQueue } from "@/lib/jobs/queues";

// up to this many are restored in the request itself; more go to a background job with a progress card
const INSTANT_RESTORE = 25;

const bulkBinSchema = z
    .object({
        action: z.enum(["restore", "purge"]),
        // the ticked items...
        ids: z.array(dbIdSchema).min(1).max(MAX_BULK).optional(),
        // ...or everything the page's tab and search match ("Select all 9,812", "Empty bin")
        all: z.object({ entity: z.enum(BIN_ENTITIES).optional(), search: z.string().trim().max(100).optional() }).optional(),
    })
    .refine((body) => (body.ids === undefined) !== (body.all === undefined), "Pick some items, or all of them");

/**
 * Many at once from the recycle bin, always within what this person may see there (binScope).
 *  - purge: deleted forever, in one statement, however many (10,000 is one quick DELETE)
 *  - restore: a few straight away; more as a background job (each one rebuilds a record with its
 *    timeline, notes and tasks, which takes a while for thousands), with the progress card
 */
export async function POST(req: NextRequest) {
    try {
        const user = await getCurrentUser();
        if (!user) throw new Error("UNAUTHORIZED");

        const body = await parseBody(req, bulkBinSchema);
        if (!body.success) return body.response;
        const { action, ids, all } = body.data;

        const where = ids ? { AND: [binWhere(user, {}), { id: { in: ids } }] } : binWhere(user, all!);

        if (action === "purge") {
            const { count } = await prisma.deletedRecord.deleteMany({ where });
            return NextResponse.json({ ok: true, message: `${count.toLocaleString()} deleted forever`, affected: count });
        }

        // the items, oldest first (so a job restores in the order they were deleted)
        const found = await prisma.deletedRecord.findMany({ where, select: { id: true }, orderBy: { id: "asc" }, take: MAX_BULK });
        const binIds = found.map((item) => item.id);
        if (binIds.length === 0) return NextResponse.json({ ok: true, message: "Nothing to restore", affected: 0 });

        if (binIds.length <= INSTANT_RESTORE) {
            const { restored, problems } = await restoreMany(user, binIds);
            return NextResponse.json({
                ok: true,
                message: `${restored} restored${problems.length > 0 ? `; ${binIds.length - restored} couldn't go back` : ""}`,
                affected: restored,
                problems,
            });
        }

        if (await tooManyAttempts(`bulk:${user.id}`, 20, 60 * 60 * 1000)) {
            return NextResponse.json({ ok: false, message: "That's a lot of bulk actions in an hour. Please wait a little." }, { status: 429 });
        }

        // "record": the bin holds leads, deals and contacts together
        const job = await prisma.bulkJob.create({
            data: { organizationId: user.organizationId, userId: user.id, entity: "record", action: "restore", ids: binIds, total: binIds.length },
            select: bulkJobSelect,
        });
        try {
            await bulkQueue().add("restore", { bulkJobId: job.id }, { jobId: `bulk-${job.id}` });
        } catch {
            await prisma.bulkJob.update({ where: { id: job.id }, data: { status: "FAILED", error: "The job queue isn't available" } });
            return NextResponse.json({ ok: false, message: "Restoring many at once isn't available right now. Please try again in a few minutes." }, { status: 503 });
        }

        return NextResponse.json({ ok: true, data: job }, { status: 201 });
    } catch (error) {
        return handleRouteError(error, "Recycle bin bulk action");
    }
}
