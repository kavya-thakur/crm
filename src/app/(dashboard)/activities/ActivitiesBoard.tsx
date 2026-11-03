"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { api, errorMessage } from "@/lib/api/client";
import { DoneCheck } from "@/components/DoneCheck";
import { Board, BoardCard, BoardColumn, CardControl, CardFields, ColumnTitle, useBoardColumn } from "@/components/Board";
import type { DataColumn } from "@/components/DataTable";
import { toast } from "@/components/Toast";
import type { AgentOption } from "../shared/customFields";
import { toggledStatus } from "../shared/activities";
import { activityColumns } from "./ActivitiesTable";
import { ACTIVITY_TYPES, isOverdue, refreshActivities, type Activity, type ActivityStatus } from "./shared";

// In board order, with each column's dot colour
const COLUMNS: { value: ActivityStatus; label: string; color: string; empty: string }[] = [
    { value: "SCHEDULED", label: "Scheduled", color: "#0d74ce", empty: "Nothing scheduled" },
    { value: "COMPLETED", label: "Done", color: "#218358", empty: "Nothing done yet" },
    { value: "CANCELLED", label: "Cancelled", color: "#8d8d8d", empty: "Nothing cancelled" },
];

// the table's columns that also show on a card; Status is the column the card sits in
const CARD_FIELDS = ["scheduledAt", "type", "duration", "assignedTo", "attendees", "about"];

// Scheduled, Done, Cancelled. Drag a card across to change its status, or edit its type,
// length and owner right on the card. Scheduled ones run soonest first.
export default function ActivitiesBoard({
    mineOnly,
    agents,
    onOpen,
    onCreate,
}: {
    mineOnly: boolean;
    agents?: AgentOption[];
    onOpen: (id: number) => void;
    onCreate: () => void;
}) {
    const queryClient = useQueryClient();

    const update = useMutation({
        mutationFn: ({ id, changes }: { id: number; changes: Record<string, unknown> }) => api.put(`/activities/${id}`, changes),
        onSuccess: (_, { changes }) => {
            const column = COLUMNS.find((item) => item.value === changes.status);
            toast.success(column ? `Moved to ${column.label}` : "Activity updated");
            refreshActivities(queryClient);
        },
        onError: (error) => toast.error(errorMessage(error)),
    });

    const fields = activityColumns({ agents, onUpdate: (activity, changes) => update.mutate({ id: activity.id, changes }) }).filter((column) =>
        CARD_FIELDS.includes(column.key),
    );

    return (
        <Board>
            {COLUMNS.map((column) => (
                <StatusColumn
                    key={column.value}
                    column={column}
                    mineOnly={mineOnly}
                    fields={fields}
                    onChange={(id, status) => update.mutate({ id, changes: { status } })}
                    onOpen={onOpen}
                    onAdd={column.value === "SCHEDULED" ? onCreate : undefined}
                />
            ))}
        </Board>
    );
}

function StatusColumn({
    column,
    mineOnly,
    fields,
    onChange,
    onOpen,
    onAdd,
}: {
    column: (typeof COLUMNS)[number];
    mineOnly: boolean;
    fields: DataColumn<Activity>[];
    onChange: (id: number, status: ActivityStatus) => void;
    onOpen: (id: number) => void;
    onAdd?: () => void;
}) {
    const paged = useBoardColumn<Activity>(["activities", "board", column.value, mineOnly], "/activities", {
        scope: "all",
        status: column.value,
        assignedTo: mineOnly ? "me" : undefined,
    });
    const activities = paged.items;

    return (
        <BoardColumn
            id={column.value}
            title={<ColumnTitle color={column.color}>{column.label}</ColumnTitle>}
            count={paged.total}
            more={paged.more}
            loading={paged.loading}
            error={paged.error}
            onRetry={paged.retry}
            emptyText={column.empty}
            onDropCard={(id) => onChange(id, column.value)}
            onAdd={onAdd}
        >
            {activities.map((activity) => {
                const { icon: TypeIcon } = ACTIVITY_TYPES.find((item) => item.value === activity.type)!;
                const done = activity.status === "COMPLETED";
                return (
                    <BoardCard key={activity.id} id={activity.id} columnId={column.value} draggable onOpen={() => onOpen(activity.id)}>
                        <div className="flex items-start gap-2">
                            {activity.status === "CANCELLED" ? (
                                <TypeIcon size={18} className="mt-0.5 shrink-0 text-light" />
                            ) : (
                                <CardControl className="-mt-0.5 -ml-0.5">
                                    <DoneCheck
                                        done={done}
                                        size={18}
                                        label={done ? "Mark as not done" : "Mark as done"}
                                        onClick={() => onChange(activity.id, toggledStatus(activity.status))}
                                        className="size-6"
                                    />
                                </CardControl>
                            )}
                            <p
                                className={`line-clamp-2 min-w-0 flex-1 font-medium ${
                                    activity.status === "SCHEDULED" ? "text-ink" : "text-muted"
                                }`}
                            >
                                {activity.title}
                            </p>
                            {isOverdue(activity) && (
                                <span className="shrink-0 rounded-full bg-danger-soft px-1.5 text-sm font-medium text-danger">Overdue</span>
                            )}
                        </div>
                        {activity.description && <p className="mt-1 line-clamp-2 pl-8 text-sm text-faint">{activity.description}</p>}
                        <CardFields record={activity} columns={fields} />
                    </BoardCard>
                );
            })}
        </BoardColumn>
    );
}
