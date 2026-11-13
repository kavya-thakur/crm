import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import { hasPermission, type CurrentUser } from "@/lib/auth/requirePermission";
import { findOpenCopy, isOpen } from "@/lib/leads/duplicates";
import { closedAtFor } from "@/lib/deals/stages";

/*
 * The recycle bin (Settings > Recycle bin). Deleting a lead, deal or contact still deletes it for
 * real, so every list, search and count works exactly as before. But first, deleteToBin() keeps a
 * copy of it and of everything the database deletes with it (timeline, notes, tasks, calls and
 * meetings, emails) in DeletedRecord. For BIN_DAYS it can be put back as it was, with the same id,
 * so links to it work again. Like a Mongo "trash" collection you copy the document into before
 * calling deleteOne.
 */

export const BIN_DAYS = 30;
export const BIN_ENTITIES = ["lead", "deal", "contact"] as const;
export type BinEntity = (typeof BIN_ENTITIES)[number];

type Tx = Prisma.TransactionClient;
type Row = Record<string, unknown> & { id: number };

// Everything that's deleted along with a record (onDelete: Cascade in the schema)
const withChildren = {
    timeline: true,
    notes: true,
    tasks: true,
    scheduledActivities: { include: { attendees: { select: { id: true } } } },
    emails: true,
} as const;

// A row as plain JSON: dates become ISO strings, a deal's Decimal amount a string
const toJson = (row: object) => JSON.parse(JSON.stringify(row)) as Prisma.InputJsonObject;

/**
 * Puts the records matching `where` in the bin, then deletes them. Returns how many were deleted.
 * Run it inside the caller's transaction, so a record is never deleted without its copy.
 */
export async function deleteToBin(tx: Tx, user: CurrentUser, entity: BinEntity, where: object) {
    const records: (Row & { assignedToId: number | null; name?: string; title?: string })[] =
        entity === "lead"
            ? await tx.lead.findMany({ where, include: { ...withChildren, deals: { select: { id: true } } } })
            : entity === "deal"
              ? await tx.deal.findMany({ where, include: { ...withChildren, products: true } })
              : await tx.contact.findMany({ where, include: { ...withChildren, leads: { select: { id: true } } } });
    if (records.length === 0) return 0;

    await tx.deletedRecord.createMany({
        data: records.map((record) => ({
            organizationId: user.organizationId,
            entity,
            recordId: record.id,
            name: (record.name ?? record.title ?? "").slice(0, 200),
            data: toJson(record),
            ownerId: record.assignedToId,
            deletedById: user.id,
        })),
    });

    const byId = { id: { in: records.map((record) => record.id) } };
    const { count } =
        entity === "lead"
            ? await tx.lead.deleteMany({ where: byId })
            : entity === "deal"
              ? await tx.deal.deleteMany({ where: byId })
              : await tx.contact.deleteMany({ where: byId });
    return count;
}

// What this person may see and restore in the bin: the kinds they can delete, and of those, all
// of them with `<kind>:all`, otherwise only the ones that were theirs or that they deleted
export function binScope(user: CurrentUser): Prisma.DeletedRecordWhereInput {
    return {
        organizationId: user.organizationId,
        OR: BIN_ENTITIES.filter((entity) => hasPermission(user, `${entity}:delete`)).map((entity) => ({
            entity,
            ...(!hasPermission(user, `${entity}:all`) && { OR: [{ ownerId: user.id }, { deletedById: user.id }] }),
        })),
    };
}

// The bin as the page shows it: this person's part of it, one kind ("lead") or all, by name
export function binWhere(user: CurrentUser, filter: { entity?: BinEntity; search?: string }): Prisma.DeletedRecordWhereInput {
    return {
        AND: [
            binScope(user),
            ...(filter.entity ? [{ entity: filter.entity }] : []),
            ...(filter.search ? [{ name: { contains: filter.search, mode: "insensitive" as const } }] : []),
        ],
    };
}

// Older than BIN_DAYS: gone for good. Run when the bin is looked at, so no scheduled job is needed
export function emptyOldBin(organizationId: number) {
    return prisma.deletedRecord.deleteMany({ where: { organizationId, deletedAt: { lt: new Date(Date.now() - BIN_DAYS * 24 * 60 * 60 * 1000) } } });
}

// ---------------------------------------------------------------------------
// Restoring
// ---------------------------------------------------------------------------

