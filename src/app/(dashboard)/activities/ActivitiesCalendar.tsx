"use client";

import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { IconCheck, IconChevronLeft, IconChevronRight, IconPlus } from "@tabler/icons-react";

import { api } from "@/lib/api/client";
import { ErrorState } from "@/components/ErrorState";
import { oneOf, useUrlState } from "../shared/useUrlState";
import { ACTIVITY_TYPES, isOverdue, nextFullHour, type Activity, type Paginated } from "./shared";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
// a type's colour on the calendar
const TYPE_COLORS = { CALL: "#0588f0", MEETING: "#6e56cf", OTHER: "#8d8d8d" } as const;
// calls and meetings listed in a month's day; the rest are "+2 more"
const SHOWN_PER_DAY = 3;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// Days in the viewer's own time: "2026-11-07"
const dayKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const parseDay = (key: string) => {
    const [year, month, day] = key.split("-").map(Number);
    return new Date(year, month - 1, day);
};
const addDays = (date: Date, days: number) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
// weeks start on Monday
const weekStart = (date: Date) => addDays(date, -((date.getDay() + 6) % 7));
const time = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

/**
 * Calls and meetings on a calendar: a month at a glance, or a week with each day's list. Cancelled
 * ones are left off. The month or week, and which day it's on, live in the URL like the other views.
 */
