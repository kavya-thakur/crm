"use client";

import { useEffect, useRef } from "react";
import {
    IconCalendar,
    IconCalendarDue,
    IconChecklist,
    IconCircle,
    IconCircleCheckFilled,
    IconFlag,
    IconLink,
    IconPlus,
    IconUserCircle,
} from "@tabler/icons-react";
import Link from "next/link";

import { Avatar } from "@/components/Avatar";
import { DataCell, type DataColumn, type EditConfig } from "@/components/DataTable";
import { ErrorState } from "@/components/ErrorState";
import { SkeletonRows } from "@/components/Loader";
import type { SelectOption } from "@/components/Select";
import { formatDate, formatDay } from "@/lib/format";
import type { AgentOption } from "../shared/customFields";
import { PRIORITY_OPTIONS, PriorityBadge } from "../shared/tasks";
import { linkedRecord } from "../shared/linkedRecord";
import { isOverdue, type Task, type TaskScope } from "./shared";

const EMPTY_STATE: Record<TaskScope, { title: string; hint: string }> = {
    open: { title: "You're all caught up", hint: "Add a task to keep track of what needs doing." },
    overdue: { title: "Nothing is overdue", hint: "Tasks past their due date show up here." },
    completed: { title: "No completed tasks yet", hint: "Tick a task off and it moves here." },
    all: { title: "Add your first task", hint: "Tasks you create or are assigned to show up here." },
};

// Title is pinned (it's how a task is opened); the rest are plain columns,
// with Due date, Priority and Assigned to editable in place via the hover pencil
function buildColumns(context: {
    agents?: AgentOption[];
    onUpdate: (task: Task, changes: Record<string, unknown>) => void;
}): DataColumn<Task>[] {
    const agentOptions: SelectOption[] = (context.agents ?? []).map((agent) => ({ value: String(agent.id), label: agent.name }));

    const dueDateEdit: EditConfig<Task> = {
        type: "date",
        getValue: (task) => task.dueDate.slice(0, 10),
        // a task needs a due day, so clearing it just keeps the old one
        onSave: (task, value) => value && context.onUpdate(task, { dueDate: value }),
    };

    const priorityEdit: EditConfig<Task> = {
        type: "select",
        getValue: (task) => task.priority,
        options: PRIORITY_OPTIONS,
        onSave: (task, value) => value && context.onUpdate(task, { priority: value }),
    };

    const assignedToEdit: EditConfig<Task> = {
        type: "select",
        getValue: (task) => String(task.assignedTo.id),
        options: agentOptions,
        // every task needs someone to do it, so there's no "unassigned" to pick
        onSave: (task, value) => value && context.onUpdate(task, { assignedToId: Number(value) }),
    };

    return [
        {
            key: "dueDate", label: "Due date", icon: IconCalendarDue, width: 160,
            edit: dueDateEdit,
            cell: (task) => (
                <span className={isOverdue(task) ? "font-medium text-danger" : ""}>{formatDay(task.dueDate)}</span>
            ),
        },
        {
            key: "priority", label: "Priority", icon: IconFlag, width: 140,
            edit: priorityEdit,
            cell: (task) => <PriorityBadge priority={task.priority} />,
        },
        {
            key: "assignedTo", label: "Assigned to", icon: IconUserCircle, width: 180,
            ...(context.agents && { edit: assignedToEdit }),
            cell: (task) => (
                <span className="flex items-center gap-1.5">
                    <Avatar name={task.assignedTo.name} />
                    <span className="truncate">{task.assignedTo.name}</span>
                </span>
            ),
        },
        {
            key: "about", label: "About", icon: IconLink, width: 200,
            cell: (task) => {
                const record = linkedRecord(task);

                return record && (
                    <Link href={record.href} className="flex items-center gap-1.5 hover:underline">
                        <record.icon size={14} className="shrink-0 text-faint" />
                        <span className="truncate">{record.label}</span>
                    </Link>
                );
            },
        },
        { key: "createdAt", label: "Created", icon: IconCalendar, width: 150, cell: (task) => formatDate(task.createdAt) },
    ];
}

interface TasksTableProps {
    tasks: Task[];
    scope: TaskScope;
    agents?: AgentOption[];
    loading: boolean;
    failed: boolean;
    error: unknown;
    onRetry: () => void;
    hasMore: boolean;
    loadingMore: boolean;
    onLoadMore: () => void;
    onToggle: (task: Task) => void;
    onUpdate: (task: Task, changes: Record<string, unknown>) => void;
    onOpen: (id: number) => void;
    onCreate: () => void;
}