type Snapshot = Row & {
    timeline: Row[];
    notes: Row[];
    tasks: Row[];
    scheduledActivities: (Row & { attendees: { id: number }[] })[];
    emails: Row[];
    deals?: { id: number }[];
    leads?: { id: number }[];
    // a deal's quote lines
    products?: Row[];
};

export class RestoreProblem extends Error {}

/**
 * Puts a binned record back: the record (same id), then its timeline, notes, tasks, calls and
 * meetings and emails, and relinks the deals (or leads) that pointed at it. Whatever it pointed at
 * that's gone since is let go: a deleted stage becomes the first stage, a removed owner nobody.
 * Throws RestoreProblem when it can't go back as it is (the person has another open lead now).
 */
export async function restoreFromBin(user: CurrentUser, binId: number) {
    const item = await prisma.deletedRecord.findFirst({ where: { id: binId, ...binScope(user) } });
    if (!item) return null;

    const entity = item.entity as BinEntity;
    const data = item.data as unknown as Snapshot;
    const org = { organizationId: user.organizationId };

    // the people it mentions who are still in the workspace
    const mentioned = [data, ...data.timeline, ...data.notes, ...data.tasks, ...data.scheduledActivities, ...data.emails].flatMap((row) =>
        ["assignedToId", "createdById", "updatedById", "userId", "authorId", "sentById"].map((key) => row[key]).filter((id): id is number => typeof id === "number"),
    );
    const attendeeIds = data.scheduledActivities.flatMap((activity) => activity.attendees.map((attendee) => attendee.id));
    const present = new Set(
        (await prisma.user.findMany({ where: { ...org, id: { in: [...mentioned, ...attendeeIds] } }, select: { id: true } })).map((person) => person.id),
    );
    // someone still here, or nobody (for optional fields), or whoever is restoring it (for required ones)
    const known = (id: unknown) => (typeof id === "number" && present.has(id) ? id : null);
    const someone = (id: unknown) => known(id) ?? user.id;

    // the other records its tasks, calls and emails were also linked to, if they still exist
    const linkedIds = (key: "leadId" | "dealId" | "contactId") =>
        [...data.tasks, ...data.scheduledActivities, ...data.emails].map((row) => row[key]).filter((id): id is number => typeof id === "number");
    const [leads, deals, contacts] = await Promise.all([
        prisma.lead.findMany({ where: { ...org, id: { in: linkedIds("leadId") } }, select: { id: true } }),
        prisma.deal.findMany({ where: { ...org, id: { in: linkedIds("dealId") } }, select: { id: true } }),
        prisma.contact.findMany({ where: { ...org, id: { in: linkedIds("contactId") } }, select: { id: true } }),
    ]);
    const stillThere = { leadId: new Set(leads.map((row) => row.id)), dealId: new Set(deals.map((row) => row.id)), contactId: new Set(contacts.map((row) => row.id)) };
    const self = { [`${entity}Id`]: data.id };
    // a child's links: itself to the restored record, the others only if they still exist
    const links = (row: Row) => ({
        leadId: stillThere.leadId.has(row.leadId as number) ? (row.leadId as number) : null,
        dealId: stillThere.dealId.has(row.dealId as number) ? (row.dealId as number) : null,
        contactId: stillThere.contactId.has(row.contactId as number) ? (row.contactId as number) : null,
        ...self,
    });

    const json = (value: unknown) => (value === null || value === undefined ? undefined : (value as Prisma.InputJsonValue));

    await prisma.$transaction(async (tx) => {
        const stamp = { userId: user.id, type: "RESTORED", message: "Restored from the recycle bin" };

        if (entity === "lead") {
            const stage =
                (await tx.leadStage.findFirst({ where: { ...org, id: data.stageId as number } })) ??
                (await tx.leadStage.findFirst({ where: org, orderBy: { order: "asc" } }));
            if (!stage) throw new RestoreProblem("This workspace has no lead stages to put it in");
            if (isOpen(stage)) {
                const copy = await findOpenCopy(user.organizationId, { email: data.email as string | null, phone: data.phone as string | null });
                if (copy) throw new RestoreProblem(`${data.name} has another open lead now ("${copy.name}"). Close or merge that one first.`);
            }
            const [source, contact] = await Promise.all([
                data.sourceId ? tx.leadSource.findFirst({ where: { ...org, id: data.sourceId as number }, select: { id: true } }) : null,
                data.contactId ? tx.contact.findFirst({ where: { ...org, id: data.contactId as number }, select: { id: true } }) : null,
            ]);

            await tx.lead.create({
                data: {
                    id: data.id,
                    ...org,
                    name: data.name as string,
                    email: data.email as string | null,
                    phone: data.phone as string | null,
                    companyName: data.companyName as string | null,
                    customFields: json(data.customFields),
                    lostReason: stage.id === data.stageId ? (data.lostReason as string | null) : null,
                    utmSource: data.utmSource as string | null,
                    utmMedium: data.utmMedium as string | null,
                    utmCampaign: data.utmCampaign as string | null,
                    stageId: stage.id,
                    sourceId: source?.id ?? null,
                    contactId: contact?.id ?? null,
                    assignedToId: known(data.assignedToId),
                    createdById: known(data.createdById),
                    updatedById: user.id,
                    createdAt: data.createdAt as string,
                },
            });
            await tx.leadTimeline.createMany({
                data: [...data.timeline.map((entry) => ({ ...timelineRow(entry, someone), leadId: data.id })), { ...stamp, leadId: data.id }],
            });
            await tx.leadNote.createMany({ data: data.notes.map((note) => ({ ...noteRow(note, someone), leadId: data.id })) });
            // its deals were kept (only unlinked): link them back
            await tx.deal.updateMany({ where: { ...org, id: { in: (data.deals ?? []).map((deal) => deal.id) }, leadId: null }, data: { leadId: data.id } });
        } else if (entity === "deal") {
            const stage =
                (await tx.pipelineStage.findFirst({ where: { ...org, id: data.pipelineStageId as number } })) ??
                // its stage (or whole pipeline) was deleted since: the first stage of the first pipeline
                (await tx.pipelineStage.findFirst({ where: org, orderBy: [{ pipeline: { order: "asc" } }, { pipelineId: "asc" }, { order: "asc" }, { id: "asc" }] }));
            if (!stage) throw new RestoreProblem("This workspace has no pipeline stages to put it in");
            const lead = data.leadId ? await tx.lead.findFirst({ where: { ...org, id: data.leadId as number }, select: { id: true } }) : null;
            const sameStage = stage.id === data.pipelineStageId;

            await tx.deal.create({
                data: {
                    id: data.id,
                    ...org,
                    title: data.title as string,
                    amount: data.amount as string,
                    probability: data.probability as number,
                    expectedCloseDate: data.expectedCloseDate as string | null,
                    description: data.description as string | null,
                    customFields: json(data.customFields),
                    closedAt: sameStage ? (data.closedAt as string | null) : closedAtFor(stage),
                    lostReason: sameStage ? (data.lostReason as string | null) : null,
                    pipelineStageId: stage.id,
                    leadId: lead?.id ?? null,
                    assignedToId: known(data.assignedToId),
                    createdById: known(data.createdById),
                    updatedById: user.id,
                    createdAt: data.createdAt as string,
                },
            });
            await tx.dealTimeline.createMany({
                data: [...data.timeline.map((entry) => ({ ...timelineRow(entry, someone), dealId: data.id })), { ...stamp, dealId: data.id }],
            });
            await tx.dealNote.createMany({ data: data.notes.map((note) => ({ ...noteRow(note, someone), dealId: data.id })) });
            // its quote lines, still pointing at their catalogue product if it's there
            const lines = data.products ?? [];
            const products = new Set(
                (await tx.product.findMany({ where: { ...org, id: { in: lines.map((line) => line.productId as number).filter(Boolean) } }, select: { id: true } })).map((product) => product.id),
            );
            await tx.dealProduct.createMany({
                data: lines.map((line) => ({
                    dealId: data.id,
                    productId: products.has(line.productId as number) ? (line.productId as number) : null,
                    name: line.name as string,
                    price: line.price as string,
                    quantity: line.quantity as number,
                    discountPercent: line.discountPercent as number,
                    taxPercent: line.taxPercent as number,
                    createdAt: line.createdAt as string,
                })),
            });
        } else {
            // a phone number belongs to one contact per workspace
            const samePhone = await tx.contact.findFirst({ where: { ...org, phone: data.phone as string }, select: { name: true } });
            if (samePhone) throw new RestoreProblem(`Another contact (${samePhone.name}) has the phone number ${data.phone} now`);
            const company = data.companyId ? await tx.company.findFirst({ where: { ...org, id: data.companyId as number }, select: { id: true } }) : null;

            await tx.contact.create({
                data: {
                    id: data.id,
                    ...org,
                    name: data.name as string,
                    email: data.email as string | null,
                    phone: data.phone as string,
                    jobTitle: data.jobTitle as string | null,
                    description: data.description as string | null,
                    customFields: json(data.customFields),
                    companyId: company?.id ?? null,
                    assignedToId: known(data.assignedToId),
                    createdById: known(data.createdById),
                    updatedById: user.id,
                    createdAt: data.createdAt as string,
                },
            });
            await tx.contactTimeline.createMany({
                data: [...data.timeline.map((entry) => ({ ...timelineRow(entry, someone), contactId: data.id })), { ...stamp, contactId: data.id }],
            });
            await tx.contactNote.createMany({ data: data.notes.map((note) => ({ ...noteRow(note, someone), contactId: data.id })) });
            // its leads were kept (only unlinked): link them back
            await tx.lead.updateMany({ where: { ...org, id: { in: (data.leads ?? []).map((lead) => lead.id) }, contactId: null }, data: { contactId: data.id } });
        }

        // what was deleted with it
        await tx.task.createMany({
            data: data.tasks.map((task) => ({
                id: task.id,
                ...org,
                title: task.title as string,
                description: task.description as string | null,
                status: task.status as "PENDING",
                priority: task.priority as "MEDIUM",
                completedAt: task.completedAt as string | null,
                dueDate: task.dueDate as string,
                assignedToId: someone(task.assignedToId),
                createdById: someone(task.createdById),
                createdAt: task.createdAt as string,
                ...links(task),
            })),
        });
        for (const activity of data.scheduledActivities) {
            await tx.scheduledActivity.create({
                data: {
                    id: activity.id,
                    ...org,
                    type: activity.type as "CALL",
                    status: activity.status as "SCHEDULED",
                    title: activity.title as string,
                    description: activity.description as string | null,
                    scheduledAt: activity.scheduledAt as string,
                    durationMinutes: activity.durationMinutes as number | null,
                    reminderSentAt: activity.reminderSentAt as string | null,
                    assignedToId: someone(activity.assignedToId),
                    createdById: someone(activity.createdById),
                    createdAt: activity.createdAt as string,
                    ...links(activity),
                    attendees: { connect: activity.attendees.filter((attendee) => present.has(attendee.id)).map((attendee) => ({ id: attendee.id })) },
                },
            });
        }
        await tx.email.createMany({
            data: data.emails.map((email) => ({
                id: email.id,
                ...org,
                to: email.to as string,
                subject: email.subject as string,
                body: email.body as string,
                status: email.status as string,
                error: email.error as string | null,
                sentAt: email.sentAt as string | null,
                openedAt: email.openedAt as string | null,
                trackingToken: email.trackingToken as string,
                sentById: known(email.sentById),
                createdAt: email.createdAt as string,
                ...links(email),
            })),
        });

        await tx.deletedRecord.delete({ where: { id: item.id } });
    });

    return { entity, recordId: data.id, name: item.name };
}

