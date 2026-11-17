import { prisma } from "@/lib/db/prisma";
import { contactScope, dealScope, hasPermission, leadScope, userForJob, type CurrentUser } from "@/lib/auth/requirePermission";
import { broadcastChange, firstName, getSocketServer, notify, userRoom } from "@/lib/realtime/notify";
import { stageMessage } from "@/lib/leads/stages";
import { OPEN_STAGE } from "@/lib/leads/duplicates";
import { closedAtFor } from "@/lib/deals/stages";
import { stageEvents, startAutomations } from "@/lib/automations/engine";
import { deleteToBin, restoreMany } from "@/lib/recycleBin";
import { bulkHistoryRows, customFieldBulkValues } from "@/lib/history";
import { companyNamed, moveToCompany } from "@/lib/companies";
import { mergeCustomFieldsSql, validateCustomFieldEdit } from "@/lib/settings/customFields";
import { formatMoneyExact } from "@/lib/utils/format";
import { bulkLeadChangesSchema } from "@/lib/validations/leads";
import { bulkDealChangesSchema } from "@/lib/validations/deals";
import { bulkContactChangesSchema } from "@/lib/validations/contact";
import type { Prisma } from "@/generated/prisma/client";

/*
 * Bulk actions on leads, deals and contacts: delete, move to a stage, assign, set a field.
 *
 * The functions that change one batch (moveLeads, assignDeals...) are used two ways: by the
 * bulk routes for a small selection, in the request itself, and by runBulkJob for thousands,
 * BATCH at a time, in the background (a BullMQ job, see docs/QUEUES.md). Same code, so the
 * same rules and the same timeline entries either way.
 *
 * A job saves a BulkJob (the ids picked, a snapshot) and is queued. Like imports, each batch
 * and the job's counters are saved in one transaction, so a retried job carries on where it
 * stopped.
 */

export { MAX_BULK } from "@/lib/validations/common";

// records per batch (each batch is one transaction)
const BATCH = 500;

export type BulkEntity = "lead" | "deal" | "contact";
export type BulkAction = "delete" | "stage" | "assign" | "update";
export interface BulkParams {
    stageId?: number;
    lostReason?: string | null;
    assignedToId?: number | null;
    // "update": the field (or custom field) and the value every record gets, as the person sent it
    changes?: unknown;
}

type Tx = Prisma.TransactionClient;
type Agent = { id: number; name: string } | null;

// "Lead assigned to Priya", "Deal reassigned to Priya", "Lead unassigned"
function assignmentEntry(noun: "Lead" | "Deal", before: number | null, agent: Agent) {
    if (!agent) return { type: "UNASSIGNED", message: `${noun} unassigned` };
    return before === null ? { type: "ASSIGNED", message: `${noun} assigned to ${agent.name}` } : { type: "REASSIGNED", message: `${noun} reassigned to ${agent.name}` };
}

// --- One batch of each action. Each takes rows already loaded within the person's scope,
// --- skips the ones already that way, and returns the ones it changed.

export async function moveLeads(
    tx: Tx,
    user: CurrentUser,
    leads: { id: number; stageId: number }[],
    stage: { id: number; name: string; isLost: boolean; isConverted?: boolean },
    lostReason?: string | null,
) {
    const reopenedCopies = !stage.isLost && !stage.isConverted ? await secondOpenLeads(tx, user.organizationId, leads) : new Set<number>();
    // already there, or would be a second open lead for someone (those stay where they are)
    const changed = leads.filter((lead) => lead.stageId !== stage.id && !reopenedCopies.has(lead.id));
    if (changed.length === 0) return changed;

    const names = new Map((await tx.leadStage.findMany({ where: { organizationId: user.organizationId }, select: { id: true, name: true } })).map((item) => [item.id, item.name]));
    await tx.lead.updateMany({
        where: { id: { in: changed.map((lead) => lead.id) }, ...leadScope(user) },
        data: { stageId: stage.id, lostReason: stage.isLost ? (lostReason ?? null) : null, updatedById: user.id },
    });
    await tx.leadTimeline.createMany({
        data: changed.map((lead) => ({ leadId: lead.id, userId: user.id, type: "STATUS_CHANGED", message: stageMessage(names.get(lead.stageId), stage, lostReason) })),
    });
    return changed;
}

