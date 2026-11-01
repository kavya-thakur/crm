"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { IconCalendarDue, IconCircle, IconCircleCheckFilled, IconPlus } from "@tabler/icons-react";

import { api, errorMessage } from "@/lib/api/client";
import { Avatar } from "@/components/Avatar";
import { Dropdown, MenuItem } from "@/components/Dropdown";
import { ErrorState } from "@/components/ErrorState";
import { SkeletonList, Spinner } from "@/components/Loader";
import type { SelectOption } from "@/components/Select";
import { toast } from "@/components/Toast";
import { formatDay } from "@/lib/format";
import { TASK_PRIORITIES, isOverdue, refreshTasks, type Paginated, type Task, type TaskLink, type TaskPriority } from "../tasks/shared";

type TaskEntity = "lead" | "deal" | "contact";

const LINK_KEYS = { lead: "leadId", deal: "dealId", contact: "contactId" } as const;

// A tinted pill for a priority, so Low / Medium / High read at a glance
export function PriorityBadge({ priority }: { priority: TaskPriority }) {
    const { label, className } = TASK_PRIORITIES.find((item) => item.value === priority)!;

    return <span className={`inline-flex h-5 items-center rounded-full px-2 text-sm font-medium ${className}`}>{label}</span>;
}

// The priorities as options for the app's Select, each shown as its coloured pill
export const PRIORITY_OPTIONS: SelectOption[] = TASK_PRIORITIES.map(({ value, label }) => ({
    value,
    label,
    render: <PriorityBadge priority={value} />,
}));

// A menu (the app's own, not a native <select>) for picking a priority, for places
// where a bordered form field would be too heavy, like a record panel
export function PriorityDropdown({
    value,
    onChange,
    align,
}: {
    value: TaskPriority;
    onChange: (value: TaskPriority) => void;
    align?: "left" | "right";
}) {
    return (
        <Dropdown
            align={align}
            buttonClassName="flex h-7 items-center rounded-lg px-1 hover:bg-fill"
            label={<PriorityBadge priority={value} />}
        >
            {(close) =>
                TASK_PRIORITIES.map((option) => (
                    <MenuItem
                        key={option.value}
                        selected={option.value === value}
                        onClick={() => { if (option.value !== value) onChange(option.value); close(); }}
                    >
                        <PriorityBadge priority={option.value} />
                    </MenuItem>
                ))
            }
        </Dropdown>
    );
}

// The Tasks tab of a lead, deal or contact: that record's own to-do list
export function TasksTab({ entity, recordId }: { entity: TaskEntity; recordId: number }) {
    const [scope, setScope] = useState<"open" | "completed">("open");
    const link = { [LINK_KEYS[entity]]: recordId } as TaskLink;

    const tasksQuery = useQuery({
        queryKey: ["tasks", "record", entity, recordId, scope],
        queryFn: () => api.get<Paginated<Task>>("/tasks", { params: { scope, ...link, limit: 100 } }).then((res) => res.data.data),
    });

    return (
        <div className="flex flex-col gap-3">
            <QuickAdd link={link} />

            <div className="flex gap-1 font-medium text-muted">
                {(["open", "completed"] as const).map((value) => (
                    <button
                        key={value}
                        type="button"
                        onClick={() => setScope(value)}
                        className={`flex h-7 items-center rounded-lg px-2.5 capitalize ${value === scope ? "bg-fill text-ink" : "hover:bg-app"}`}
                    >
                        {value}
                    </button>
                ))}
            </div>

            {tasksQuery.isPending && <SkeletonList rows={3} />}
            {tasksQuery.isError && (
                <ErrorState variant="inline" title="Couldn't load tasks" error={tasksQuery.error} onRetry={() => tasksQuery.refetch()} retrying={tasksQuery.isFetching} />
            )}
            {tasksQuery.isSuccess && tasksQuery.data.length === 0 && (
                <p className="text-light">{scope === "open" ? "No open tasks — add one above." : "Nothing completed yet."}</p>
            )}

            {tasksQuery.data && tasksQuery.data.length > 0 && (
                <ul className="overflow-hidden rounded-lg border border-line">
                    {tasksQuery.data.map((task) => (
                        <TaskRow key={task.id} task={task} />
                    ))}
                </ul>
            )}
        </div>
    );
}

