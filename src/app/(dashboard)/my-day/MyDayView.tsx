"use client";

import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { IconAlertTriangle, IconArrowRight, IconBriefcase, IconCalendarEvent, IconCheckbox, IconPhone, IconUserPlus } from "@tabler/icons-react";

import { api, errorMessage } from "@/lib/api/client";
import { formatMoney, timeAgo } from "@/lib/utils/format";
import { DoneCheck } from "@/components/DoneCheck";
import { ErrorState } from "@/components/ErrorState";
import { SkeletonList } from "@/components/Loader";
import { SectionIcon } from "@/components/SectionIcon";
import { toast } from "@/components/Toast";
import { PriorityBadge } from "../shared/tasks";
import { WhatsAppButton } from "../shared/whatsapp";
import { refreshTasks, type TaskPriority } from "../tasks/shared";
import { ACTIVITY_TYPES, refreshActivities, type ActivityType } from "../activities/shared";

interface Linked {
    lead: { id: number; name: string } | null;
    deal: { id: number; title: string } | null;
    contact: { id: number; name: string } | null;
}

interface DayTask extends Linked {
    id: number;
    title: string;
    priority: TaskPriority;
    // a day, stored as midnight UTC
    dueDate: string;
}

interface DayActivity extends Linked {
    id: number;
    title: string;
    type: ActivityType;
    scheduledAt: string;
    durationMinutes: number | null;
}

interface NewLead {
    id: number;
    name: string;
    phone: string | null;
    companyName: string | null;
    createdAt: string;
    source: { name: string } | null;
}

interface ClosingDeal {
    id: number;
    title: string;
    amount: number;
    expectedCloseDate: string;
    pipelineStage: { name: string; color: string };
}

// The first few of a list (the server sends at most 5) and how many there are in all
type Few<T> = { total: number; items: T[] };

interface MyDay {
    overdueTasks: Few<DayTask>;
    todayTasks: Few<DayTask>;
    // today's, plus how many earlier ones were never marked done
    activities: Few<DayActivity> & { missed: number };
    // null: no permission to see leads / deals
    newLeads: (Few<NewLead> & { stage: { id: number; name: string } }) | null;
    closingDeals: Few<ClosingDeal> | null;
}

type Icon = ComponentType<{ size?: number; className?: string }>;

const DAY = 24 * 60 * 60 * 1000;
const MINUTE = 60 * 1000;

// Where each card's "See all" goes: the full list, filtered the same way (and only my own)
const filtered = (path: string, filters: object) => `${path}?filters=${encodeURIComponent(JSON.stringify(filters))}`;
const LINKS = {
    overdue: "/tasks?view=table&scope=overdue",
    today: "/tasks?view=table",
    activities: "/activities?view=table&scope=today",
    missed: "/activities?view=table&scope=overdue",
    leads: (stageId: number) => filtered("/leads", { stageIds: [stageId], assignedTo: "me" }),
    deals: filtered("/deals", { assignedTo: "me", sortBy: "expectedCloseDate", sortOrder: "asc" }),
};

// Days from today to a date-only value (stored as midnight UTC): -2 = two days ago
function daysFromToday(day: string, now: number) {
    const local = new Date(now);
    return Math.round((Date.parse(day) - Date.UTC(local.getFullYear(), local.getMonth(), local.getDate())) / DAY);
}

// "1,000", not "1000"
const count = (value: number) => value.toLocaleString("en-IN");
const plural = (value: number, word: string) => `${count(value)} ${value === 1 ? word : `${word}s`}`;

/**
 * My day: the page a rep opens in the morning. What's overdue, what's due today, today's calls
 * and meetings, new leads nobody has contacted yet, and deals that should close this week, each
 * with what it needs right there: tick it done, call, WhatsApp, or open it. Only their own work.
 * Every card shows its top 5 and a total, so it stays one screen with 10 tasks or 1,000.
 */