// One open lead per person, as when one lead is reopened (PATCH /api/leads/:id): of these leads, the
// closed (lost or converted) ones that reopening would make a second open lead for someone, because
// that person has an open lead already, or an earlier one in this same batch is reopened for them
async function secondOpenLeads(tx: Tx, organizationId: number, leads: { id: number }[]) {
    const reopening = await tx.lead.findMany({
        where: { id: { in: leads.map((lead) => lead.id) }, organizationId, stage: { OR: [{ isLost: true }, { isConverted: true }] } },
        select: { id: true, phoneKey: true, emailKey: true },
        orderBy: { id: "asc" },
    });
    const keysOf = (lead: { phoneKey: string | null; emailKey: string | null }) => [lead.phoneKey && `phone:${lead.phoneKey}`, lead.emailKey && `email:${lead.emailKey}`].filter((key) => key !== null);
    if (reopening.length === 0) return new Set<number>();

    const open = await tx.lead.findMany({
        where: {
            organizationId,
            stage: OPEN_STAGE,
            OR: [{ phoneKey: { in: reopening.flatMap((lead) => lead.phoneKey ?? []) } }, { emailKey: { in: reopening.flatMap((lead) => lead.emailKey ?? []) } }],
        },
        select: { phoneKey: true, emailKey: true },
    });
    const taken = new Set(open.flatMap(keysOf));

    const blocked = new Set<number>();
    for (const lead of reopening) {
        const keys = keysOf(lead);
        if (keys.some((key) => taken.has(key))) blocked.add(lead.id);
        else keys.forEach((key) => taken.add(key));
    }
    return blocked;
}

export async function assignLeads<T extends { id: number; assignedToId: number | null }>(tx: Tx, user: CurrentUser, leads: T[], agent: Agent) {
    const changed = leads.filter((lead) => lead.assignedToId !== (agent?.id ?? null));
    if (changed.length === 0) return changed;

    await tx.lead.updateMany({ where: { id: { in: changed.map((lead) => lead.id) }, organizationId: user.organizationId }, data: { assignedToId: agent?.id ?? null, updatedById: user.id } });
    await tx.leadTimeline.createMany({ data: changed.map((lead) => ({ leadId: lead.id, userId: user.id, ...assignmentEntry("Lead", lead.assignedToId, agent) })) });
    return changed;
}

export async function moveDeals(tx: Tx, user: CurrentUser, deals: { id: number; pipelineStageId: number }[], stage: { id: number; isWon: boolean; isLost: boolean }, lostReason?: string | null) {
    const changed = deals.filter((deal) => deal.pipelineStageId !== stage.id);
    if (changed.length === 0) return changed;

    await tx.deal.updateMany({
        where: { id: { in: changed.map((deal) => deal.id) }, organizationId: user.organizationId },
        data: { pipelineStageId: stage.id, closedAt: closedAtFor(stage), lostReason: stage.isLost ? (lostReason ?? null) : null, updatedById: user.id },
    });
    await tx.dealTimeline.createMany({
        data: changed.map((deal) => ({
            dealId: deal.id,
            userId: user.id,
            type: "STAGE_CHANGED",
            message: stage.isLost && lostReason ? `Deal lost: ${lostReason}` : "Deal moved to a new pipeline stage",
        })),
    });
    return changed;
}

export async function assignDeals<T extends { id: number; assignedToId: number | null }>(tx: Tx, user: CurrentUser, deals: T[], agent: Agent) {
    const changed = deals.filter((deal) => deal.assignedToId !== (agent?.id ?? null));
    if (changed.length === 0) return changed;

    await tx.deal.updateMany({ where: { id: { in: changed.map((deal) => deal.id) }, organizationId: user.organizationId }, data: { assignedToId: agent?.id ?? null, updatedById: user.id } });
    await tx.dealTimeline.createMany({ data: changed.map((deal) => ({ dealId: deal.id, userId: user.id, ...assignmentEntry("Deal", deal.assignedToId, agent) })) });
    return changed;
}

export async function assignContacts<T extends { id: number; assignedToId: number | null }>(tx: Tx, user: CurrentUser, contacts: T[], agent: Agent) {
    const changed = contacts.filter((contact) => contact.assignedToId !== (agent?.id ?? null));
    if (changed.length === 0) return changed;

    await tx.contact.updateMany({ where: { id: { in: changed.map((contact) => contact.id) }, organizationId: user.organizationId }, data: { assignedToId: agent?.id ?? null, updatedById: user.id } });
    return changed;
}

// --- Setting one field (or custom field) to the same value on many records

const CHANGES_SCHEMAS = { lead: bulkLeadChangesSchema, deal: bulkDealChangesSchema, contact: bulkContactChangesSchema };

