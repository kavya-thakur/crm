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

type ColumnId = "OVERDUE" | "TODAY" | "UPCOMING" | "COMPLETED" | "CANCELLED";

// Scheduled ones split by when they're due, so what's slipped and what's on today stand out
const DUE_COLUMNS: ColumnId[] = ["OVERDUE", "TODAY", "UPCOMING"];

// In board order, with each column's dot colour
const COLUMNS: { value: ColumnId; label: string; color: string; empty: string }[] = [
    { value: "OVERDUE", label: "Overdue", color: "#dc3e42", empty: "Nothing overdue" },
    { value: "TODAY", label: "Today", color: "#ef5f00", empty: "Nothing else today" },
    { value: "UPCOMING", label: "Upcoming", color: "#0d74ce", empty: "Nothing coming up" },
    { value: "COMPLETED", label: "Done", color: "#218358", empty: "Nothing done yet" },
    { value: "CANCELLED", label: "Cancelled", color: "#8d8d8d", empty: "Nothing cancelled" },
];

// What each column asks the API for. Overdue = scheduled and its time has passed; Today = the
// rest of today (in this browser's time zone); Upcoming = from tomorrow on.
function columnParams(column: ColumnId) {
    const endOfToday = new Date();
    endOfToday.setHours(24, 0, 0, 0);
    if (column === "OVERDUE") return { scope: "overdue" };
    if (column === "TODAY") return { scope: "upcoming", to: endOfToday.toISOString() };
    if (column === "UPCOMING") return { scope: "upcoming", from: endOfToday.toISOString() };
    return { scope: "all", status: column };
}

// the table's columns that also show on a card; Status is the column the card sits in
const CARD_FIELDS = ["scheduledAt", "type", "duration", "assignedTo", "attendees", "about"];

// Overdue, Today, Upcoming, Done, Cancelled. Drag a card to Done or Cancelled (or back) to change
// its status, or edit its type, time, length and owner right on the card. Its time decides which
// of the first three it's in. Scheduled ones run soonest first.
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
            toast.success(column ? `Moved to ${column.label}` : changes.status === "SCHEDULED" ? "Scheduled again" : "Activity updated");
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
                    onAdd={column.value === "TODAY" ? onCreate : undefined}
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
        ...columnParams(column.value),
        assignedTo: mineOnly ? "me" : undefined,
    });
    const activities = paged.items;
    const isDue = DUE_COLUMNS.includes(column.value);

    // Into Done or Cancelled sets that; into Overdue, Today or Upcoming from Done or Cancelled
    // schedules it again (its time picks the column). Between those three it's the time that
    // decides, so say how instead of pretending to move it.
    function drop(id: number, from: string) {
        if (!isDue) return onChange(id, column.value as ActivityStatus);
        if (DUE_COLUMNS.includes(from as ColumnId)) return toast.info("Its time decides this column", "Open the activity and change its date to move it.");
        onChange(id, "SCHEDULED");
    }

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
            onDropCard={drop}
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
                            {/* the Overdue column says it already; elsewhere it's one that slipped while the page was open */}
                            {column.value !== "OVERDUE" && isOverdue(activity) && (
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
