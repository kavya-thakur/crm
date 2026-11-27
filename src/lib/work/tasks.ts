import type { Prisma } from "@/generated/prisma/client";
import { addToTimeline } from "./timeline";

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

// Today's date where the person is, as a date-only column stores it (midnight UTC of that day),
// so it compares straight against due dates. Pass the browser's time zone ("Asia/Kolkata").
// ponytail: without one it's the UTC day, which jobs and the task list still use; for a few
// hours around midnight they can be a day off for someone far from UTC
export function startOfToday(timeZone = "UTC", now = new Date()) {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
    const part = (type: string) => parts.find((item) => item.type === type)!.value;
    return dueDateToDb(`${part("year")}-${part("month")}-${part("day")}`);
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
    await addToTimeline(tx, task, {
        userId,
        type: event === "created" ? "TASK_CREATED" : "TASK_COMPLETED",
        message: `Task ${event}: ${task.title}`,
        metadata: { taskId: task.id },
    });
}

// "No next step": nothing planned for a lead or deal, no open task and no booked call or meeting.
// The dashboard's Needs attention counts and the Leads / Deals "No next step" filter both use this
// (with "still open"), so a count and the list it links to always agree.
export const noNextStep = {
    tasks: { none: { status: { not: "COMPLETED" as const } } },
    scheduledActivities: { none: { status: "SCHEDULED" as const } },
};