/**
 * Restores several, one at a time (each in its own transaction, so one that can't go back doesn't
 * stop the rest). Contacts first, so leads and deals restored with them link straight back.
 * Returns how many came back, and why the first few couldn't.
 */
export async function restoreMany(user: CurrentUser, binIds: number[]) {
    const items = await prisma.deletedRecord.findMany({ where: { id: { in: binIds }, ...binScope(user) }, select: { id: true, entity: true } });
    const order = ["contact", "lead", "deal"];
    items.sort((a, b) => order.indexOf(a.entity) - order.indexOf(b.entity));

    let restored = 0;
    const problems: string[] = [];
    for (const item of items) {
        try {
            if (await restoreFromBin(user, item.id)) restored++;
        } catch (error) {
            if (!(error instanceof RestoreProblem)) throw error;
            if (problems.length < 3) problems.push(error.message);
        }
    }
    return { restored, problems };
}

// A timeline entry or note, back as it was (its writer, if they've left, becomes the restorer)
function timelineRow(entry: Row, someone: (id: unknown) => number) {
    return {
        id: entry.id,
        userId: someone(entry.userId),
        type: entry.type as string,
        message: entry.message as string,
        metadata: entry.metadata === null || entry.metadata === undefined ? undefined : (entry.metadata as Prisma.InputJsonValue),
        createdAt: entry.createdAt as string,
    };
}

function noteRow(note: Row, someone: (id: unknown) => number) {
    return { id: note.id, authorId: someone(note.authorId), body: note.body as string, createdAt: note.createdAt as string, updatedAt: note.updatedAt as string };
}
