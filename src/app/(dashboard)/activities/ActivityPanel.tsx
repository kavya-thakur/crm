"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
    IconCalendar,
    IconCalendarDue,
    IconCalendarRepeat,
    IconCircleCheckFilled,
    IconClock,
    IconFileDescription,
    IconLink,
    IconProgress,
    IconTag,
    IconTrash,
    IconUserCircle,
    IconUsers,
    IconX,
} from "@tabler/icons-react";

import { api, errorMessage } from "@/lib/api/client";
import { DoneCheck } from "@/components/DoneCheck";
import { Avatar } from "@/components/Avatar";
import { ConfirmDeleteModal } from "@/components/ListPage";
import { Dropdown, MenuItem } from "@/components/Dropdown";
import { ErrorState } from "@/components/ErrorState";
import { PageLoader } from "@/components/Loader";
import { toast } from "@/components/Toast";
import { formatDate, formatDateTime, timeAgo } from "@/lib/utils/format";
import { usePanelEnter } from "../shared/usePanelEnter";
import type { AgentOption } from "../shared/customFields";
import { linkedRecord } from "../shared/linkedRecord";
import { AttendeePicker, AttendeeStack, StatusBadge, TypeDropdown, toggledStatus } from "../shared/activities";
import {
    ACTIVITY_STATUSES,
    DURATIONS,
    RESCHEDULE_OPTIONS,
    durationLabel,
    fromDateTimeLocal,
    refreshActivities,
    toDateTimeLocal,
    type Activity,
    type ActivityStatus,
    type ActivityType,
} from "./shared";

type ActivityChanges = Partial<{
    type: ActivityType;
    title: string;
    description: string | null;
    scheduledAt: string;
    durationMinutes: number | null;
    assignedToId: number;
    attendeeIds: number[];
    status: ActivityStatus;
}>;

