"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { IconChecklist, IconChevronDown } from "@tabler/icons-react";

import { api, errorMessage } from "@/lib/api/client";
import { Avatar } from "@/components/Avatar";
import { DoneCheck } from "@/components/DoneCheck";
import { ErrorState } from "@/components/ErrorState";
import { Pill } from "@/components/Pill";
import type { Tone } from "@/components/SectionIcon";
import { toast } from "@/components/Toast";
import { formatDateTime, formatDay } from "@/lib/utils/format";
import { ACTIVITY_TYPES, durationLabel, isOverdue as activityOverdue, refreshActivities, type Activity, type Paginated } from "../activities/shared";
import { isOverdue as taskOverdue, refreshTasks, type Task } from "../tasks/shared";
import { PriorityBadge } from "./tasks";

const LINK_KEYS = { lead: "leadId", deal: "dealId", contact: "contactId" } as const;
// shown before "Show more"; expanded, a long list scrolls inside the card instead of
// pushing the timeline down
const SHOWN = 5;
// fetched per kind (one request each); a record with more than this is pointed to its tabs
const LIMIT = 100;
const DAY = 86_400_000;

// each kind with its own colour, so a task and a meeting tell apart at a glance
const KINDS: Record<string, { label: string; tone: Tone | "neutral"; icon: typeof IconChecklist }> = {
    TASK: { label: "Task", tone: "teal", icon: IconChecklist },
    ...Object.fromEntries(ACTIVITY_TYPES.map(({ value, label, icon }) => [value, { label, icon, tone: value === "CALL" ? "blue" : value === "MEETING" ? "violet" : "neutral" }])),
};

type Item =
    | { kind: "task"; at: number; overdue: boolean; task: Task }
    | { kind: "activity"; at: number; overdue: boolean; activity: Activity };

// Whole days from today to that day on this browser's calendar: 0 today, 1 tomorrow, -2 two days ago
function daysFromToday(date: Date) {
    const startOf = (day: Date) => new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime();
    return Math.round((startOf(date) - startOf(new Date())) / DAY);
}