// What to write, checked and worked out once: the plain fields, the custom fields to merge in,
// and the line each record's timeline gets ("Source set to Google Ads")
export type BulkEdit = { fields: Record<string, unknown>; customFields?: Record<string, unknown>; history: Parameters<typeof bulkHistoryRows>[0] };

/**
 * Checks a field edit for this workspace (a source of its own, valid custom field values) and works
 * out what to write. Run by the bulk routes for a small selection, and by the job, again, for a
 * big one (fields and sources can change in between).
 */
export async function prepareEdit(
    user: CurrentUser,
    entity: BulkEntity,
    changes: unknown,
): Promise<{ ok: true; edit: BulkEdit } | { ok: false; message: string; errors?: unknown }> {
    const parsed = CHANGES_SCHEMAS[entity].safeParse(changes);
    if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Pick a field to change" };
    const { customFields: submitted, ...fields } = parsed.data as Record<string, unknown> & { customFields?: Record<string, unknown> };

    let customFields: Record<string, unknown> | undefined;
    if (submitted) {
        const result = await validateCustomFieldEdit(user.organizationId, entity, submitted);
        if (!result.ok) return { ok: false, message: "Invalid custom field values", errors: result.errors };
        customFields = result.data;
    }
    const customHistory = customFields ? await customFieldBulkValues(user.organizationId, entity, customFields) : [];

    if (entity === "lead") {
        // a source has to be one of this workspace's
        let sourceName: string | null = null;
        if (fields.sourceId) {
            const source = await prisma.leadSource.findFirst({ where: { id: fields.sourceId as number, organizationId: user.organizationId }, select: { name: true } });
            if (!source) return { ok: false, message: "Invalid lead source" };
            sourceName = source.name;
        }
        const history = [
            ...(fields.companyName !== undefined ? [{ field: "companyName", label: "Company", to: fields.companyName as string | null }] : []),
            ...(fields.sourceId !== undefined ? [{ field: "source", label: "Source", to: sourceName }] : []),
            ...customHistory,
        ];
        return { ok: true, edit: { fields, customFields, history } };
    }

    if (entity === "deal") {
        const closeDate = fields.expectedCloseDate as string | null | undefined;
        const history = [
            ...(fields.amount !== undefined ? [{ field: "amount", label: "Amount", to: formatMoneyExact(fields.amount as number, user.organization.currency) }] : []),
            ...(fields.probability !== undefined ? [{ field: "probability", label: "Probability", to: `${fields.probability}%` }] : []),
            ...(closeDate !== undefined
                ? [{ field: "expectedCloseDate", label: "Expected close", to: closeDate && new Date(closeDate).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) }]
                : []),
            ...customHistory,
        ];
        return { ok: true, edit: { fields, customFields, history } };
    }

    // a contact's company is picked by name: found (or made); empty takes them out of their company
    const { companyName, ...plain } = fields as { companyName?: string | null; jobTitle?: string | null };
    const history = [
        ...(plain.jobTitle !== undefined ? [{ field: "jobTitle", label: "Job title", to: plain.jobTitle }] : []),
        ...(companyName !== undefined ? [{ field: "company", label: "Company", to: companyName }] : []),
        ...customHistory,
    ];
    const companyId = companyName === undefined ? undefined : companyName ? (await companyNamed(prisma, user.organizationId, companyName)).id : null;
    return { ok: true, edit: { fields: { ...plain, ...(companyId !== undefined && { companyId }) }, customFields, history } };
}

// Writes an edit to these records (already checked to be within the person's reach): the
// timeline lines, one statement for the plain fields and one for the custom fields
export async function applyEdit(tx: Tx, user: CurrentUser, entity: BulkEntity, ids: number[], edit: BulkEdit) {
    if (ids.length === 0) return;
    const where = { id: { in: ids }, organizationId: user.organizationId };
    const rows = bulkHistoryRows(edit.history, user.id);
    const hasFields = Object.keys(edit.fields).length > 0;
    const data = { ...edit.fields, updatedById: user.id };

    if (entity === "lead") {
        await tx.leadTimeline.createMany({ data: ids.flatMap((leadId) => rows.map((row) => ({ ...row, leadId }))) });
        if (hasFields) await tx.lead.updateMany({ where, data });
        if (edit.customFields) await tx.$executeRaw(mergeCustomFieldsSql("Lead", ids, user, edit.customFields));
        // their contacts move to that company too, so they show on the Companies page
        if (edit.fields.companyName !== undefined) await moveToCompany(tx, user.organizationId, ids, edit.fields.companyName as string | null);
    } else if (entity === "deal") {
        await tx.dealTimeline.createMany({ data: ids.flatMap((dealId) => rows.map((row) => ({ ...row, dealId }))) });
        if (hasFields) await tx.deal.updateMany({ where, data });
        if (edit.customFields) await tx.$executeRaw(mergeCustomFieldsSql("Deal", ids, user, edit.customFields));
    } else {
        await tx.contactTimeline.createMany({ data: ids.flatMap((contactId) => rows.map((row) => ({ ...row, contactId }))) });
        if (hasFields) await tx.contact.updateMany({ where, data });
        if (edit.customFields) await tx.$executeRaw(mergeCustomFieldsSql("Contact", ids, user, edit.customFields));
    }
}

