"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
    IconCalendar,
    IconCalendarDue,
    IconCircle,
    IconCircleCheckFilled,
    IconClock,
    IconFileDescription,
    IconFlag,
    IconLink,
    IconProgress,
    IconTrash,
    IconUserCircle,
    IconX,
} from "@tabler/icons-react";

import { api, errorMessage } from "@/lib/api/client";
import { Avatar } from "@/components/Avatar";
import { ConfirmDeleteModal } from "@/components/ListPage";
import { Dropdown, MenuItem } from "@/components/Dropdown";
import { ErrorState } from "@/components/ErrorState";
import { PageLoader } from "@/components/Loader";
import { toast } from "@/components/Toast";
import { formatDate, timeAgo } from "@/lib/format";
import { usePanelEnter } from "../shared/usePanelEnter";
import type { AgentOption } from "../shared/customFields";
import { PriorityDropdown } from "../shared/tasks";
import { linkedRecord } from "../shared/linkedRecord";
import { isOverdue, refreshTasks, type Task, type TaskPriority } from "./shared";

type TaskChanges = Partial<{
    title: string;
    description: string | null;
    dueDate: string;
    priority: TaskPriority;
    assignedToId: number;
    status: Task["status"];
}>;

// Twenty's record side panel: fields you can click to edit on the left, the description on the right
export default function TaskPanel({ taskId, agents, onClose }: { taskId: number; agents?: AgentOption[]; onClose: () => void }) {
    const queryClient = useQueryClient();
    const [confirmingDelete, setConfirmingDelete] = useState(false);
    const enterRef = usePanelEnter<HTMLDivElement>();

    const taskQuery = useQuery({
        queryKey: ["task", taskId],
        queryFn: () => api.get<{ data: Task }>(`/tasks/${taskId}`).then((res) => res.data.data),
        // a deleted task stays missing, no point asking again
        retry: false,
    });

    const update = useMutation({
        mutationFn: (changes: TaskChanges) => api.put<{ data: Task }>(`/tasks/${taskId}`, changes),
        onSuccess: (res, changes) => {
            toast.success(changes.status === "COMPLETED" ? "Task completed" : changes.status === "PENDING" ? "Task reopened" : "Task updated");
            // show the saved value right away, then refresh the lists and timelines
            queryClient.setQueryData(["task", taskId], res.data.data);
            refreshTasks(queryClient);
        },
    });

    const remove = useMutation({
        mutationFn: () => api.delete(`/tasks/${taskId}`),
        onSuccess: () => {
            toast.success("Task deleted");
            refreshTasks(queryClient);
            onClose();
        },
    });

    const task = taskQuery.data;
    const done = task?.status === "COMPLETED";
    const record = task ? linkedRecord(task) : null;
    const mutationError = update.error ?? remove.error;

    return (
        <div ref={enterRef} className="flex h-full min-h-0 flex-col">
            <header className="flex h-12 shrink-0 items-center gap-1.5 border-b border-line bg-paper px-3">
                <IconCircleCheckFilled size={16} className="text-accent" />
                <button type="button" onClick={onClose} className="rounded px-1 text-muted hover:bg-fill hover:text-ink">
                    Tasks
                </button>
                <span className="text-faint">/</span>
                <span className="truncate rounded px-1 font-semibold">{task?.title ?? "..."}</span>

                <div className="ml-auto flex items-center gap-0.5">
                    {task && (
                        <button
                            type="button"
                            aria-label="Delete task"
                            onClick={() => setConfirmingDelete(true)}
                            className="flex size-7 items-center justify-center rounded-lg text-muted hover:bg-danger-soft hover:text-danger"
                        >
                            <IconTrash size={16} />
                        </button>
                    )}
                    <button
                        type="button"
                        aria-label="Close"
                        onClick={onClose}
                        className="flex size-7 items-center justify-center rounded-lg text-muted hover:bg-fill hover:text-ink"
                    >
                        <IconX size={16} />
                    </button>
                </div>
            </header>

            {taskQuery.isPending && <PageLoader label="Loading task" variant="record" />}
            {taskQuery.isError && (
                <ErrorState title="Couldn't load task" error={taskQuery.error} onRetry={() => taskQuery.refetch()} retrying={taskQuery.isFetching} />
            )}

            {task && (
                <div className="flex min-h-0 flex-1">
                    {/* Fields: left column, Twenty's record-page width */}
                    <div className="flex w-full max-w-sm shrink-0 flex-col overflow-y-auto border-r border-line-light">
                        {/* Identifier: the circle finishes (or reopens) the task, then its title */}
                        <div className="flex items-center gap-3 border-b border-line-light px-4 py-4">
                            <button
                                type="button"
                                aria-label={done ? "Mark as not completed" : "Mark as completed"}
                                onClick={() => update.mutate({ status: done ? "PENDING" : "COMPLETED" })}
                                disabled={update.isPending}
                                className="flex size-10 shrink-0 items-center justify-center rounded-full text-faint hover:bg-fill hover:text-accent disabled:opacity-60"
                            >
                                {done ? <IconCircleCheckFilled size={28} className="text-accent" /> : <IconCircle size={28} />}
                            </button>
                            <div className="min-w-0 flex-1">
                                <EditableText
                                    value={task.title}
                                    placeholder="Title"
                                    // a task needs a title, so clearing it just keeps the old one
                                    onSave={(title) => title && update.mutate({ title })}
                                    className={`text-lg font-semibold ${done ? "text-faint line-through" : ""}`}
                                />
                                <p className="px-1 text-faint">Added {timeAgo(task.createdAt)}</p>
                            </div>
                        </div>

                        {/* Fields */}
                        <section className="space-y-0.5 px-3 py-3">
                            <SectionLabel>Fields</SectionLabel>

                            <FieldRow icon={IconProgress} label="Status">
                                <StatusBadge task={task} />
                            </FieldRow>

                            <FieldRow icon={IconCalendarDue} label="Due date">
                                <input
                                    type="date"
                                    defaultValue={task.dueDate.slice(0, 10)}
                                    // saved when you leave the field; clearing it is ignored (a task needs a day)
                                    onBlur={(event) => {
                                        const next = event.target.value;
                                        if (next && next !== task.dueDate.slice(0, 10)) update.mutate({ dueDate: next });
                                    }}
                                    className={`h-7 rounded-lg px-1 outline-none hover:bg-fill focus:bg-fill ${isOverdue(task) ? "font-medium text-danger" : ""}`}
                                />
                            </FieldRow>

                            <FieldRow icon={IconFlag} label="Priority">
                                <PriorityDropdown value={task.priority} onChange={(priority) => update.mutate({ priority })} />
                            </FieldRow>

                            <FieldRow icon={IconUserCircle} label="Assigned to">
                                {agents ? (
                                    <Dropdown
                                        buttonClassName="flex h-7 max-w-full items-center gap-1.5 rounded-lg px-1 hover:bg-fill"
                                        label={<AssigneeLabel task={task} />}
                                    >
                                        {(close) => (
                                            <>
                                                {agents.map((agent) => (
                                                    <MenuItem
                                                        key={agent.id}
                                                        selected={agent.id === task.assignedTo.id}
                                                        onClick={() => { if (agent.id !== task.assignedTo.id) update.mutate({ assignedToId: agent.id }); close(); }}
                                                    >
                                                        <Avatar name={agent.name} /> {agent.name}
                                                    </MenuItem>
                                                ))}
                                            </>
                                        )}
                                    </Dropdown>
                                ) : (
                                    <span className="flex h-7 items-center gap-1.5 px-1">
                                        <AssigneeLabel task={task} />
                                    </span>
                                )}
                            </FieldRow>

                            {record && (
                                <FieldRow icon={IconLink} label="About">
                                    <Link href={record.href} className="flex h-7 max-w-full items-center gap-1.5 rounded-lg px-1 hover:bg-fill">
                                        <record.icon size={14} className="shrink-0 text-faint" />
                                        <span className="truncate">{record.label}</span>
                                    </Link>
                                </FieldRow>
                            )}

                            <SectionLabel>System</SectionLabel>

                            <FieldRow icon={IconCalendar} label="Created">
                                <span className="px-1">{formatDate(task.createdAt)}</span>
                            </FieldRow>

                            <FieldRow icon={IconClock} label="Updated">
                                <span className="px-1">{timeAgo(task.updatedAt)}</span>
                            </FieldRow>

                            {mutationError && <p role="alert" className="px-1 pt-1 text-danger">{errorMessage(mutationError)}</p>}
                        </section>
                    </div>

                    {/* Description: takes the rest of the width, under a tab-style header like the other records */}
                    <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">
                        <div className="flex h-11 shrink-0 items-center gap-1 border-b border-line-light px-4">
                            <span className="flex h-8 items-center gap-1.5 border-b-2 border-accent px-2 text-sm font-medium text-ink">
                                <IconFileDescription size={14} />
                                Description
                            </span>
                        </div>

                        <section className="px-4 py-4">
                            <EditableText
                                multiline
                                value={task.description}
                                placeholder="Add a description..."
                                onSave={(description) => update.mutate({ description })}
                            />
                        </section>
                    </div>
                </div>
            )}

            <ConfirmDeleteModal
                open={confirmingDelete}
                title={`Delete ${task?.title}?`}
                pending={remove.isPending}
                onCancel={() => setConfirmingDelete(false)}
                onConfirm={() => remove.mutate()}
            />
        </div>
    );
}

