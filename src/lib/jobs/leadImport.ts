import Papa from "papaparse";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import { hasPermission, userForJob } from "@/lib/auth/requirePermission";
import { matchKeys } from "@/lib/leads/duplicates";
import { duplicateOf, rowReader } from "@/lib/imports/rows";
import { broadcastChange, getSocketServer, notify, userRoom } from "@/lib/realtime/notify";
import type { ImportDefaults } from "@/lib/validations/imports";
import { linkToCompany } from "@/lib/companies";

/*
 * The work behind a CSV import, run by the BullMQ worker (src/lib/jobs/worker.ts), never
 * inside a web request. See docs/QUEUES.md.
 *
 * Rows go in batches of BATCH. Each batch is one database transaction, and that same
 * transaction moves the job's counters on. So if the server stops halfway, the counters
 * say exactly how far it got, and when BullMQ retries the job it carries on from there:
 * no row is imported twice.
 */

const BATCH = 200;

type Row = Record<string, string>;
// What the live progress carries: the counts, never the file or the problem rows
const progressSelect = { id: true, status: true, total: true, processed: true, created: true, skipped: true, failed: true, error: true } as const;
type Progress = { id: number; status: string; total: number; processed: number; created: number; skipped: number; failed: number; error: string | null };

// Live progress for the person who started it (their import page listens for this)
function report(userId: number, progress: Progress) {
    getSocketServer()?.to(userRoom(userId)).emit("import-progress", progress);
}