export default function MyDayView({ firstName }: { firstName: string }) {
    // the time now, kept fresh so "Now" and "not done" stay true, and the page moves on at midnight
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        const timer = setInterval(() => setNow(Date.now()), MINUTE);
        return () => clearInterval(timer);
    }, []);

    const midnight = new Date(now);
    midnight.setHours(0, 0, 0, 0);
    const dayStart = midnight.toISOString();

    const query = useQuery({
        queryKey: ["my-day", dayStart],
        queryFn: () => api.get<{ data: MyDay }>("/my-day", { params: { dayStart } }).then((res) => res.data.data),
    });
    const day = query.data;

    const hour = new Date(now).getHours();
    const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

    return (
        <div className="flex h-full flex-col">
            <header className="flex h-12 shrink-0 items-center gap-2 border-b border-line bg-paper px-3">
                <SectionIcon section="myDay" size="md" />
                <h1 className="font-semibold">My day</h1>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto bg-paper">
                <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-7 lg:px-8">
                    <h2 className="text-[22px] leading-7 font-semibold tracking-[-0.02em]">
                        {greeting}, {firstName}
                    </h2>
                    <p className="mt-1 text-muted">
                        {midnight.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
                        {day && ` · ${summary(day)}`}
                    </p>

                    {day && <Counts day={day} />}

                    {query.isPending && (
                        <div className="mt-6 grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
                            <SkeletonList rows={5} />
                            <SkeletonList rows={5} />
                            <SkeletonList rows={5} />
                        </div>
                    )}
                    {query.isError && <ErrorState title="Couldn't load your day" error={query.error} onRetry={() => query.refetch()} retrying={query.isFetching} />}

                    {day && (
                        <div className="mt-6 grid items-start gap-4 lg:grid-cols-2 xl:grid-cols-3">
                            <div className="flex min-w-0 flex-col gap-4">
                                {day.overdueTasks.total > 0 && (
                                    <Card id="overdue" icon={IconAlertTriangle} danger title="Overdue" list={day.overdueTasks} href={LINKS.overdue} more="overdue tasks" empty="">
                                        {day.overdueTasks.items.map((task) => (
                                            <TaskRow key={task.id} task={task} late={-daysFromToday(task.dueDate, now)} />
                                        ))}
                                    </Card>
                                )}
                                <Card id="tasks" icon={IconCheckbox} title="Due today" list={day.todayTasks} href={LINKS.today} more="tasks due today" empty="No tasks due today.">
                                    {day.todayTasks.items.map((task) => (
                                        <TaskRow key={task.id} task={task} />
                                    ))}
                                </Card>
                            </div>

                            <div className="flex min-w-0 flex-col gap-4">
                                <Card
                                    id="calls"
                                    icon={IconCalendarEvent}
                                    title="Calls & meetings"
                                    list={day.activities}
                                    href={LINKS.activities}
                                    more="today"
                                    empty="Nothing booked for today."
                                    extra={
                                        day.activities.missed > 0 && (
                                            <MoreLink href={LINKS.missed} danger>
                                                {plural(day.activities.missed, "earlier call or meeting")} not marked done
                                            </MoreLink>
                                        )
                                    }
                                >
                                    {day.activities.items.map((activity) => (
                                        <ActivityRow key={activity.id} activity={activity} now={now} />
                                    ))}
                                </Card>
                            </div>

                            <div className="flex min-w-0 flex-col gap-4 lg:col-span-2 lg:grid lg:grid-cols-2 lg:items-start xl:col-span-1 xl:flex">
                                {day.newLeads && (
                                    <Card
                                        id="leads"
                                        icon={IconUserPlus}
                                        title="Waiting for first contact"
                                        list={day.newLeads}
                                        hint={`Your leads in "${day.newLeads.stage.name}" with no call or task planned, newest first. Book a call or add a task and they leave this list.`}
                                        href={LINKS.leads(day.newLeads.stage.id)}
                                        more="waiting"
                                        empty="Every new lead of yours has a next step planned."
                                    >
                                        {day.newLeads.items.map((lead) => (
                                            <LeadRow key={lead.id} lead={lead} now={now} />
                                        ))}
                                    </Card>
                                )}
                                {day.closingDeals && (
                                    <Card
                                        id="deals"
                                        icon={IconBriefcase}
                                        title="Closing this week"
                                        list={day.closingDeals}
                                        href={LINKS.deals}
                                        more="closing this week"
                                        empty="No deals of yours are due to close this week."
                                    >
                                        {day.closingDeals.items.map((deal) => (
                                            <DealRow key={deal.id} deal={deal} now={now} />
                                        ))}
                                    </Card>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

// "2 overdue · 3 tasks today · 1 call or meeting · 4 new leads", or all clear
function summary(day: MyDay) {
    const parts = [
        day.overdueTasks.total > 0 && `${count(day.overdueTasks.total)} overdue`,
        day.todayTasks.total > 0 && `${plural(day.todayTasks.total, "task")} today`,
        day.activities.total > 0 && `${count(day.activities.total)} ${day.activities.total === 1 ? "call or meeting" : "calls and meetings"}`,
        day.newLeads && day.newLeads.total > 0 && plural(day.newLeads.total, "new lead"),
    ].filter(Boolean);
    return parts.length > 0 ? parts.join(" · ") : "You're all caught up";
}

// The day at a glance: one count per card, each jumping down to its card. Red when something's late.
function Counts({ day }: { day: MyDay }) {
    const tiles = [
        { id: "overdue", label: "Overdue tasks", count: day.overdueTasks.total, danger: true },
        { id: "tasks", label: "Due today", count: day.todayTasks.total },
        { id: "calls", label: "Calls & meetings", count: day.activities.total },
        day.activities.missed > 0 && { id: "calls", label: "Not marked done", count: day.activities.missed, danger: true },
        day.newLeads && { id: "leads", label: "Leads waiting", count: day.newLeads.total },
        day.closingDeals && { id: "deals", label: "Closing this week", count: day.closingDeals.total },
    ].filter((tile) => tile !== false && tile !== null);

    return (
        <ul className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {tiles.map((tile) => {
                const late = tile.danger && tile.count > 0;
                return (
                    <li key={tile.label}>
                        {/* overdue tasks have no card when there are none, so that tile isn't a link */}
                        <a
                            href={tile.count > 0 || tile.id !== "overdue" ? `#${tile.id}` : undefined}
                            className={`block rounded-xl border bg-surface px-4 py-3 ${late ? "border-danger/30" : "border-line"} [&[href]]:hover:bg-app`}
                        >
                            <span className={`block font-display text-[24px] leading-8 font-semibold tabular-nums ${late ? "text-danger" : tile.count > 0 ? "text-ink" : "text-faint"}`}>
                                {count(tile.count)}
                            </span>
                            <span className="block truncate text-sm text-muted">{tile.label}</span>
                        </a>
                    </li>
                );
            })}
        </ul>
    );
}

// A card: its title and total, up to 5 rows, and "+N more" leading to the full list
function Card({
    id,
    icon: Icon,
    title,
    list,
    hint,
    href,
    more,
    danger = false,
    empty,
    extra,
    children,
}: {
    // what the counts at the top jump to
    id: string;
    icon: Icon;
    title: string;
    list: Few<unknown>;
    hint?: string;
    href: string;
    // what the rest are, after "+995 more ": "overdue tasks"
    more: string;
    danger?: boolean;
    empty: string;
    // another line under the list (missed calls)
    extra?: ReactNode;
    children: ReactNode;
}) {
    const hidden = list.total - list.items.length;

    return (
        <section id={id} className={`min-w-0 scroll-mt-4 rounded-xl border bg-surface ${danger ? "border-danger/30" : "border-line"}`}>
            <header className="flex h-11 items-center gap-2 border-b border-line-light px-4">
                <Icon size={16} className={`shrink-0 ${danger ? "text-danger" : "text-faint"}`} />
                <h3 className="truncate font-semibold">{title}</h3>
                <span className={`shrink-0 rounded-full px-1.5 text-sm font-medium tabular-nums ${danger ? "bg-danger-soft text-danger" : "bg-fill text-muted"}`}>
                    {count(list.total)}
                </span>
                <Link href={href} className="ml-auto shrink-0 text-sm text-faint hover:text-ink">
                    See all
                </Link>
            </header>
            {hint && list.total > 0 && <p className="px-4 pt-2 text-sm text-faint">{hint}</p>}
            {list.total === 0 ? <p className="px-4 py-6 text-center text-faint">{empty}</p> : <ul className="p-1">{children}</ul>}
            {hidden > 0 && (
                <MoreLink href={href}>
                    +{count(hidden)} more {more}
                </MoreLink>
            )}
            {extra}
        </section>
    );
}

function MoreLink({ href, danger = false, children }: { href: string; danger?: boolean; children: ReactNode }) {
    return (
        <Link
            href={href}
            className={`flex items-center gap-1.5 border-t border-line-light px-4 py-2.5 text-sm font-medium hover:underline ${danger ? "text-danger" : "text-accent"}`}
        >
            <span className="min-w-0">{children}</span>
            <IconArrowRight size={14} className="shrink-0" />
        </Link>
    );
}

// The lead, deal or contact a task or activity is about, as a link under its title
function RecordLink({ item }: { item: Linked }) {
    const record = item.lead
        ? { href: `/leads?open=${item.lead.id}`, name: item.lead.name }
        : item.deal
          ? { href: `/deals?open=${item.deal.id}`, name: item.deal.title }
          : item.contact
            ? { href: `/contacts?open=${item.contact.id}`, name: item.contact.name }
            : null;
    if (!record) return null;
    return (
        <Link href={record.href} className="block truncate text-sm text-faint hover:text-ink hover:underline">
            {record.name}
        </Link>
    );
}

const rowClassName = "flex min-h-11 items-center gap-2.5 rounded-lg px-3 py-1.5 hover:bg-paper";
// the right-hand detail of a row: never squeezed, never wrapped
const detailClassName = "shrink-0 text-right text-sm whitespace-nowrap";

// A task: tick it done (it leaves the list), or open it
function TaskRow({ task, late }: { task: DayTask; late?: number }) {
    const queryClient = useQueryClient();
    const complete = useMutation({
        mutationFn: () => api.put(`/tasks/${task.id}`, { status: "COMPLETED" }),
        onSuccess: () => {
            toast.success("Task done");
            refreshTasks(queryClient);
            queryClient.invalidateQueries({ queryKey: ["my-day"] });
        },
        onError: (error) => toast.error(errorMessage(error)),
    });

    return (
        <li className={rowClassName}>
            <DoneCheck done={complete.isSuccess} label="Mark as done" onClick={() => complete.mutate()} disabled={complete.isPending || complete.isSuccess} />
            <div className="min-w-0 flex-1">
                <Link href={`/tasks?open=${task.id}`} className="block truncate text-ink hover:underline">
                    {task.title}
                </Link>
                <RecordLink item={task} />
            </div>
            {/* on a phone there's room for one detail: how late it is, or its priority */}
            <span className={late !== undefined ? "hidden sm:inline-flex" : "inline-flex"}>
                <PriorityBadge priority={task.priority} />
            </span>
            {late !== undefined && <span className={`${detailClassName} font-medium text-danger`}>{plural(late, "day")} late</span>}
        </li>
    );
}

// A call or meeting: when (or that it's on now, or its time passed), tick it done, or open it
function ActivityRow({ activity, now }: { activity: DayActivity; now: number }) {
    const queryClient = useQueryClient();
    const complete = useMutation({
        mutationFn: () => api.put(`/activities/${activity.id}`, { status: "COMPLETED" }),
        onSuccess: () => {
            toast.success("Marked as done");
            refreshActivities(queryClient);
            queryClient.invalidateQueries({ queryKey: ["my-day"] });
        },
        onError: (error) => toast.error(errorMessage(error)),
    });

    const start = Date.parse(activity.scheduledAt);
    const end = start + (activity.durationMinutes ?? 0) * MINUTE;
    const time = new Date(start).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    const when =
        start <= now && now < Math.max(end, start + 15 * MINUTE)
            ? { label: `Now · ${time}`, className: "font-medium text-accent" }
            : start < now
              ? { label: `${time} · not done`, className: "font-medium text-danger" }
              : { label: time, className: "text-muted" };
    const TypeIcon = ACTIVITY_TYPES.find((type) => type.value === activity.type)!.icon;

    return (
        <li className={rowClassName}>
            <DoneCheck done={complete.isSuccess} label="Mark as done" onClick={() => complete.mutate()} disabled={complete.isPending || complete.isSuccess} />
            <TypeIcon size={16} className="hidden shrink-0 text-faint sm:block" />
            <div className="min-w-0 flex-1">
                <Link href={`/activities?open=${activity.id}`} className="block truncate text-ink hover:underline">
                    {activity.title}
                </Link>
                <RecordLink item={activity} />
            </div>
            <span className={`${detailClassName} ${when.className}`}>{when.label}</span>
        </li>
    );
}

// A lead nobody has contacted yet: how long it's waited, and call / WhatsApp right here
function LeadRow({ lead, now }: { lead: NewLead; now: number }) {
    // a day without a reply is when a lead goes cold
    const waitingLong = now - Date.parse(lead.createdAt) > DAY;

    return (
        <li className={rowClassName}>
            <div className="min-w-0 flex-1">
                <Link href={`/leads?open=${lead.id}`} className="block truncate font-medium text-ink hover:underline">
                    {lead.name}
                </Link>
                <span className="block truncate text-sm text-faint">
                    <span className={waitingLong ? "font-medium text-danger" : ""}>{timeAgo(lead.createdAt)}</span>
                    {[lead.companyName, lead.source?.name].filter(Boolean).map((part) => ` · ${part}`)}
                </span>
            </div>
            {lead.phone && (
                <a
                    href={`tel:${lead.phone}`}
                    aria-label={`Call ${lead.name}`}
                    className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-fill hover:text-ink"
                >
                    <IconPhone size={16} />
                </a>
            )}
            <WhatsAppButton
                phone={lead.phone}
                entity="lead"
                recordId={lead.id}
                values={{ "lead.firstName": lead.name.split(" ")[0], "lead.name": lead.name, "lead.company": lead.companyName }}
            />
        </li>
    );
}

// A deal that should close soon: its stage, amount, and how close (or late) its date is
function DealRow({ deal, now }: { deal: ClosingDeal; now: number }) {
    const days = daysFromToday(deal.expectedCloseDate, now);
    const due =
        days < 0
            ? { label: `${plural(-days, "day")} late`, className: "font-medium text-danger" }
            : days === 0
              ? { label: "Closes today", className: "font-medium text-[#d68b00]" }
              : { label: days === 1 ? "Tomorrow" : `In ${days} days`, className: "text-muted" };

    return (
        <li className={rowClassName}>
            <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ backgroundColor: deal.pipelineStage.color }} />
            <div className="min-w-0 flex-1">
                <Link href={`/deals?open=${deal.id}`} className="block truncate font-medium text-ink hover:underline">
                    {deal.title}
                </Link>
                <span className="block truncate text-sm text-faint">
                    {deal.pipelineStage.name} · {formatMoney(deal.amount)}
                </span>
            </div>
            <span className={`${detailClassName} ${due.className}`}>{due.label}</span>
        </li>
    );
}
