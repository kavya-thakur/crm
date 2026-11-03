"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { api, errorMessage } from "@/lib/api/client";
import { DoneCheck } from "@/components/DoneCheck";
import { Board, BoardCard, BoardColumn, CardControl, CardFields, ColumnTitle, useBoardColumn } from "@/components/Board";
import type { DataColumn } from "@/components/DataTable";
import { toast } from "@/components/Toast";
import type { AgentOption } from "../shared/customFields";
import { taskColumns } from "./TasksTable";
import { TASK_STATUSES, refreshTasks, type Task, type TaskPriority, type TaskStatus } from "./shared";

// the table's columns that also show on a card; Status is the column the card sits in
const CARD_FIELDS = ["dueDate", "priority", "assignedTo", "about"];

interface TaskFilters {
    assignedTo?: "me";
    priority?: TaskPriority;
}

// To do, In progress, Done. Drag a card across to change its status, tick its circle
// to finish it, or edit its due date, priority and assignee right on the card.
export default function TasksBoard({
    filters,
    agents,
    onOpen,
    onCreate,
}: {
    filters: TaskFilters;
    agents?: AgentOption[];
    onOpen: (id: number) => void;
    onCreate: () => void;
}) {
    const queryClient = useQueryClient();

    const update = useMutation({
        mutationFn: ({ id, changes }: { id: number; changes: Record<string, unknown> }) => api.put(`/tasks/${id}`, changes),
        onSuccess: (_, { changes }) => {
            const status = TASK_STATUSES.find((item) => item.value === changes.status);
            toast.success(status ? `Moved to ${status.label}` : "Task updated");
            refreshTasks(queryClient);
        },
        onError: (error) => toast.error(errorMessage(error)),
    });

    const fields = taskColumns({ agents, onUpdate: (task, changes) => update.mutate({ id: task.id, changes }) }).filter((column) =>
        CARD_FIELDS.includes(column.key),
    );

    return (
        <Board>
            {TASK_STATUSES.map((status) => (
                <StatusColumn
                    key={status.value}
                    status={status}
                    filters={filters}
                    fields={fields}
                    onChange={(id, changes) => update.mutate({ id, changes })}
                    onOpen={onOpen}
                    onAdd={status.value === "PENDING" ? onCreate : undefined}
                />
            ))}
        </Board>
    );
}

function StatusColumn({
    status,
    filters,
    fields,
    onChange,
    onOpen,
    onAdd,
}: {
    status: (typeof TASK_STATUSES)[number];
    filters: TaskFilters;
    fields: DataColumn<Task>[];
    onChange: (id: number, changes: { status: TaskStatus }) => void;
    onOpen: (id: number) => void;
    onAdd?: () => void;
}) {
    const column = useBoardColumn<Task>(["tasks", "board", status.value, filters], "/tasks", { scope: "all", status: status.value, ...filters });
    const tasks = column.items;

    return (
        <BoardColumn
            id={status.value}
            title={<ColumnTitle color={status.color}>{status.label}</ColumnTitle>}
            count={column.total}
            more={column.more}
            loading={column.loading}
            error={column.error}
            onRetry={column.retry}
            emptyText={status.value === "COMPLETED" ? "Nothing done yet" : "No tasks"}
            onDropCard={(id) => onChange(id, { status: status.value })}
            onAdd={onAdd}
        >
            {tasks.map((task) => {
                const done = task.status === "COMPLETED";
                return (
                    <BoardCard key={task.id} id={task.id} columnId={status.value} draggable onOpen={() => onOpen(task.id)}>
                        <div className="flex items-start gap-2">
                            <CardControl className="-mt-0.5 -ml-0.5">
                                <DoneCheck
                                    done={done}
                                    size={18}
                                    label={done ? "Mark as not done" : "Mark as done"}
                                    onClick={() => onChange(task.id, { status: done ? "PENDING" : "COMPLETED" })}
                                    className="size-6"
                                />
                            </CardControl>
                            <p className={`line-clamp-2 min-w-0 flex-1 font-medium ${done ? "text-muted" : "text-ink"}`}>{task.title}</p>
                        </div>
                        {task.description && <p className="mt-1 line-clamp-2 pl-8 text-sm text-faint">{task.description}</p>}
                        <CardFields record={task} columns={fields} />
                    </BoardCard>
                );
            })}
        </BoardColumn>
    );
}
