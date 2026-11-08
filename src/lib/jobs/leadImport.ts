import Papa from "papaparse";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import { hasPermission, userForJob } from "@/lib/auth/requirePermission";
import { validateCustomFieldValues } from "@/lib/settings/customFields";
import { isOpen, matchKeys } from "@/lib/leads/duplicates";
import { broadcastChange, getSocketServer, notify, userRoom } from "@/lib/realtime/notify";
import { createLeadSchema } from "@/lib/validations/leads";
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

// One row's fields, from the CSV columns mapped to them
const rowSchema = createLeadSchema.pick({ name: true, email: true, phone: true, companyName: true });

type Row = Record<string, string>;
// What the live progress carries: the counts, never the file or the problem rows
const progressSelect = { id: true, status: true, total: true, processed: true, created: true, skipped: true, failed: true, error: true } as const;
type Progress = { id: number; status: string; total: number; processed: number; created: number; skipped: number; failed: number; error: string | null };

// Live progress for the person who started it (their import page listens for this)
function report(userId: number, progress: Progress) {
    getSocketServer()?.to(userRoom(userId)).emit("import-progress", progress);
}

const lower = (text: string | undefined) => text?.trim().toLowerCase() ?? "";

export async function runImport(importJobId: number) {
    const job = await prisma.importJob.findUnique({ where: { id: importJobId } });
    if (!job || job.status === "DONE" || !job.csv) return;

    // the importing user, as the API would see them: leads are created as them, within what they may do
    const user = await userForJob(job.userId);
    if (!user) throw new Error("The person who started this import has left the workspace");

    const { organizationId } = job;
    const mapping = job.mapping as Record<string, string>;
    const defaults = job.defaults as ImportDefaults;
    const columnOf = (field: string) => Object.keys(mapping).find((column) => mapping[column] === field);
    const cell = (row: Row, field: string) => {
        const column = columnOf(field);
        // a ' an export put before a value so Excel wouldn't run it as a formula isn't part of it
        return column ? (row[column] ?? "").trim().replace(/^'(?=[=+\-@])/, "") : "";
    };

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
    const defaultStage = stages.find((stage) => stage.id === defaults.stageId) ?? stages.find(isOpen) ?? stages[0];
    if (!defaultStage) throw new Error("This workspace has no lead stages");
    const seesAll = hasPermission(user, "lead:all");
    // a teammate written in a cell: their email or their name, any case
    const personCalled = (text: string) => people.find((person) => lower(person.email) === lower(text) || lower(person.name) === lower(text));

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
                for (const [index, row] of batch.entries()) {
                    const fail = (problem: string) => problems.push({ ...row, Problem: problem });

                    // the two things every lead needs, said plainly when they're missing
                    if (!cell(row, "name")) {
                        fail("Name is missing");
                        continue;
                    }
                    if (!cell(row, "phone")) {
                        fail("Phone is missing");
                        continue;
                    }

                    const basics = rowSchema.safeParse({ name: cell(row, "name"), email: cell(row, "email") || null, phone: cell(row, "phone"), companyName: cell(row, "company") || null });
                    if (!basics.success) {
                        const issue = basics.error.issues[0];
                        fail(`${issue.path[0] === "phone" ? "Phone" : issue.path[0] === "email" ? "Email" : "Name"}: ${issue.message}`);
                        continue;
                    }

                    // An Agent field holds a teammate: their name or email in the file, them on the lead.
                    // Someone the file names who isn't in the workspace is a problem, not a silent blank.
                    const strangers = definitions.filter((definition) => definition.type === "AGENT" && cell(row, `cf:${definition.key}`) && !personCalled(cell(row, `cf:${definition.key}`)));
                    if (strangers.length > 0) {
                        fail(`${strangers[0].label}: no teammate called "${cell(row, `cf:${strangers[0].key}`)}"`);
                        continue;
                    }

                    // custom fields: checked by type, never required here (an empty cell just stays empty)
                    const submitted = Object.fromEntries(
                        definitions.flatMap((definition): [string, unknown][] => {
                            const value = cell(row, `cf:${definition.key}`);
                            if (!value) return [];
                            if (definition.type === "BOOLEAN") return [[definition.key, ["yes", "true", "1", "y"].includes(value.toLowerCase())]];
                            if (definition.type === "AGENT") return [[definition.key, personCalled(value)!.id]];
                            return [[definition.key, value]];
                        }),
                    );
                    const custom = validateCustomFieldValues(definitions.map((definition) => ({ ...definition, required: false })), submitted, { partial: true });
                    if (!custom.ok) {
                        fail(Object.values(custom.errors)[0]);
                        continue;
                    }

                    const stage = stages.find((item) => lower(item.name) === lower(cell(row, "stage"))) ?? defaultStage;
                    const source = sources.find((item) => lower(item.name) === lower(cell(row, "source")));
                    const sourceId = source?.id ?? defaults.sourceId ?? null;
                    const ownerCell = cell(row, "owner");
                    const named = ownerCell ? personCalled(ownerCell) : undefined;
                    // a name that matches nobody would quietly go to the default owner: say so instead
                    if (seesAll && ownerCell && !named) {
                        fail(`Assigned to: no teammate called "${ownerCell}"`);
                        continue;
                    }
                    // without lead:all, everything you import is yours (as when you add a lead by hand)
                    const ownerId = seesAll ? (named?.id ?? (defaults.ownerId === undefined ? user.id : defaults.ownerId)) : user.id;

                    // one open lead per person: someone already being worked on isn't added again
                    const { phoneKey, emailKey } = keys[index];
                    if (isOpen(stage)) {
                        const already = openLeads.find((lead) => (phoneKey && lead.phoneKey === phoneKey) || (emailKey && lead.emailKey === emailKey));
                        const twice = [phoneKey, emailKey].some((key) => key && seenInFile.has(key));
                        if (already || twice) {
                            skipped += 1;
                            fail(already ? `Already a lead: ${already.name}` : "Appears earlier in this file");
                            continue;
                        }
                        for (const key of [phoneKey, emailKey]) if (key) seenInFile.add(key);
                    }

                    const { name, email, phone, companyName } = basics.data;
                    let contactId = contactByPhone.get(phone);
                    if (!contactId) {
                        contactId = (
                            await tx.contact.create({
                                data: { organizationId, name, email: email ?? null, phone, assignedToId: ownerId, createdById: user.id, updatedById: user.id },
                                select: { id: true },
                            })
                        ).id;
                        contactByPhone.set(phone, contactId);
                    }
                    await linkToCompany(tx, organizationId, contactId, companyName);

                    const note = cell(row, "note");
                    await tx.lead.create({
                        data: {
                            organizationId,
                            name,
                            email: email ?? null,
                            phone,
                            companyName: companyName ?? null,
                            utmCampaign: cell(row, "campaign").slice(0, 150) || null,
                            stageId: stage.id,
                            sourceId,
                            assignedToId: ownerId,
                            contactId,
                            customFields: custom.data as Prisma.InputJsonObject,
                            createdById: user.id,
                            updatedById: user.id,
                            timeline: { create: { userId: user.id, type: "CREATED", message: `Imported from ${job.fileName}` } },
                            ...(note && { notes: { create: { authorId: user.id, body: note } } }),
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
