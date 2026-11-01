"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { IconCircle, IconCircleCheckFilled, IconPlus, IconX } from "@tabler/icons-react";

import { api, errorMessage } from "@/lib/api/client";
import { Avatar } from "@/components/Avatar";
import { Dropdown, MenuItem } from "@/components/Dropdown";
import { ErrorState } from "@/components/ErrorState";
import { SkeletonList, Spinner } from "@/components/Loader";
import type { SelectOption } from "@/components/Select";
import { toast } from "@/components/Toast";
import { formatDateTime } from "@/lib/format";
import {
    ACTIVITY_TYPES,
    DURATIONS,
    durationLabel,
    fromDateTimeLocal,
    isOverdue,
    nextFullHour,
    refreshActivities,
    toDateTimeLocal,
    type Activity,
    type ActivityLink,
    type ActivityStatus,
    type ActivityType,
    type Paginated,
} from "../activities/shared";
import type { AgentOption } from "./customFields";

type ActivityEntity = "lead" | "deal" | "contact";

const LINK_KEYS = { lead: "leadId", deal: "dealId", contact: "contactId" } as const;

// A type's icon and name, e.g. "Meeting"
export function ActivityTypeLabel({ type }: { type: ActivityType }) {
    const { label, icon: Icon } = ACTIVITY_TYPES.find((item) => item.value === type)!;

    return (
        <span className="flex items-center gap-1.5">
            <Icon size={14} className="shrink-0 text-faint" />
            {label}
        </span>
    );
}

// The types as options for the app's Select, each with its icon
export const TYPE_OPTIONS: SelectOption[] = ACTIVITY_TYPES.map(({ value, label }) => ({
    value,
    label,
    render: <ActivityTypeLabel type={value} />,
}));

// "" = no length set
export const DURATION_OPTIONS: SelectOption[] = [
    { value: "", label: "No duration" },
    ...DURATIONS.map((minutes) => ({ value: String(minutes), label: durationLabel(minutes) })),
];

// A scheduled activity past its time reads "Overdue" (red); otherwise Scheduled (blue),
// Completed (green) or Cancelled (grey)
export function StatusBadge({ activity }: { activity: Activity }) {
    const [label, colour] =
        activity.status === "COMPLETED"
            ? ["Completed", "bg-[#e6f6eb] text-[#00824d]"]
            : activity.status === "CANCELLED"
                ? ["Cancelled", "bg-app text-muted"]
                : isOverdue(activity)
                    ? ["Overdue", "bg-danger-soft text-danger"]
                    : ["Scheduled", "bg-accent-soft text-accent"];

    return <span className={`inline-flex h-5 items-center rounded-full px-2 text-sm font-medium ${colour}`}>{label}</span>;
}

// Overlapping avatars of the tagged agents, with "+2" for any beyond the first three
export function AttendeeStack({ people }: { people: { id: number; name: string }[] }) {
    if (people.length === 0) return null;

    return (
        <span className="flex items-center" title={people.map((person) => person.name).join(", ")}>
            <span className="flex -space-x-1">
                {people.slice(0, 3).map((person) => (
                    <span key={person.id} className="rounded-full ring-2 ring-surface">
                        <Avatar name={person.name} />
                    </span>
                ))}
            </span>
            {people.length > 3 && <span className="ml-1 text-sm text-faint">+{people.length - 3}</span>}
        </span>
    );
}

// Tags agents on an activity: the ones picked show as chips, and the menu lists the
// team with a tick next to each tagged one. The menu stays open so several can be picked.
export function AttendeePicker({
    agents,
    value,
    onChange,
}: {
    agents: AgentOption[];
    value: number[];
    onChange: (agentIds: number[]) => void;
}) {
    const tagged = agents.filter((agent) => value.includes(agent.id));

    function toggle(agentId: number) {
        onChange(value.includes(agentId) ? value.filter((id) => id !== agentId) : [...value, agentId]);
    }

    return (
        <div className="flex flex-wrap items-center gap-1">
            {tagged.map((agent) => (
                <span key={agent.id} className="flex h-6 items-center gap-1 rounded-full bg-fill pr-1 pl-1">
                    <Avatar name={agent.name} />
                    <span className="max-w-28 truncate text-sm">{agent.name}</span>
                    <button
                        type="button"
                        aria-label={`Remove ${agent.name}`}
                        onClick={() => toggle(agent.id)}
                        className="flex size-4 items-center justify-center rounded-full text-faint hover:bg-fill-strong hover:text-ink"
                    >
                        <IconX size={10} />
                    </button>
                </span>
            ))}

            <Dropdown
                buttonClassName="flex h-6 items-center gap-1 rounded-full border border-dashed border-line-strong px-2 text-sm text-faint hover:bg-fill"
                label={
                    <>
                        <IconPlus size={12} />
                        Tag agent
                    </>
                }
            >
                {() =>
                    agents.map((agent) => (
                        <MenuItem key={agent.id} selected={value.includes(agent.id)} onClick={() => toggle(agent.id)}>
                            <Avatar name={agent.name} /> {agent.name}
                        </MenuItem>
                    ))
                }
            </Dropdown>
        </div>
    );
}

// A menu (the app's own, not a native <select>) for picking a type, for places where a
// bordered form field would be too heavy, like a record panel or a one-line quick-add
export function TypeDropdown({
    value,
    onChange,
    align,
}: {
    value: ActivityType;
    onChange: (value: ActivityType) => void;
    align?: "left" | "right";
}) {
    return (
        <Dropdown
            align={align}
            buttonClassName="flex h-7 items-center rounded-lg px-1.5 hover:bg-fill"
            label={<ActivityTypeLabel type={value} />}
        >
            {(close) =>
                ACTIVITY_TYPES.map((option) => (
                    <MenuItem
                        key={option.value}
                        selected={option.value === value}
                        onClick={() => { if (option.value !== value) onChange(option.value); close(); }}
                    >
                        <ActivityTypeLabel type={option.value} />
                    </MenuItem>
                ))
            }
        </Dropdown>
    );
}