export async function runImport(importJobId: number) {
    const job = await prisma.importJob.findUnique({ where: { id: importJobId } });
    if (!job || job.status === "DONE" || !job.csv) return;

    // the importing user, as the API would see them: leads are created as them, within what they may do
    const user = await userForJob(job.userId);
    if (!user) throw new Error("The person who started this import has left the workspace");

    const { organizationId } = job;
    const mapping = job.mapping as Record<string, string>;
    const defaults = job.defaults as ImportDefaults;

    await prisma.importJob.update({ where: { id: job.id }, data: { status: "RUNNING" } });

    const parsed = Papa.parse<Row>(job.csv, { header: true, skipEmptyLines: "greedy" });
    const headers = parsed.meta.fields ?? [];
    const rows = parsed.data;

    // everything a row can point to, looked up once: stages, sources and people by name
    const [stages, sources, people, definitions] = await Promise.all([
        prisma.leadStage.findMany({ where: { organizationId }, orderBy: [{ order: "asc" }, { id: "asc" }] }),
        prisma.leadSource.findMany({ where: { organizationId } }),
        prisma.user.findMany({ where: { organizationId }, select: { id: true, name: true, email: true } }),
        prisma.customFieldDefinition.findMany({
            where: { organizationId, entity: "lead", key: { in: Object.values(mapping).filter((field) => field.startsWith("cf:")).map((field) => field.slice(3)) } },
        }),
    ]);
    // the rules for one row, the same as the import screen's check used (src/lib/imports/rows.ts)
    const reader = rowReader({ mapping, defaults, stages, sources, people, definitions, seesAll: hasPermission(user, "lead:all"), userId: user.id });
    const { cell } = reader;

    // rows that didn't make it, with the reason, for the "download problems" file
    const problems: Row[] = job.errorsCsv ? Papa.parse<Row>(job.errorsCsv, { header: true, skipEmptyLines: "greedy" }).data : [];
    // people already added by this import, so a name twice in the file becomes one lead
    const seenInFile = new Set<string>();

    for (let start = job.processed; start < rows.length; start += BATCH) {
        const batch = rows.slice(start, start + BATCH);
        let created = 0;
        let skipped = 0;
        const failedBefore = problems.length;

        // who in this batch is already an open lead (and which contacts exist), in two queries
        const keys = batch.map((row) => matchKeys({ email: cell(row, "email"), phone: cell(row, "phone") }));
        const phoneKeys = keys.flatMap((key) => (key.phoneKey ? [key.phoneKey] : []));
        const emailKeys = keys.flatMap((key) => (key.emailKey ? [key.emailKey] : []));
        const [openLeads, contacts] = await Promise.all([
            prisma.lead.findMany({
                where: { organizationId, stage: { isConverted: false, isLost: false }, OR: [{ phoneKey: { in: phoneKeys } }, { emailKey: { in: emailKeys } }] },
                select: { phoneKey: true, emailKey: true, name: true },
            }),
            prisma.contact.findMany({ where: { organizationId, phone: { in: batch.map((row) => cell(row, "phone")).filter(Boolean) } }, select: { id: true, phone: true } }),
        ]);
        const contactByPhone = new Map(contacts.map((contact) => [contact.phone, contact.id]));

        await prisma.$transaction(
            async (tx) => {
                for (const row of batch) {
                    const fail = (problem: string) => problems.push({ ...row, Problem: problem });

                    const result = reader.read(row);
                    if (!result.ok) {
                        fail(result.problem.message);
                        continue;
                    }
                    const lead = result.lead;

                    // one open lead per person: someone already being worked on isn't added again
                    const duplicate = duplicateOf(lead, (keys) => openLeads.find((open) => (keys.phoneKey && open.phoneKey === keys.phoneKey) || (keys.emailKey && open.emailKey === keys.emailKey)), seenInFile);
                    if (duplicate) {
                        skipped += 1;
                        fail(duplicate);
                        continue;
                    }

                    const { name, email, phone, companyName, ownerId } = lead;
                    let contactId = contactByPhone.get(phone);
                    if (!contactId) {
                        contactId = (
                            await tx.contact.create({
                                data: { organizationId, name, email, phone, assignedToId: ownerId, createdById: user.id, updatedById: user.id },
                                select: { id: true },
                            })
                        ).id;
                        contactByPhone.set(phone, contactId);
                    }
                    await linkToCompany(tx, organizationId, contactId, companyName);

                    await tx.lead.create({
                        data: {
                            organizationId,
                            name,
                            email,
                            phone,
                            companyName,
                            utmCampaign: lead.campaign,
                            stageId: lead.stage.id,
                            sourceId: lead.sourceId,
                            assignedToId: ownerId,
                            contactId,
                            customFields: lead.customFields as Prisma.InputJsonObject,
                            createdById: user.id,
                            updatedById: user.id,
                            timeline: { create: { userId: user.id, type: "CREATED", message: `Imported from ${job.fileName}` } },
                            ...(lead.note && { notes: { create: { authorId: user.id, body: lead.note } } }),
                        },
                    });
                    created += 1;
                }

                // the batch's rows and the counters move on together, or not at all
                const newProblems = problems.length > failedBefore;
                await tx.importJob.update({
                    where: { id: job.id },
                    data: {
                        processed: { increment: batch.length },
                        created: { increment: created },
                        skipped: { increment: skipped },
                        failed: { increment: problems.length - failedBefore - skipped },
                        ...(newProblems && { errorsCsv: Papa.unparse(problems, { columns: [...headers, "Problem"], escapeFormulae: true }) }),
                    },
                });
            },
            // a batch of 200 rows can take longer than Prisma's 5-second default
            { timeout: 120_000, maxWait: 10_000 },
        );

        report(user.id, await prisma.importJob.findUniqueOrThrow({ where: { id: job.id }, select: progressSelect }));
        // everyone's lead lists fill up as the import goes
        if (created > 0) broadcastChange(organizationId, "leads");
    }

    const done = await prisma.importJob.update({
        where: { id: job.id },
        // the file isn't needed any more; the counts and the problem rows stay
        data: { status: "DONE", finishedAt: new Date(), csv: null },
        select: progressSelect,
    });
    report(user.id, done);

    await notify([user.id], {
        organizationId,
        actorId: null,
        type: "IMPORT_FINISHED",
        title: `Import finished: ${done.created} lead${done.created === 1 ? "" : "s"} added`,
        body: [done.skipped && `${done.skipped} already leads`, done.failed && `${done.failed} with problems`].filter(Boolean).join(" · ") || `from ${job.fileName}`,
        link: `/leads/import?job=${job.id}`,
    });
}

// When the job itself can't finish, even after its retries: marked failed, and its owner told
export async function failImport(importJobId: number, reason: string) {
    const job = await prisma.importJob.update({
        where: { id: importJobId },
        data: { status: "FAILED", error: reason, finishedAt: new Date() },
        select: { ...progressSelect, userId: true, organizationId: true, fileName: true },
    });
    report(job.userId, job);
    await notify([job.userId], {
        organizationId: job.organizationId,
        actorId: null,
        type: "IMPORT_FINISHED",
        title: "Import stopped",
        body: `${job.fileName}: ${reason}. ${job.created} leads were added before it stopped.`,
        link: `/leads/import?job=${job.id}`,
    });
}

// What the import screens show about an import: never the file itself or the problem rows
export const importSummarySelect = {
    id: true,
    entity: true,
    fileName: true,
    status: true,
    total: true,
    processed: true,
    created: true,
    skipped: true,
    failed: true,
    error: true,
    createdAt: true,
    finishedAt: true,
    user: { select: { id: true, name: true } },
} as const;

// Imports someone can see: their own, or everyone's in the workspace with lead:all
export function importScope(user: { id: number; organizationId: number }, seesAll: boolean) {
    return { organizationId: user.organizationId, ...(!seesAll && { userId: user.id }) };
}