// Twenty's record side panel: fields you can click to edit on the left, the description on the right
export default function ActivityPanel({ activityId, agents, onClose }: { activityId: number; agents?: AgentOption[]; onClose: () => void }) {
    const queryClient = useQueryClient();
    const [confirmingDelete, setConfirmingDelete] = useState(false);
    const enterRef = usePanelEnter<HTMLDivElement>();

    const activityQuery = useQuery({
        queryKey: ["activity", activityId],
        queryFn: () => api.get<{ data: Activity }>(`/activities/${activityId}`).then((res) => res.data.data),
        // a deleted activity stays missing, no point asking again
        retry: false,
    });

    const update = useMutation({
        mutationFn: (changes: ActivityChanges) => api.put<{ data: Activity }>(`/activities/${activityId}`, changes),
        onSuccess: (res, changes) => {
            toast.success(
                changes.status === "COMPLETED"
                    ? "Activity completed"
                    : changes.status === "SCHEDULED"
                        ? "Activity reopened"
                        : changes.status === "CANCELLED"
                            ? "Activity cancelled"
                            : changes.scheduledAt
                                ? `Moved to ${formatDateTime(changes.scheduledAt)}`
                                : "Activity updated"
            );
            // show the saved value right away, then refresh the lists
            queryClient.setQueryData(["activity", activityId], res.data.data);
            refreshActivities(queryClient);
        },
    });

    const remove = useMutation({
        mutationFn: () => api.delete(`/activities/${activityId}`),
        onSuccess: () => {
            toast.success("Activity deleted");
            refreshActivities(queryClient);
            onClose();
        },
    });

    const activity = activityQuery.data;
    const done = activity?.status === "COMPLETED";
    const record = activity ? linkedRecord(activity) : null;
    const mutationError = update.error ?? remove.error;

    return (
        <div ref={enterRef} className="flex h-full min-h-0 flex-col">
            <header className="flex h-12 shrink-0 items-center gap-1.5 border-b border-line bg-paper px-3">
                <IconCircleCheckFilled size={16} className="text-accent" />
                <button type="button" onClick={onClose} className="rounded px-1 text-muted hover:bg-fill hover:text-ink">
                    Activities
                </button>
                <span className="text-faint">/</span>
                <span className="truncate rounded px-1 font-semibold">{activity?.title ?? "..."}</span>

                <div className="ml-auto flex items-center gap-0.5">
                    {activity && (
                        <button
                            type="button"
                            aria-label="Delete activity"
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

            {activityQuery.isPending && <PageLoader label="Loading activity" variant="record" />}
            {activityQuery.isError && (
                <ErrorState title="Couldn't load activity" error={activityQuery.error} onRetry={() => activityQuery.refetch()} retrying={activityQuery.isFetching} />
            )}

            {activity && (
                <div className="flex min-h-0 flex-1 flex-col overflow-y-auto md:flex-row md:overflow-hidden">
                    {/* Fields: left column, Twenty's record-page width */}
                    <div className="flex w-full shrink-0 flex-col border-b border-line-light md:max-w-sm md:overflow-y-auto md:border-r md:border-b-0">
                        {/* Identifier: the circle finishes (or reopens) the activity, then its title */}
                        <div className="flex items-center gap-3 border-b border-line-light px-4 py-4">
                            <DoneCheck
                                done={done}
                                size={26}
                                label={done ? "Mark as not completed" : "Mark as completed"}
                                onClick={() => update.mutate({ status: toggledStatus(activity.status) })}
                                disabled={update.isPending}
                                className="size-10 hover:bg-fill"
                            />
                            <div className="min-w-0 flex-1">
                                <EditableText
                                    value={activity.title}
                                    placeholder="Title"
                                    // an activity needs a title, so clearing it just keeps the old one
                                    onSave={(title) => title && update.mutate({ title })}
                                    className={`text-lg font-semibold ${activity.status !== "SCHEDULED" ? "text-muted" : ""}`}
                                />
                                <p className="px-1 text-faint">Added {timeAgo(activity.createdAt)}</p>
                            </div>
                        </div>

                        {/* Fields */}
                        <section className="space-y-0.5 px-3 py-3">
                            <SectionLabel>Fields</SectionLabel>

                            <FieldRow icon={IconProgress} label="Status">
                                <PickMenu
                                    label={<StatusBadge activity={activity} />}
                                    items={ACTIVITY_STATUSES.map((status) => ({
                                        key: status.value,
                                        content: status.label,
                                        selected: status.value === activity.status,
                                        onPick: () => update.mutate({ status: status.value }),
                                    }))}
                                />
                            </FieldRow>

                            <FieldRow icon={IconTag} label="Type">
                                <TypeDropdown value={activity.type} onChange={(type) => update.mutate({ type })} />
                            </FieldRow>

                            <FieldRow icon={IconCalendarDue} label="When">
                                <input
                                    // a fresh field when the time changes from elsewhere (Reschedule, the start-time popup)
                                    key={activity.scheduledAt}
                                    type="datetime-local"
                                    defaultValue={toDateTimeLocal(activity.scheduledAt)}
                                    // saved when you leave the field; clearing it is ignored (an activity needs a time)
                                    onBlur={(event) => {
                                        const next = fromDateTimeLocal(event.target.value);
                                        if (next && event.target.value !== toDateTimeLocal(activity.scheduledAt)) {
                                            update.mutate({ scheduledAt: next });
                                        }
                                    }}
                                    className="h-7 rounded-lg px-1 outline-none hover:bg-fill focus:bg-fill"
                                />
                            </FieldRow>

                            {activity.status === "SCHEDULED" && (
                                <FieldRow icon={IconCalendarRepeat} label="Reschedule">
                                    <PickMenu
                                        label={<span className="text-muted">Move it…</span>}
                                        items={RESCHEDULE_OPTIONS.map((option) => ({
                                            key: option.label,
                                            content: option.label,
                                            selected: false,
                                            onPick: () => update.mutate({ scheduledAt: option.at(activity.scheduledAt) }),
                                        }))}
                                    />
                                </FieldRow>
                            )}

                            <FieldRow icon={IconClock} label="Duration">
                                <PickMenu
                                    label={
                                        activity.durationMinutes ? durationLabel(activity.durationMinutes) : <span className="text-light">No duration</span>
                                    }
                                    items={[
                                        { key: "none", content: "No duration", selected: !activity.durationMinutes, onPick: () => update.mutate({ durationMinutes: null }) },
                                        ...DURATIONS.map((minutes) => ({
                                            key: String(minutes),
                                            content: durationLabel(minutes),
                                            selected: minutes === activity.durationMinutes,
                                            onPick: () => update.mutate({ durationMinutes: minutes }),
                                        })),
                                    ]}
                                />
                            </FieldRow>

                            <FieldRow icon={IconUserCircle} label="Assigned to">
                                {agents ? (
                                    <PickMenu
                                        label={<AssigneeLabel activity={activity} />}
                                        items={agents.map((agent) => ({
                                            key: agent.id,
                                            content: (
                                                <>
                                                    <Avatar name={agent.name} /> {agent.name}
                                                </>
                                            ),
                                            selected: agent.id === activity.assignedTo.id,
                                            onPick: () => update.mutate({ assignedToId: agent.id }),
                                        }))}
                                    />
                                ) : (
                                    <span className="flex h-7 items-center gap-1.5 px-1">
                                        <AssigneeLabel activity={activity} />
                                    </span>
                                )}
                            </FieldRow>

                            <FieldRow icon={IconUsers} label="Tagged">
                                {agents ? (
                                    <AttendeePicker
                                        agents={agents}
                                        value={activity.attendees.map((person) => person.id)}
                                        onChange={(attendeeIds) => update.mutate({ attendeeIds })}
                                    />
                                ) : activity.attendees.length > 0 ? (
                                    <span className="flex h-7 items-center gap-1.5 px-1">
                                        <AttendeeStack people={activity.attendees} />
                                        <span className="truncate">{activity.attendees.map((person) => person.name).join(", ")}</span>
                                    </span>
                                ) : (
                                    <span className="px-1 text-light">No one tagged</span>
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
                                <span className="px-1">{formatDate(activity.createdAt)}</span>
                            </FieldRow>

                            <FieldRow icon={IconClock} label="Updated">
                                <span className="px-1">{timeAgo(activity.updatedAt)}</span>
                            </FieldRow>

                            {mutationError && <p role="alert" className="px-1 pt-1 text-danger">{errorMessage(mutationError)}</p>}
                        </section>
                    </div>

                    {/* Description: takes the rest of the width, under a tab-style header like the other records */}
                    <div className="flex min-w-0 flex-1 flex-col md:overflow-y-auto">
                        <div className="flex h-11 shrink-0 items-center gap-1 border-b border-line-light px-4">
                            <span className="flex h-8 items-center gap-1.5 border-b-2 border-accent px-2 text-sm font-medium text-ink">
                                <IconFileDescription size={14} />
                                Description
                            </span>
                        </div>

                        <section className="px-4 py-4">
                            <EditableText
                                multiline
                                value={activity.description}
                                placeholder="Add a description..."
                                onSave={(description) => update.mutate({ description })}
                            />
                        </section>
                    </div>
                </div>
            )}

            <ConfirmDeleteModal
                open={confirmingDelete}
                title={`Delete ${activity?.title}?`}
                pending={remove.isPending}
                onCancel={() => setConfirmingDelete(false)}
                onConfirm={() => remove.mutate()}
            />
        </div>
    );
}

// Groups rows within the Fields section — Twenty splits a record's panel
// into Fields / Relations / System the same way.
function SectionLabel({ children }: { children: ReactNode }) {
    return <p className="mt-2 mb-0.5 px-1 text-xs font-semibold tracking-wide text-faint uppercase first:mt-0">{children}</p>;
}

function FieldRow({ icon: Icon, label, children }: { icon: typeof IconClock; label: string; children: ReactNode }) {
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

function AssigneeLabel({ activity }: { activity: Activity }) {
    return (
        <>
            <Avatar name={activity.assignedTo.name} />
            <span className="truncate">{activity.assignedTo.name}</span>
        </>
    );
}

// A field that's changed by picking from the app's own menu (never a native <select>)
function PickMenu({
    label,
    items,
}: {
    label: ReactNode;
    items: { key: string | number; content: ReactNode; selected: boolean; onPick: () => void }[];
}) {
    return (
        <Dropdown buttonClassName="flex h-7 max-w-full items-center gap-1.5 rounded-lg px-1 hover:bg-fill" label={label}>
            {(close) =>
                items.map((item) => (
                    <MenuItem key={item.key} selected={item.selected} onClick={() => { if (!item.selected) item.onPick(); close(); }}>
                        {item.content}
                    </MenuItem>
                ))
            }
        </Dropdown>
    );
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