// "Today, 11:00 PM", "Tomorrow, 9:30 AM", "Yesterday, 4:00 PM", else the full date and time
function activityWhen(scheduledAt: string) {
    const date = new Date(scheduledAt);
    const day = ["Yesterday", "Today", "Tomorrow"][daysFromToday(date) + 1];
    return day ? `${day}, ${date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : formatDateTime(scheduledAt);
}

// "Due today", "Due tomorrow", "Overdue by 2 days", else "Due Nov 20, 2026". A task is due on a
// day (stored as UTC midnight), so that day is read as it's written, not shifted by the time zone.
function taskWhen(dueDate: string) {
    const [year, month, day] = dueDate.slice(0, 10).split("-").map(Number);
    const days = daysFromToday(new Date(year, month - 1, day));
    if (days === 0) return "Due today";
    if (days === 1) return "Due tomorrow";
    if (days < 0) return `Overdue by ${-days} day${days === -1 ? "" : "s"}`;
    return `Due ${formatDay(dueDate)}`;
}

/*
 * "Next steps", pinned at the top of a lead, deal or contact's timeline: the scheduled calls and
 * meetings and open tasks for it, soonest first, overdue ones first and in red. Each says what it
 * is, when, how long or how urgent, and whose it is, and can be ticked off right here. Nothing
 * pending: nothing shown. It shares its lists with the Tasks and Activities tabs (same cache).
 */
export function ComingUp({ entity, recordId }: { entity: "lead" | "deal" | "contact"; recordId: number }) {
    const queryClient = useQueryClient();
    const [expanded, setExpanded] = useState(false);
    const link = { [LINK_KEYS[entity]]: recordId };

    const activitiesQuery = useQuery({
        queryKey: ["activities", "record", entity, recordId, "scheduled"],
        queryFn: () =>
            api.get<Paginated<Activity>>("/activities", { params: { scope: "all", status: "SCHEDULED", ...link, limit: LIMIT } }).then((res) => res.data.data),
    });
    // the same request and cache as the Tasks tab's "open" list, so it's fetched once for both
    // and they never disagree (which is why its limit is the tab's 100 too)
    const tasksQuery = useQuery({
        queryKey: ["tasks", "record", entity, recordId, "open"],
        queryFn: () => api.get<Paginated<Task>>("/tasks", { params: { scope: "open", ...link, limit: LIMIT } }).then((res) => res.data.data),
    });

    const finish = useMutation({
        mutationFn: (item: Item) =>
            item.kind === "task" ? api.put(`/tasks/${item.task.id}`, { status: "COMPLETED" }) : api.put(`/activities/${item.activity.id}`, { status: "COMPLETED" }),
        onSuccess: (_, item) => {
            toast.success(item.kind === "task" ? "Task done" : `${KINDS[item.activity.type].label} done`);
            if (item.kind === "task") refreshTasks(queryClient);
            else refreshActivities(queryClient);
            // the timeline below gets its "completed" line
            queryClient.invalidateQueries({ queryKey: [entity, recordId, "timeline"] });
        },
        onError: (error) => toast.error(errorMessage(error)),
    });

    if (activitiesQuery.isError || tasksQuery.isError) {
        return (
            <div className="mb-4">
                <ErrorState
                    variant="inline"
                    title="Couldn't load the next steps"
                    error={activitiesQuery.error ?? tasksQuery.error}
                    onRetry={() => Promise.all([activitiesQuery.refetch(), tasksQuery.refetch()])}
                    retrying={activitiesQuery.isFetching || tasksQuery.isFetching}
                />
            </div>
        );
    }

    const items: Item[] = [
        ...(activitiesQuery.data ?? []).map((activity) => ({
            kind: "activity" as const,
            at: new Date(activity.scheduledAt).getTime(),
            overdue: activityOverdue(activity),
            activity,
        })),
        ...(tasksQuery.data ?? []).map((task) => ({ kind: "task" as const, at: new Date(task.dueDate).getTime(), overdue: taskOverdue(task), task })),
    ].sort((a, b) => a.at - b.at);

    if (items.length === 0) return null;
    const overdue = items.filter((item) => item.overdue).length;
    // a full page of either: there may be more than were fetched
    const capped = activitiesQuery.data?.length === LIMIT || tasksQuery.data?.length === LIMIT;
    const shown = expanded ? items : items.slice(0, SHOWN);

    return (
        <section aria-labelledby={`next-steps-${entity}-${recordId}`} className="mb-6 overflow-hidden rounded-xl border border-line bg-surface shadow-light">
            <header className="flex items-center gap-2 border-b border-line-light bg-paper px-3 py-2">
                <h3 id={`next-steps-${entity}-${recordId}`} className="font-medium text-ink">
                    Next steps
                </h3>
                <span className="text-sm text-faint tabular-nums">
                    {items.length}
                    {capped && "+"}
                </span>
                {overdue > 0 && <Pill tone="red">{overdue} overdue</Pill>}
                <span className="ml-auto text-sm text-faint">Calls, meetings and tasks still to do</span>
            </header>

            {/* opened up, a long list scrolls in here (about eight rows tall) */}
            <ul className={expanded ? "max-h-120 overflow-y-auto overscroll-contain" : undefined}>
                {shown.map((item) => (
                    <NextStep
                        key={item.kind === "task" ? `task-${item.task.id}` : `activity-${item.activity.id}`}
                        item={item}
                        finishing={finish.isPending && finish.variables === item}
                        onFinish={() => finish.mutate(item)}
                    />
                ))}
            </ul>

            {(items.length > SHOWN || capped) && (
                <div className="flex items-center gap-3 border-t border-line-light px-3 py-1.5 text-sm">
                    {items.length > SHOWN && (
                        <button
                            type="button"
                            onClick={() => setExpanded(!expanded)}
                            aria-expanded={expanded}
                            className="flex h-7 items-center gap-1 rounded-lg px-1.5 font-medium text-muted hover:bg-fill hover:text-ink"
                        >
                            <IconChevronDown size={14} className={`transition-transform ${expanded ? "rotate-180" : ""}`} />
                            {expanded ? "Show less" : `Show ${items.length - SHOWN} more`}
                        </button>
                    )}
                    {capped && <span className="ml-auto text-faint">The rest are in the Tasks and Activities tabs</span>}
                </div>
            )}
        </section>
    );
}

// One step: tick it off, what kind it is, its title (opens it), and when, how long or how urgent, and whose
function NextStep({ item, finishing, onFinish }: { item: Item; finishing: boolean; onFinish: () => void }) {
    const isTask = item.kind === "task";
    const kind = KINDS[isTask ? "TASK" : item.activity.type];
    const title = isTask ? item.task.title : item.activity.title;
    const href = isTask ? `/tasks?open=${item.task.id}` : `/activities?open=${item.activity.id}`;
    const owner = isTask ? item.task.assignedTo : item.activity.assignedTo;
    const when = isTask ? taskWhen(item.task.dueDate) : activityWhen(item.activity.scheduledAt);
    const duration = !isTask && item.activity.durationMinutes ? durationLabel(item.activity.durationMinutes) : null;

    return (
        <li className={`flex items-start gap-3 border-b border-line-light px-3 py-2.5 last:border-b-0 ${item.overdue ? "bg-danger-soft/40" : ""}`}>
            <DoneCheck done={false} label={`Mark "${title}" as done`} onClick={onFinish} disabled={finishing} className="mt-0.5" />

            <div className="min-w-0 flex-1">
                <Link href={href} className="block truncate font-medium text-ink hover:underline">
                    {title}
                </Link>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-faint">
                    <Pill tone={kind.tone}>
                        <kind.icon size={12} className="mr-1" />
                        {kind.label}
                    </Pill>
                    <span className={item.overdue ? "font-medium text-danger" : "text-muted"}>
                        {item.overdue && !isTask ? `Overdue · ${when}` : when}
                    </span>
                    {duration && <span>· {duration}</span>}
                    {isTask && <PriorityBadge priority={item.task.priority} />}
                    <span className="flex items-center gap-1">
                        · <Avatar name={owner.name} /> {owner.name}
                    </span>
                </div>
            </div>
        </li>
    );
}