// One task in the list: tick it off with the circle, click the title to open it
function TaskRow({ task }: { task: Task }) {
    const queryClient = useQueryClient();
    const done = task.status === "COMPLETED";

    const toggle = useMutation({
        mutationFn: () => api.put(`/tasks/${task.id}`, { status: done ? "PENDING" : "COMPLETED" }),
        onSuccess: () => {
            toast.success(done ? "Task reopened" : "Task completed");
            refreshTasks(queryClient);
        },
        onError: (error) => toast.error(errorMessage(error)),
    });

    return (
        <li className="flex h-9 items-center gap-2.5 border-b border-line-light px-3 last:border-b-0 hover:bg-paper">
            <button
                type="button"
                aria-label={done ? "Mark as not completed" : "Mark as completed"}
                onClick={() => toggle.mutate()}
                disabled={toggle.isPending}
                className="flex shrink-0 items-center text-faint hover:text-accent disabled:opacity-60"
            >
                {done ? <IconCircleCheckFilled size={16} className="text-accent" /> : <IconCircle size={16} />}
            </button>

            <Link
                href={`/tasks?open=${task.id}`}
                className={`min-w-0 flex-1 truncate hover:underline ${done ? "text-faint line-through" : "text-ink"}`}
            >
                {task.title}
            </Link>

            <PriorityBadge priority={task.priority} />

            <span className={`flex shrink-0 items-center gap-1 text-sm ${isOverdue(task) ? "font-medium text-danger" : "text-faint"}`}>
                <IconCalendarDue size={14} />
                {formatDay(task.dueDate)}
            </span>
            <Avatar name={task.assignedTo.name} />
        </li>
    );
}

// One line to jot a task down for this record: a title, the day it's due and how
// important it is. It's assigned to you; open the task to hand it to someone else.
function QuickAdd({ link }: { link: TaskLink }) {
    const queryClient = useQueryClient();
    const [title, setTitle] = useState("");
    // the user's own calendar day, so "today" is what they'd expect
    const [dueDate, setDueDate] = useState(() => new Date().toLocaleDateString("en-CA"));
    const [priority, setPriority] = useState<TaskPriority>("MEDIUM");

    const create = useMutation({
        mutationFn: () => api.post("/tasks", { title, dueDate, priority, ...link }),
        onSuccess: () => {
            toast.success("Task added");
            setTitle("");
            setPriority("MEDIUM");
            refreshTasks(queryClient);
        },
    });

    const canSubmit = title.trim() !== "" && dueDate !== "" && !create.isPending;

    return (
        <form
            onSubmit={(event) => {
                event.preventDefault();
                if (canSubmit) create.mutate();
            }}
        >
            <div className="flex h-9 items-center gap-2 rounded-lg border border-line bg-surface pr-1 pl-3 focus-within:border-accent focus-within:ring-3 focus-within:ring-accent-soft">
                <IconPlus size={14} className="shrink-0 text-faint" />
                <input
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder="Add a task..."
                    aria-label="Task title"
                    className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-light"
                />
                <input
                    type="date"
                    value={dueDate}
                    onChange={(event) => setDueDate(event.target.value)}
                    aria-label="Due date"
                    className="h-7 rounded-lg bg-transparent px-1 text-sm text-muted outline-none hover:bg-fill"
                />
                <PriorityDropdown value={priority} onChange={setPriority} align="right" />
                <button
                    type="submit"
                    disabled={!canSubmit}
                    className="flex h-7 items-center gap-1 rounded-lg bg-accent px-2.5 font-medium text-on-accent hover:bg-accent-hover disabled:opacity-60"
                >
                    {create.isPending && <Spinner size={14} />}
                    Add
                </button>
            </div>

            {create.isError && <p role="alert" className="mt-1.5 px-1 text-sm text-danger">{errorMessage(create.error)}</p>}
        </form>
    );
}
