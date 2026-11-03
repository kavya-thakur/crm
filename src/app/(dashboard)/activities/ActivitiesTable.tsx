"use client";

import {
    IconCalendarDue,
    IconCalendarEvent,
    IconClock,
    IconLink,
    IconPlus,
    IconProgress,
    IconTag,
    IconUserCircle,
    IconUsers,
} from "@tabler/icons-react";
import Link from "next/link";

import { DoneCheck } from "@/components/DoneCheck";
import { Avatar } from "@/components/Avatar";
import { DataCell, type DataColumn, type EditConfig } from "@/components/DataTable";
import { ErrorState } from "@/components/ErrorState";
import { SkeletonRows } from "@/components/Loader";
import type { SelectOption } from "@/components/Select";
import { formatDateTime } from "@/lib/utils/format";
import type { AgentOption } from "../shared/customFields";
import { linkedRecord } from "../shared/linkedRecord";
import { ActivityTypeLabel, AttendeeStack, DURATION_OPTIONS, StatusBadge, TYPE_OPTIONS, toggledStatus } from "../shared/activities";
import { durationLabel, fromDateTimeLocal, isOverdue, toDateTimeLocal, type Activity, type ActivityScope } from "./shared";

const EMPTY_STATE: Record<ActivityScope, { title: string; hint: string }> = {
    upcoming: { title: "Nothing scheduled", hint: "Book a call or meeting and it shows up here." },
    overdue: { title: "Nothing is overdue", hint: "Activities past their time that aren't done show up here." },
    completed: { title: "No completed activities yet", hint: "Tick an activity off and it moves here." },
    cancelled: { title: "Nothing cancelled", hint: "Cancelled activities show up here." },
    all: { title: "Schedule your first activity", hint: "Calls and meetings you book or are tagged on show up here." },
};

// Title is pinned (it's how an activity is opened); the rest are plain columns, with
// Type, When (reschedule), Duration and Assigned to editable in place via the hover pencil,
// here and on board cards. Attendees and status are changed in the activity's own panel.
export function activityColumns(context: {
    agents?: AgentOption[];
    onUpdate: (activity: Activity, changes: Record<string, unknown>) => void;
}): DataColumn<Activity>[] {
    const agentOptions: SelectOption[] = (context.agents ?? []).map((agent) => ({ value: String(agent.id), label: agent.name }));

    const typeEdit: EditConfig<Activity> = {
        type: "select",
        getValue: (activity) => activity.type,
        options: TYPE_OPTIONS,
        onSave: (activity, value) => value && context.onUpdate(activity, { type: value }),
    };

    // a time in the viewer's own timezone; a half-typed one isn't saved
    const whenEdit: EditConfig<Activity> = {
        type: "datetime-local",
        getValue: (activity) => toDateTimeLocal(activity.scheduledAt),
        onSave: (activity, value) => {
            const scheduledAt = fromDateTimeLocal(String(value ?? ""));
            if (scheduledAt) context.onUpdate(activity, { scheduledAt });
        },
    };

    const durationEdit: EditConfig<Activity> = {
        type: "select",
        getValue: (activity) => (activity.durationMinutes ? String(activity.durationMinutes) : ""),
        options: DURATION_OPTIONS,
        // "" = no length, which the API stores as null
        onSave: (activity, value) => context.onUpdate(activity, { durationMinutes: value ? Number(value) : null }),
    };

    const assignedToEdit: EditConfig<Activity> = {
        type: "select",
        getValue: (activity) => String(activity.assignedTo.id),
        options: agentOptions,
        // every activity needs someone it's for, so there's no "unassigned" to pick
        onSave: (activity, value) => value && context.onUpdate(activity, { assignedToId: Number(value) }),
    };

    return [
        { key: "type", label: "Type", icon: IconTag, width: 130, edit: typeEdit, cell: (activity) => <ActivityTypeLabel type={activity.type} /> },
        {
            key: "scheduledAt", label: "When", icon: IconCalendarDue, width: 190, edit: whenEdit,
            cell: (activity) => (
                <span className={isOverdue(activity) ? "font-medium text-danger" : ""}>{formatDateTime(activity.scheduledAt)}</span>
            ),
        },
        {
            key: "duration", label: "Duration", icon: IconClock, width: 130, edit: durationEdit,
            cell: (activity) => activity.durationMinutes && durationLabel(activity.durationMinutes),
        },
        {
            key: "assignedTo", label: "Assigned to", icon: IconUserCircle, width: 180,
            ...(context.agents && { edit: assignedToEdit }),
            cell: (activity) => (
                <span className="flex items-center gap-1.5">
                    <Avatar name={activity.assignedTo.name} />
                    <span className="truncate">{activity.assignedTo.name}</span>
                </span>
            ),
        },
        { key: "attendees", label: "Tagged", icon: IconUsers, width: 130, cell: (activity) => <AttendeeStack people={activity.attendees} /> },
        {
            key: "about", label: "About", icon: IconLink, width: 200,
            cell: (activity) => {
                const record = linkedRecord(activity);

                return record && (
                    <Link href={record.href} className="flex items-center gap-1.5 hover:underline">
                        <record.icon size={14} className="shrink-0 text-faint" />
                        <span className="truncate">{record.label}</span>
                    </Link>
                );
            },
        },
        { key: "status", label: "Status", icon: IconProgress, width: 130, cell: (activity) => <StatusBadge activity={activity} /> },
    ];
}