// The next status when the circle is clicked: finish it, or reopen it if it's already done
export function toggledStatus(status: ActivityStatus): ActivityStatus {
    return status === "COMPLETED" ? "SCHEDULED" : "COMPLETED";
}

const TAB_SCOPES = [
    { value: "upcoming", label: "Upcoming" },
    { value: "overdue", label: "Overdue" },
    { value: "completed", label: "Completed" },
] as const;

// The Activities tab of a lead, deal or contact: what's booked about that record
export function ActivitiesTab({ entity, recordId }: { entity: ActivityEntity; recordId: number }) {
    const [scope, setScope] = useState<(typeof TAB_SCOPES)[number]["value"]>("upcoming");
    const link = { [LINK_KEYS[entity]]: recordId } as ActivityLink;

    const activitiesQuery = useQuery({
        queryKey: ["activities", "record", entity, recordId, scope],
        queryFn: () =>
            api.get<Paginated<Activity>>("/activities", { params: { scope, ...link, limit: 100 } }).then((res) => res.data.data),
    });

    return (
        <div className="mx-auto flex max-w-2xl flex-col gap-3">
            <QuickAdd link={link} />

            <div className="flex gap-1 font-medium text-muted">
                {TAB_SCOPES.map((item) => (
                    <button
                        key={item.value}
                        type="button"
                        onClick={() => setScope(item.value)}
                        className={`flex h-7 items-center rounded-lg px-2.5 ${item.value === scope ? "bg-fill text-ink" : "hover:bg-app"}`}
                    >
                        {item.label}
                    </button>
                ))}
            </div>

            {activitiesQuery.isPending && <SkeletonList rows={3} />}
            {activitiesQuery.isError && (
                <ErrorState
                    variant="inline"
                    title="Couldn't load activities"
                    error={activitiesQuery.error}
                    onRetry={() => activitiesQuery.refetch()}
                    retrying={activitiesQuery.isFetching}
                />
            )}
            {activitiesQuery.isSuccess && activitiesQuery.data.length === 0 && (
                <p className="text-light">
                    {scope === "upcoming" ? "Nothing scheduled — book a call or meeting above." : scope === "overdue" ? "Nothing is overdue." : "Nothing completed yet."}
                </p>
            )}

            {activitiesQuery.data && activitiesQuery.data.length > 0 && (
                <ul className="overflow-hidden rounded-lg border border-line">
                    {activitiesQuery.data.map((activity) => (
                        <ActivityRow key={activity.id} activity={activity} />
                    ))}
                </ul>
            )}
        </div>
    );
}

// One activity in the list: tick it off with the circle, click the title to open it
function ActivityRow({ activity }: { activity: Activity }) {
    const queryClient = useQueryClient();
    const done = activity.status === "COMPLETED";
    const closed = done || activity.status === "CANCELLED";

    const toggle = useMutation({
        mutationFn: () => api.put(`/activities/${activity.id}`, { status: toggledStatus(activity.status) }),
        onSuccess: () => {
            toast.success(done ? "Activity reopened" : "Activity completed");
            refreshActivities(queryClient);
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
                href={`/activities?open=${activity.id}`}
                className={`flex min-w-0 flex-1 items-center gap-1.5 hover:underline ${closed ? "text-faint line-through" : "text-ink"}`}
            >
                <span className="truncate">{activity.title}</span>
            </Link>

            <ActivityTypeLabel type={activity.type} />
            <AttendeeStack people={activity.attendees} />

            <span className={`shrink-0 text-sm ${isOverdue(activity) ? "font-medium text-danger" : "text-faint"}`}>
                {formatDateTime(activity.scheduledAt)}
            </span>
            <Avatar name={activity.assignedTo.name} />
        </li>
    );
}

// One line to book something for this record: what kind it is, a title and when.
// It's assigned to you; open it to tag others or set a length.
function QuickAdd({ link }: { link: ActivityLink }) {
    const queryClient = useQueryClient();
    const [type, setType] = useState<ActivityType>("MEETING");
    const [title, setTitle] = useState("");
    const [scheduledAt, setScheduledAt] = useState(nextFullHour);

    const create = useMutation({
        mutationFn: () => api.post("/activities", { type, title, scheduledAt, ...link }),
        onSuccess: () => {
            toast.success("Activity scheduled");
            setTitle("");
            refreshActivities(queryClient);
        },
    });

    const canSubmit = title.trim() !== "" && scheduledAt !== "" && !create.isPending;

    return (
        <form
            onSubmit={(event) => {
                event.preventDefault();
                if (canSubmit) create.mutate();
            }}
        >
            <div className="flex h-9 items-center gap-1.5 rounded-lg border border-line bg-surface pr-1 pl-1 focus-within:border-accent focus-within:ring-3 focus-within:ring-accent-soft">
                <TypeDropdown value={type} onChange={setType} />
                <input
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder="Schedule something..."
                    aria-label="Activity title"
                    className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-light"
                />
                <input
                    type="datetime-local"
                    value={toDateTimeLocal(scheduledAt)}
                    onChange={(event) => setScheduledAt(fromDateTimeLocal(event.target.value))}
                    aria-label="When"
                    className="h-7 rounded-lg bg-transparent px-1 text-sm text-muted outline-none hover:bg-fill"
                />
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
