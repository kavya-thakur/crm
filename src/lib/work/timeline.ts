import type { Prisma } from "@/generated/prisma/client";

/*
 * Timeline entries that point at something else: a task, a scheduled activity, the deal a lead
 * became, or the web form / integration a lead came in through. Written on the server, read by
 * the lead, deal and contact panels (only types here, so it's safe in the browser too).
 */
export interface TimelineMetadata {
    taskId?: number;
    activityId?: number;
    dealId?: number;
    formId?: number;
    // a note on the timeline: which one, and who it @-mentions (its text is the entry's message)
    noteId?: number;
    mentionedUserIds?: number[];
    // came in through a lead integration (Google Ads, IVR...), not a web form
    integration?: boolean;
}

// Where an entry's text links to, if anywhere
export function timelineHref(metadata: TimelineMetadata | null | undefined) {
    if (metadata?.taskId) return `/tasks?open=${metadata.taskId}`;
    if (metadata?.activityId) return `/activities?open=${metadata.activityId}`;
    if (metadata?.dealId) return `/deals?open=${metadata.dealId}`;
    return null;
}

// Who an entry is shown as: a teammate's name, or the form or integration a lead came through
export function timelineActor(entry: { type: string; metadata?: TimelineMetadata | null; user: { name: string } }) {
    if (entry.type !== "WEB_FORM") return entry.user.name;
    return entry.metadata?.integration ? "Lead integration" : "Web form";
}

// A note's line on its record's timeline: the whole note, so the timeline shows it as a card.
// Rewritten when the note is edited, removed when it's deleted (noteEntry finds it).
export const noteOnTimeline = (note: { id: number; body: string; mentionedUserIds: number[] }) => ({
    type: "NOTE_ADDED",
    message: note.body,
    metadata: { noteId: note.id, mentionedUserIds: note.mentionedUserIds },
});

// The timeline entry of one note (a JSON match on its metadata)
export const noteEntry = (noteId: number) => ({ type: "NOTE_ADDED", metadata: { path: ["noteId"], equals: noteId } });

/**
 * One entry on the timeline of the lead, deal or contact something belongs to (the first one
 * set). Something linked to none of them has no timeline, so nothing is written.
 */
export async function addToTimeline(
    db: Prisma.TransactionClient,
    record: { leadId?: number | null; dealId?: number | null; contactId?: number | null },
    entry: { userId: number; type: string; message: string; metadata?: TimelineMetadata },
) {
    const data = { ...entry, metadata: entry.metadata as Prisma.InputJsonValue | undefined };
    if (record.leadId) await db.leadTimeline.create({ data: { ...data, leadId: record.leadId } });
    else if (record.dealId) await db.dealTimeline.create({ data: { ...data, dealId: record.dealId } });
    else if (record.contactId) await db.contactTimeline.create({ data: { ...data, contactId: record.contactId } });
}