interface ActivitiesTableProps {
    activities: Activity[];
    scope: ActivityScope;
    agents?: AgentOption[];
    loading: boolean;
    failed: boolean;
    error: unknown;
    onRetry: () => void;
    onToggle: (activity: Activity) => void;
    onUpdate: (activity: Activity, changes: Record<string, unknown>) => void;
    onOpen: (id: number) => void;
    onCreate: () => void;
}

export default function ActivitiesTable({
    activities, scope, agents, loading, failed, error, onRetry, onToggle, onUpdate, onOpen, onCreate,
}: ActivitiesTableProps) {

    const columns = activityColumns({ agents, onUpdate });
    const colSpan = columns.length + 3;

    if (failed) {
        return <ErrorState title="Couldn't load activities" error={error} onRetry={onRetry} />;
    }

    return (
        <>
            <table className="w-max min-w-full table-fixed border-separate border-spacing-0">
                <thead>
                    <tr className="[&>th]:sticky [&>th]:top-0 [&>th]:z-10 [&>th]:h-8 [&>th]:border-r [&>th]:border-b [&>th]:border-line-light [&>th]:bg-surface [&>th]:px-2 [&>th]:text-left [&>th]:font-medium [&>th]:text-faint">
                        <th className="left-0 z-20! w-8 px-0!" />
                        <th className="left-8 z-20! w-72">
                            <span className="flex items-center gap-1">
                                <IconCalendarEvent size={16} />
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
                    {activities.map((activity) => {
                        const done = activity.status === "COMPLETED";
                        const closed = done || activity.status === "CANCELLED";

                        return (
                            <tr
                                key={activity.id}
                                className="[&>td]:h-8 [&>td]:border-r [&>td]:border-b [&>td]:border-line-light [&>td]:bg-surface [&>td]:px-2 [&>td]:whitespace-nowrap"
                            >
                                <td className="sticky left-0 z-1 px-0! text-center">
                                    <DoneCheck
                                        done={done}
                                        label={
                                            toggledStatus(activity.status) === "COMPLETED"
                                                ? `Mark "${activity.title}" as completed`
                                                : `Mark "${activity.title}" as not completed`
                                        }
                                        onClick={() => onToggle(activity)}
                                        className="mx-auto size-6"
                                    />
                                </td>
                                <td className="sticky left-8 z-1 px-1!">
                                    <button
                                        type="button"
                                        onClick={() => onOpen(activity.id)}
                                        className={`flex max-w-full items-center rounded px-1 py-0.5 hover:bg-fill ${closed ? "text-muted" : ""}`}
                                    >
                                        <span className="truncate">{activity.title}</span>
                                    </button>
                                </td>
                                {columns.map((column) => (
                                    <DataCell key={column.key} record={activity} column={column} />
                                ))}
                                <td className="border-r-0!" />
                            </tr>
                        );
                    })}

                    {loading && <SkeletonRows colSpan={colSpan} />}

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

            {!loading && activities.length === 0 && (
                <div className="flex flex-col items-center gap-3 py-20 text-center">
                    <span className="flex size-10 items-center justify-center rounded-lg border border-line bg-paper text-faint">
                        <IconCalendarEvent size={20} />
                    </span>
                    <div>
                        <p className="font-medium">{EMPTY_STATE[scope].title}</p>
                        <p className="mt-1 text-faint">{EMPTY_STATE[scope].hint}</p>
                    </div>
                </div>
            )}

        </>
    );
}