// Groups rows within the Fields section — Twenty splits a record's panel
// into Fields / Relations / System the same way.
function SectionLabel({ children }: { children: React.ReactNode }) {
    return <p className="mt-2 mb-0.5 px-1 text-xs font-semibold tracking-wide text-faint uppercase first:mt-0">{children}</p>;
}

function FieldRow({ icon: Icon, label, children }: { icon: typeof IconClock; label: string; children: React.ReactNode }) {
    return (
        <div className="flex min-h-8 items-center gap-1">
            <span className="flex w-24 shrink-0 items-center gap-1 text-sm text-faint">
                <Icon size={16} />
                {label}
            </span>
            <div className="min-w-0 flex-1">{children}</div>
        </div>
    );
}

function AssigneeLabel({ task }: { task: Task }) {
    return (
        <>
            <Avatar name={task.assignedTo.name} />
            <span className="truncate">{task.assignedTo.name}</span>
        </>
    );
}

// A pending task past its day reads "Overdue" (red); otherwise Pending (blue) or Completed (green)
function StatusBadge({ task }: { task: Task }) {
    const [label, colour] =
        task.status === "COMPLETED"
            ? ["Completed", "bg-[#e6f6eb] text-[#00824d]"]
            : isOverdue(task)
                ? ["Overdue", "bg-danger-soft text-danger"]
                : ["Pending", "bg-accent-soft text-accent"];

    return <span className={`ml-1 inline-flex h-5 items-center rounded-full px-2 text-sm font-medium ${colour}`}>{label}</span>;
}