// --- What an action needs, looked up and checked once (by the route that starts a job, and
// --- again by the job itself: things can change in between)

// The stage to move to, if it's this workspace's own
export function findStage(organizationId: number, entity: BulkEntity, stageId: number | undefined) {
    if (stageId === undefined || entity === "contact") return Promise.resolve(null);
    return entity === "lead"
        ? // a lead stage is never "won" (leads convert instead), which moveDeals' closedAt doesn't apply to anyway
          prisma.leadStage.findFirst({ where: { id: stageId, organizationId }, select: { id: true, name: true, isLost: true, isConverted: true } }).then((stage) => stage && { ...stage, isWon: false })
        : prisma.pipelineStage.findFirst({ where: { id: stageId, organizationId }, select: { id: true, name: true, isLost: true, isWon: true } });
}

// The teammate to assign to (null = unassign), if they're in this workspace
export async function findAgent(organizationId: number, assignedToId: number | null | undefined): Promise<Agent | undefined> {
    if (assignedToId === null || assignedToId === undefined) return null;
    return (await prisma.user.findFirst({ where: { id: assignedToId, organizationId }, select: { id: true, name: true } })) ?? undefined;
}

// What an action needs permission-wise: the same rules as the single-record routes
export function mayDo(user: CurrentUser, entity: BulkEntity, action: BulkAction) {
    if (action === "delete") return hasPermission(user, `${entity}:delete`);
    // handing records to others (or taking them away) is a manager action
    if (action === "assign") return hasPermission(user, `${entity}:update`) && hasPermission(user, `${entity}:all`);
    return hasPermission(user, `${entity}:update`);
}

// --- The job

type Plan = { stage: Awaited<ReturnType<typeof findStage>>; agent: Agent; lostReason?: string | null; edit?: BulkEdit };

// One batch of a job: only among the records this person may still touch (the same scope as the
// lists); anything already gone or now out of reach is skipped. Returns how many it changed, and
// which ones it moved to a new stage (their automations start once the batch is saved)
async function runBatch(tx: Tx, user: CurrentUser, entity: BulkEntity, action: BulkAction, ids: number[], plan: Plan) {
    const where = { id: { in: ids } };
    const changed = (records: { id: number }[]) => ({ affected: records.length, moved: action === "stage" ? records.map((record) => record.id) : [] });

    // into the recycle bin first, in the batch's own transaction
    if (action === "delete") {
        const scope = entity === "lead" ? leadScope(user) : entity === "deal" ? dealScope(user) : contactScope(user);
        return { affected: await deleteToBin(tx, user, entity, { ...where, ...scope }), moved: [] };
    }

    // the same edit on every record of the batch this person can still reach
    if (action === "update") {
        const scope = entity === "lead" ? leadScope(user) : entity === "deal" ? dealScope(user) : contactScope(user);
        const query = { where: { ...where, ...scope }, select: { id: true } };
        const reachable = entity === "lead" ? await tx.lead.findMany(query) : entity === "deal" ? await tx.deal.findMany(query) : await tx.contact.findMany(query);
        await applyEdit(tx, user, entity, reachable.map((record) => record.id), plan.edit!);
        return { affected: reachable.length, moved: [] };
    }

    if (entity === "lead") {
        const leads = await tx.lead.findMany({ where: { ...where, ...leadScope(user) }, select: { id: true, stageId: true, assignedToId: true } });
        return changed(action === "stage" ? await moveLeads(tx, user, leads, plan.stage!, plan.lostReason) : await assignLeads(tx, user, leads, plan.agent));
    }
    if (entity === "deal") {
        const deals = await tx.deal.findMany({ where: { ...where, ...dealScope(user) }, select: { id: true, pipelineStageId: true, assignedToId: true } });
        return changed(action === "stage" ? await moveDeals(tx, user, deals, plan.stage!, plan.lostReason) : await assignDeals(tx, user, deals, plan.agent));
    }
    const contacts = await tx.contact.findMany({ where: { ...where, ...contactScope(user) }, select: { id: true, assignedToId: true } });
    return changed(await assignContacts(tx, user, contacts, plan.agent));
}

