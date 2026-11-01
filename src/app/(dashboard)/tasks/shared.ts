import type { QueryClient } from "@tanstack/react-query";

// After any change: refetch every task list and the open task, plus the lead, deal
// and contact panels, whose timelines show their tasks
export function refreshTasks(queryClient: QueryClient) {
    for (const key of ["tasks", "task", "lead", "deal", "contact"]) {
        queryClient.invalidateQueries({ queryKey: [key] });
    }
}

export interface Task {
    id: number;
    title: string;
    description: string | null;
    status: "PENDING" | "COMPLETED";
    priority: TaskPriority;
    // a day, stored as midnight UTC: "2026-11-05T00:00:00.000Z"
    dueDate: string;
    createdAt: string;
    updatedAt: string;
    assignedTo: { id: number; name: string; email: string };
    lead: { id: number; name: string } | null;
    deal: { id: number; title: string } | null;
    contact: { id: number; name: string } | null;
}

export type TaskPriority = "LOW" | "MEDIUM" | "HIGH";

// Lowest to highest, with the colours each shows in
export const TASK_PRIORITIES: { value: TaskPriority; label: string; className: string }[] = [
    { value: "LOW", label: "Low", className: "bg-app text-muted" },
    { value: "MEDIUM", label: "Medium", className: "bg-[#ffefd6] text-[#d14e00]" },
    { value: "HIGH", label: "High", className: "bg-danger-soft text-danger" },
];

export type TaskScope = "open" | "overdue" | "completed" | "all";

// The one record a new task is about, if any
export interface TaskLink {
    leadId?: number;
    dealId?: number;
    contactId?: number;
}

export interface Paginated<T> {
    data: T[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
}

// Same "today" the API uses, so a task looks overdue exactly when the Overdue tab lists it
export function isOverdue(task: Task) {
    return task.status === "PENDING" && task.dueDate.slice(0, 10) < new Date().toISOString().slice(0, 10);
}