interface EditableTextProps {
    value: string | null;
    placeholder: string;
    onSave: (value: string | null) => void;
    multiline?: boolean;
    className?: string;
}

// Shows the value; click it to edit. Clicking away saves, Esc cancels, and Enter saves
// too (unless it's multi-line, where Enter starts a new line).
function EditableText({ value, placeholder, onSave, multiline, className = "" }: EditableTextProps) {
    const [editing, setEditing] = useState(false);

    if (editing) {
        const editorProps = {
            autoFocus: true,
            defaultValue: value ?? "",
            placeholder,
            onBlur: (event: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
                setEditing(false);
                const next = event.target.value.trim();
                // empty = clear the field (null), unchanged = no request
                if (next !== (value ?? "")) onSave(next || null);
            },
            onKeyDown: (event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
                if (event.key === "Enter" && !multiline) event.currentTarget.blur();
                if (event.key === "Escape") {
                    event.stopPropagation(); // cancel the edit, don't close the panel
                    event.currentTarget.value = value ?? "";
                    event.currentTarget.blur();
                }
            },
        };

        return multiline ? (
            <textarea rows={10} {...editorProps} className="w-full rounded-lg border border-line-strong bg-surface px-2 py-1.5 outline-none" />
        ) : (
            <input {...editorProps} className={`h-7 w-full rounded-lg border border-line-strong bg-surface px-1 outline-none ${className}`} />
        );
    }

    return (
        <button
            type="button"
            onClick={() => setEditing(true)}
            className={`w-full rounded-lg px-1 text-left hover:bg-fill ${multiline ? "min-h-24 px-2 py-1.5 whitespace-pre-wrap" : "flex h-7 items-center"} ${value ? "" : "text-light"} ${className}`}
        >
            <span className={multiline ? "" : "truncate"}>{value || placeholder}</span>
        </button>
    );
}