// What the live progress carries
const progressSelect = { id: true, entity: true, action: true, status: true, total: true, processed: true, affected: true, error: true } as const;

function report(userId: number, progress: object) {
    getSocketServer()?.to(userRoom(userId)).emit("bulk-progress", progress);
}

export async function runBulkJob(bulkJobId: number) {
    const job = await prisma.bulkJob.findUnique({ where: { id: bulkJobId } });
    if (!job || job.status === "DONE") return;
    if (job.action === "restore") return runRestoreJob(job);

    const entity = job.entity as BulkEntity;
    const action = job.action as BulkAction;
    const params = job.params as BulkParams;

    const user = await userForJob(job.userId);
    if (!user) throw new Error("The person who started this has left the workspace");
    // checked again now, not just when it was started: permissions and stages can change in between
    if (!mayDo(user, entity, action)) throw new Error(`You can no longer ${action === "delete" ? "delete" : "change"} ${entity}s`);
    const stage = await findStage(user.organizationId, entity, params.stageId);
    if (action === "stage" && !stage) throw new Error("That stage no longer exists");
    const agent = await findAgent(user.organizationId, params.assignedToId);
    if (agent === undefined) throw new Error("That teammate is no longer in the workspace");
    const prepared = action === "update" ? await prepareEdit(user, entity, params.changes) : null;
    if (prepared && !prepared.ok) throw new Error(prepared.message);

    report(user.id, await prisma.bulkJob.update({ where: { id: job.id }, data: { status: "RUNNING" }, select: progressSelect }));

    for (let start = job.processed; start < job.ids.length; start += BATCH) {
        const batch = job.ids.slice(start, start + BATCH);

        const { progress, moved } = await prisma.$transaction(
            async (tx) => {
                const { affected, moved } = await runBatch(tx, user, entity, action, batch, { stage, agent, lostReason: params.lostReason, edit: prepared?.edit });
                const progress = await tx.bulkJob.update({
                    where: { id: job.id },
                    data: { processed: { increment: batch.length }, affected: { increment: affected } },
                    select: progressSelect,
                });
                return { progress, moved };
            },
            // deleting 500 leads also removes their timelines, notes, tasks and activities
            { timeout: 120_000, maxWait: 10_000 },
        );

        // the "moves to a stage" rules, the same as for a drag on the board
        if (stage && entity !== "contact") await startAutomations(...stageEvents(entity, job.organizationId, moved, stage));

        report(user.id, progress);
        // everyone's lists change as it goes
        broadcastChange(job.organizationId, `${entity}s`);
    }

    const done = await prisma.bulkJob.update({ where: { id: job.id }, data: { status: "DONE", finishedAt: new Date() }, select: progressSelect });
    report(user.id, done);

    // one notification for the whole job, not one per batch
    if (action === "assign" && agent && done.affected > 0 && entity !== "contact") {
        await notify([agent.id], {
            organizationId: job.organizationId,
            actorId: user.id,
            type: entity === "lead" ? "LEAD_ASSIGNED" : "DEAL_ASSIGNED",
            title: `${firstName(user.name)} assigned you ${done.affected.toLocaleString()} ${entity}s`,
            link: `/${entity}s`,
        });
    }
}

// items restored between progress updates (each is its own transaction, so this is only how often the card moves)
const RESTORE_BATCH = 25;

/**
 * Restoring thousands from the recycle bin (Restore on "Select all"): the ids are bin items. Each
 * one is rebuilt with its history; one that can't go back (the person has another open lead now)
 * is skipped. A retried job carries on: anything already restored is no longer in the bin.
 */
async function runRestoreJob(job: { id: number; userId: number; organizationId: number; ids: number[]; processed: number }) {
    const user = await userForJob(job.userId);
    if (!user) throw new Error("The person who started this has left the workspace");

    report(user.id, await prisma.bulkJob.update({ where: { id: job.id }, data: { status: "RUNNING" }, select: progressSelect }));

    for (let start = job.processed; start < job.ids.length; start += RESTORE_BATCH) {
        const batch = job.ids.slice(start, start + RESTORE_BATCH);
        const { restored } = await restoreMany(user, batch);
        report(
            user.id,
            await prisma.bulkJob.update({ where: { id: job.id }, data: { processed: { increment: batch.length }, affected: { increment: restored } }, select: progressSelect }),
        );
        // the bin, and the lists they go back into, refresh for everyone as it goes
        broadcastChange(job.organizationId, "recycle-bin");
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
