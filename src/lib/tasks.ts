import type { Prisma } from "@/generated/prisma/client";

// What every task response carries: who has to do it, and the record it's about
export const taskInclude = {
    assignedTo: { select: { id: true, name: true, email: true } },
    lead: { select: { id: true, name: true } },
    deal: { select: { id: true, title: true } },
    contact: { select: { id: true, name: true } },
} satisfies Prisma.TaskInclude;

// "2026-11-05" -> midnight UTC of that day, which is what a date-only column stores
export function dueDateToDb(dueDate: string) {
    return new Date(`${dueDate}T00:00:00.000Z`);
}

// ponytail: "today" is the UTC day, so for a few hours around midnight a task can
// look overdue (or not yet) a few hours off for users far from UTC; store each
// user's timezone if that ever matters
export function startOfToday() {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    return today;
}

interface TimelineTask {
    id: number;
    title: string;
    leadId: number | null;
    dealId: number | null;
    contactId: number | null;
}

// Puts a task on the timeline of the lead, deal or contact it belongs to. The entry
// only shows the task's title; clicking it opens the task on the Tasks page.
// A task that isn't linked to any record has no timeline, so nothing is written.
export async function addTaskToTimeline(
    tx: Prisma.TransactionClient,
    task: TimelineTask,
    userId: number,
    event: "created" | "completed"
) {
    const entry = {
        userId,
        type: event === "created" ? "TASK_CREATED" : "TASK_COMPLETED",
        message: `Task ${event}: ${task.title}`,
        metadata: { taskId: task.id },
    };

    if (task.leadId) {
        await tx.leadTimeline.create({ data: { ...entry, leadId: task.leadId } });
    } else if (task.dealId) {
        await tx.dealTimeline.create({ data: { ...entry, dealId: task.dealId } });
    } else if (task.contactId) {
        await tx.contactTimeline.create({ data: { ...entry, contactId: task.contactId } });
    }
}