export default function ActivitiesCalendar({
    mineOnly,
    onOpen,
    onCreate,
}: {
    mineOnly: boolean;
    onOpen: (id: number) => void;
    // book one on a day, as an ISO datetime
    onCreate: (startAt: string) => void;
}) {
    const page = useUrlState();
    const [today] = useState(() => dayKey(new Date()));
    const mode = oneOf(page.get("cal"), ["month", "week"] as const, "month");
    const anchor = parseDay(/^\d{4}-\d{2}-\d{2}$/.test(page.get("date") ?? "") ? page.get("date")! : today);
    const go = (changes: { cal?: "month" | "week"; date?: Date }) =>
        page.set({
            ...(changes.cal && { cal: changes.cal === "month" ? null : changes.cal }),
            ...(changes.date && { date: dayKey(changes.date) === today ? null : dayKey(changes.date) }),
        });

    // the days on screen: whole weeks covering the month, or the one week
    const monthStart = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const monthEnd = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
    const first = weekStart(mode === "month" ? monthStart : anchor);
    // 4 to 6 rows; rounded, as a clock change makes one day 23 or 25 hours
    const weeks = mode === "month" ? Math.round((weekStart(monthEnd).getTime() - first.getTime()) / WEEK_MS) + 1 : 1;
    const days = Array.from({ length: weeks * 7 }, (_, index) => addDays(first, index));
    const end = addDays(first, days.length);

    const query = useQuery({
        queryKey: ["activities", "calendar", dayKey(first), days.length, mineOnly],
        queryFn: () =>
            api
                .get<Paginated<Activity>>("/activities", {
                    params: { scope: "all", from: first.toISOString(), to: end.toISOString(), assignedTo: mineOnly ? "me" : undefined },
                })
                .then((res) => res.data.data),
        placeholderData: keepPreviousData,
    });

    // each day's calls and meetings, earliest first
    const byDay = new Map<string, Activity[]>();
    for (const activity of [...(query.data ?? [])].sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))) {
        if (activity.status === "CANCELLED") continue;
        const key = dayKey(new Date(activity.scheduledAt));
        byDay.set(key, [...(byDay.get(key) ?? []), activity]);
    }

    // a new one on a day: at 10 in the morning, or the next full hour for today
    const createOn = (day: Date) => {
        if (dayKey(day) === today) return onCreate(nextFullHour());
        const at = new Date(day);
        at.setHours(10, 0, 0, 0);
        onCreate(at.toISOString());
    };
    const step = (direction: 1 | -1) =>
        go({ date: mode === "month" ? new Date(anchor.getFullYear(), anchor.getMonth() + direction, 1) : addDays(anchor, 7 * direction) });

    const title =
        mode === "month"
            ? anchor.toLocaleDateString("en-US", { month: "long", year: "numeric" })
            : `${days[0].toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${days[6].toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;

    return (
        <div className="flex min-h-full flex-col">
            <div className="flex h-11 shrink-0 items-center gap-1 border-b border-line-light px-2">
                <button type="button" onClick={() => go({ date: parseDay(today) })} className="h-7 rounded-lg border border-line px-2.5 font-medium text-muted hover:bg-fill hover:text-ink">
                    Today
                </button>
                <button type="button" aria-label="Previous" onClick={() => step(-1)} className="flex size-7 items-center justify-center rounded-lg text-muted hover:bg-fill hover:text-ink">
                    <IconChevronLeft size={16} />
                </button>
                <button type="button" aria-label="Next" onClick={() => step(1)} className="flex size-7 items-center justify-center rounded-lg text-muted hover:bg-fill hover:text-ink">
                    <IconChevronRight size={16} />
                </button>
                <h2 className="truncate px-1 font-semibold">{title}</h2>

                <div className="ml-auto flex shrink-0 rounded-lg bg-app p-0.5">
                    {(["month", "week"] as const).map((option) => (
                        <button
                            key={option}
                            type="button"
                            onClick={() => go({ cal: option })}
                            className={`h-6 rounded-md px-2.5 font-medium capitalize ${mode === option ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink"}`}
                        >
                            {option}
                        </button>
                    ))}
                </div>
            </div>

            {query.isError && <ErrorState variant="inline" title="Couldn't load the calendar" error={query.error} onRetry={() => query.refetch()} retrying={query.isFetching} />}

            {mode === "month" ? (
                <div className={`grid flex-1 grid-cols-7 ${query.isPlaceholderData ? "opacity-60" : ""}`} style={{ gridTemplateRows: `auto repeat(${weeks}, minmax(5.5rem, 1fr))` }}>
                    {WEEKDAYS.map((weekday) => (
                        <p key={weekday} className="border-b border-line-light px-2 py-1.5 text-sm font-medium text-faint">
                            {weekday}
                        </p>
                    ))}
                    {days.map((day) => {
                        const key = dayKey(day);
                        const items = byDay.get(key) ?? [];
                        const outside = day.getMonth() !== anchor.getMonth();
                        return (
                            <div key={key} className={`group flex min-w-0 flex-col gap-0.5 border-b border-line-light p-1 [&:not(:nth-child(7n))]:border-r ${outside ? "bg-paper" : ""}`}>
                                <div className="flex items-center">
                                    {/* the day itself opens its week */}
                                    <button
                                        type="button"
                                        onClick={() => go({ cal: "week", date: day })}
                                        aria-label={`Open the week of ${day.toDateString()}`}
                                        className={`flex size-6 items-center justify-center rounded-full text-sm tabular-nums ${
                                            key === today ? "bg-accent font-semibold text-on-accent" : outside ? "text-light hover:bg-fill" : "text-muted hover:bg-fill"
                                        }`}
                                    >
                                        {day.getDate()}
                                    </button>
                                    <button
                                        type="button"
                                        aria-label={`New activity on ${day.toDateString()}`}
                                        onClick={() => createOn(day)}
                                        className="ml-auto hidden size-6 items-center justify-center rounded-md text-faint group-hover:flex hover:bg-fill hover:text-ink focus-visible:flex"
                                    >
                                        <IconPlus size={14} />
                                    </button>
                                </div>

                                {/* on a phone a day is too narrow for titles: a count, and tapping the day shows them */}
                                {items.length > 0 && (
                                    <button type="button" onClick={() => go({ cal: "week", date: day })} className="mx-auto mt-1 rounded-full bg-accent-soft px-1.5 text-sm font-medium text-accent tabular-nums sm:hidden">
                                        {items.length}
                                    </button>
                                )}
                                <div className="hidden min-w-0 flex-col gap-0.5 sm:flex">
                                    {items.slice(0, SHOWN_PER_DAY).map((activity) => (
                                        <MonthItem key={activity.id} activity={activity} onOpen={onOpen} />
                                    ))}
                                    {items.length > SHOWN_PER_DAY && (
                                        <button type="button" onClick={() => go({ cal: "week", date: day })} className="rounded px-1 text-left text-sm font-medium text-faint hover:bg-fill hover:text-ink">
                                            +{items.length - SHOWN_PER_DAY} more
                                        </button>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            ) : (
                // a column a day from tablets up; on a phone the days stack
                <div className={`grid flex-1 grid-cols-1 md:grid-cols-7 ${query.isPlaceholderData ? "opacity-60" : ""}`}>
                    {days.map((day, index) => {
                        const key = dayKey(day);
                        const items = byDay.get(key) ?? [];
                        return (
                            <section key={key} className={`group flex min-w-0 flex-col border-b border-line-light md:border-b-0 ${index < 6 ? "md:border-r" : ""}`}>
                                <header className="flex items-center gap-1.5 border-line-light px-2 py-2 md:border-b">
                                    <span className="text-sm font-medium text-faint">{WEEKDAYS[index]}</span>
                                    <span
                                        className={`flex size-6 items-center justify-center rounded-full text-sm tabular-nums ${key === today ? "bg-accent font-semibold text-on-accent" : "font-medium text-ink"}`}
                                    >
                                        {day.getDate()}
                                    </span>
                                    <button
                                        type="button"
                                        aria-label={`New activity on ${day.toDateString()}`}
                                        onClick={() => createOn(day)}
                                        className="ml-auto flex size-6 items-center justify-center rounded-md text-faint hover:bg-fill hover:text-ink md:hidden md:group-hover:flex md:focus-visible:flex"
                                    >
                                        <IconPlus size={14} />
                                    </button>
                                </header>
                                <div className="flex flex-col gap-1.5 px-2 pb-2 md:pt-2">
                                    {items.map((activity) => (
                                        <WeekItem key={activity.id} activity={activity} onOpen={onOpen} />
                                    ))}
                                    {items.length === 0 && <p className="hidden text-sm text-light md:block">Free</p>}
                                </div>
                            </section>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

// One line in a month's day: its colour, time and title
function MonthItem({ activity, onOpen }: { activity: Activity; onOpen: (id: number) => void }) {
    const done = activity.status === "COMPLETED";
    return (
        <button
            type="button"
            onClick={() => onOpen(activity.id)}
            title={`${time(activity.scheduledAt)} ${activity.title}`}
            className={`flex min-w-0 items-center gap-1 rounded px-1 text-left text-sm hover:bg-fill ${done ? "text-faint" : "text-ink"}`}
        >
            {done ? (
                <IconCheck size={12} className="shrink-0 text-success" />
            ) : (
                <span className="size-1.5 shrink-0 rounded-full" style={{ background: isOverdue(activity) ? "#dc3e42" : TYPE_COLORS[activity.type] }} />
            )}
            <span className="shrink-0 text-faint tabular-nums">{time(activity.scheduledAt)}</span>
            <span className="truncate">{activity.title}</span>
        </button>
    );
}

// A card in a week's day: when, what, and who or what it's about
function WeekItem({ activity, onOpen }: { activity: Activity; onOpen: (id: number) => void }) {
    const { icon: TypeIcon, label } = ACTIVITY_TYPES.find((item) => item.value === activity.type)!;
    const done = activity.status === "COMPLETED";
    const overdue = isOverdue(activity);
    const about = activity.lead?.name ?? activity.deal?.title ?? activity.contact?.name;
    const ends = activity.durationMinutes ? new Date(new Date(activity.scheduledAt).getTime() + activity.durationMinutes * 60_000).toISOString() : null;

    return (
        <button
            type="button"
            onClick={() => onOpen(activity.id)}
            className="flex w-full min-w-0 flex-col gap-0.5 rounded-lg border border-line-light bg-surface px-2 py-1.5 text-left shadow-[0_1px_2px_rgb(0_0_0/0.04)] hover:border-line"
            style={{ borderLeft: `3px solid ${done ? "#c4c4c4" : overdue ? "#dc3e42" : TYPE_COLORS[activity.type]}` }}
        >
            <span className={`flex items-center gap-1 text-sm tabular-nums ${overdue ? "text-danger" : "text-faint"}`}>
                {done ? <IconCheck size={12} className="text-success" /> : <TypeIcon size={12} aria-label={label} />}
                {time(activity.scheduledAt)}
                {ends && ` – ${time(ends)}`}
            </span>
            <span className={`line-clamp-2 font-medium ${done ? "text-muted" : "text-ink"}`}>{activity.title}</span>
            {about && <span className="truncate text-sm text-faint">{about}</span>}
        </button>
    );
}