export default function TasksTable({
    tasks, scope, agents, loading, failed, error, onRetry, hasMore, loadingMore, onLoadMore, onToggle, onUpdate, onOpen, onCreate,
}: TasksTableProps) {
    // Infinite scroll: when this invisible div at the bottom comes into view, load the next page
    const bottomRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const bottom = bottomRef.current;
        if (!bottom || !hasMore || loadingMore) return;

        const observer = new IntersectionObserver(([entry]) => entry.isIntersecting && onLoadMore());
        observer.observe(bottom);
        return () => observer.disconnect();
    }, [hasMore, loadingMore, onLoadMore]);

    const columns = buildColumns({ agents, onUpdate });
    const colSpan = columns.length + 3;

    if (failed) {
        return <ErrorState title="Couldn't load tasks" error={error} onRetry={onRetry} />;
    }

    return (
        <>
            <table className="w-max min-w-full table-fixed border-separate border-spacing-0">
                <thead>
                    <tr className="[&>th]:sticky [&>th]:top-0 [&>th]:z-10 [&>th]:h-8 [&>th]:border-r [&>th]:border-b [&>th]:border-line-light [&>th]:bg-surface [&>th]:px-2 [&>th]:text-left [&>th]:font-medium [&>th]:text-faint">
                        <th className="left-0 z-20! w-8 px-0!" />
                        <th className="left-8 z-20! w-80">
                            <span className="flex items-center gap-1">
                                <IconChecklist size={16} />
                                Title
                            </span>
                        </th>
                        {columns.map((column) => (
                            <th key={column.key} style={{ width: column.width }}>
                                <span className="flex items-center gap-1">
                                    <column.icon size={16} />
                                    <span className="truncate">{column.label}</span>
                                </span>
                            </th>
                        ))}
                        {/* empty column that takes the leftover width, like Twenty */}
                        <th className="border-r-0!" />
                    </tr>
                </thead>

                <tbody>
                    {tasks.map((task) => {
                        const done = task.status === "COMPLETED";

                        return (
                            <tr
                                key={task.id}
                                className="[&>td]:h-8 [&>td]:border-r [&>td]:border-b [&>td]:border-line-light [&>td]:bg-surface [&>td]:px-2 [&>td]:whitespace-nowrap"
                            >
                                <td className="sticky left-0 z-1 px-0! text-center">
                                    <button
                                        type="button"
                                        aria-label={done ? `Mark "${task.title}" as not completed` : `Mark "${task.title}" as completed`}
                                        onClick={() => onToggle(task)}
                                        className="inline-flex items-center text-faint hover:text-accent"
                                    >
                                        {done ? <IconCircleCheckFilled size={16} className="text-accent" /> : <IconCircle size={16} />}
                                    </button>
                                </td>
                                <td className="sticky left-8 z-1 px-1!">
                                    <button
                                        type="button"
                                        onClick={() => onOpen(task.id)}
                                        className={`flex max-w-full items-center rounded px-1 py-0.5 hover:bg-fill ${done ? "text-faint line-through" : ""}`}
                                    >
                                        <span className="truncate">{task.title}</span>
                                    </button>
                                </td>
                                {columns.map((column) => (
                                    <DataCell key={column.key} record={task} column={column} />
                                ))}
                                <td className="border-r-0!" />
                            </tr>
                        );
                    })}

                    {(loading || loadingMore) && <SkeletonRows colSpan={colSpan} />}

                    {!loading && (
                        <tr>
                            <td colSpan={colSpan} className="border-b border-line-light p-0">
                                <button
                                    type="button"
                                    onClick={onCreate}
                                    className="sticky left-0 flex h-8 w-full items-center gap-2 px-2 text-faint hover:bg-paper"
                                >
                                    <IconPlus size={16} className="text-muted" />
                                    Add New
                                </button>
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>

            {!loading && tasks.length === 0 && (
                <div className="flex flex-col items-center gap-3 py-20 text-center">
                    <span className="flex size-10 items-center justify-center rounded-lg border border-line bg-paper text-faint">
                        <IconChecklist size={20} />
                    </span>
                    <div>
                        <p className="font-medium">{EMPTY_STATE[scope].title}</p>
                        <p className="mt-1 text-faint">{EMPTY_STATE[scope].hint}</p>
                    </div>
                </div>
            )}

            <div ref={bottomRef} className="h-px" />
        </>
    );
}
