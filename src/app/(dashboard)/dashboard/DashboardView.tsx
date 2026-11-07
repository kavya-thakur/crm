"use client";

import { useLayoutEffect, useRef, useState, type ComponentType, type ReactNode } from "react";
import Link from "next/link";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import gsap from "gsap";
import {
    IconAlertTriangle,
    IconAntenna,
    IconSpeakerphone,
    IconArrowDownRight,
    IconArrowRight,
    IconArrowUpRight,
    IconCalendarDue,
    IconCalendarEvent,
    IconChartArrowsVertical,
    IconChartFunnel,
    IconCircle,
    IconCircleCheck,
    IconCoin,
    IconLayoutKanban,
    IconListCheck,
    IconTargetArrow,
    IconThumbDown,
    IconTrendingUp,
    IconTrophy,
    IconUsersGroup,
} from "@tabler/icons-react";

import { api } from "@/lib/api/client";
import type { DashboardRange } from "@/lib/dashboard/periods";
import { formatDay, formatMoney, formatMoneyShort } from "@/lib/utils/format";
import { ErrorState } from "@/components/ErrorState";
import { Skeleton } from "@/components/Loader";
import { SectionIcon, TONES, type Tone } from "@/components/SectionIcon";
import { Select } from "@/components/Select";
import { Avatar } from "@/components/Avatar";
import { PriorityBadge } from "../shared/tasks";
import { ACTIVITY_TYPES, durationLabel, type ActivityType } from "../activities/shared";
import type { TaskPriority } from "../tasks/shared";
import { TrendChart, type TrendPoint } from "./TrendChart";
import { TeamTable, type Team } from "./TeamTable";

interface Stage {
    id: number;
    name: string;
    color: string;
    count: number;
}

interface Dashboard {
    range: DashboardRange;
    agentId: number | null;
    scope: "team" | "mine";
    deals: {
        won: {
            value: number;
            count: number;
            previousValue: number;
            previousCount: number;
            averageDeal: number;
            averageDays: number | null;
            trend: TrendPoint[];
            previousTrend: number[];
            bySource: { sourceId: number | null; value: number; count: number }[];
            byCampaign: { campaign: string; value: number; count: number }[];
        };
        lost: { count: number; previousCount: number; reasons: LostReason[] };
        open: { value: number; count: number; weighted: number; stages: (Stage & { value: number })[] };
        closing: {
            total: number;
            value: number;
            pastDue: number;
            items: { id: number; title: string; amount: number; probability: number; expectedCloseDate: string; stage: Stage }[];
        };
    } | null;
    leads: {
        created: number;
        previousCreated: number;
        converted: number;
        previousConverted: number;
        trend: TrendPoint[];
        stages: (Stage & { isConverted: boolean; isLost: boolean })[];
        sources: { id: number | null; name: string; color: string | null; count: number; converted: number }[];
        campaigns: { campaign: string; count: number; converted: number }[];
        lostReasons: LostReason[];
    } | null;
    team: Team | null;
    tasks: {
        overdue: number;
        dueToday: number;
        items: { id: number; title: string; dueDate: string; priority: TaskPriority }[];
    };
    activities: { id: number; title: string; type: ActivityType; scheduledAt: string; durationMinutes: number | null }[];
}

type LostReason = { reason: string; count: number };
type Deals = NonNullable<Dashboard["deals"]>;
type Leads = NonNullable<Dashboard["leads"]>;
type Icon = ComponentType<{ size?: number; stroke?: number; className?: string }>;

const RANGES: Record<DashboardRange, { short: string; long: string }> = {
    "7d": { short: "7D", long: "7 days" },
    "30d": { short: "30D", long: "30 days" },
    "90d": { short: "90D", long: "90 days" },
    "12m": { short: "12M", long: "12 months" },
};

// The chart's slices start at UTC midnight (see lib/dashboard), so label them in UTC too
function utcDate(iso: string, options: Intl.DateTimeFormatOptions) {
    return new Date(iso).toLocaleDateString("en-US", { ...options, timeZone: "UTC" });
}

function percent(part: number, whole: number) {
    return whole === 0 ? 0 : Math.round((part / whole) * 100);
}

function plural(count: number, word: string) {
    return `${count} ${count === 1 ? word : `${word}s`}`;
}

function greeting() {
    const hour = new Date().getHours();
    return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}

export default function DashboardView({ firstName, userId }: { firstName: string; userId: number }) {
    const [range, setRange] = useState<DashboardRange>("30d");
    const [agentId, setAgentId] = useState<number | null>(null);

    const dashboardQuery = useQuery({
        queryKey: ["dashboard", range, agentId],
        queryFn: () =>
            api.get<{ data: Dashboard }>("/dashboard", { params: { range, ...(agentId && { agentId }) } }).then((res) => res.data.data),
        // switching a filter keeps the old numbers on screen (dimmed) until the new ones land
        placeholderData: keepPreviousData,
    });

    const data = dashboardQuery.data;
    const agent = data?.team?.people.find((person) => person.id === agentId);
    const whose = agent ? `${agent.name.split(" ")[0]} is` : data?.scope === "team" ? "the team is" : "you're";

    return (
        <div className="flex h-full flex-col">
            <header className="flex h-12 shrink-0 items-center gap-2 border-b border-line bg-paper px-3">
                <SectionIcon section="dashboard" size="md" />
                <h1 className="font-display text-[15px] font-semibold tracking-[-0.01em]">Dashboard</h1>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto bg-paper">
                <div className="mx-auto flex max-w-7xl flex-col gap-6 px-6 py-7 lg:px-8">
                    {/* the greeting, and the filters that scope everything below them */}
                    <div className="flex flex-wrap items-end justify-between gap-4">
                        <div>
                            <h2 className="font-display text-[22px] leading-7 font-semibold tracking-[-0.02em] text-ink" suppressHydrationWarning>
                                {greeting()}, {firstName}
                            </h2>
                            <p className="mt-1 text-muted">
                                Here&apos;s how {whose} doing over the last {RANGES[range].long}.
                            </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            {data?.team && (
                                <div className="w-52">
                                    <Select
                                        value={agentId ? String(agentId) : ""}
                                        onChange={(value) => setAgentId(value ? Number(value) : null)}
                                        placeholder="Everyone"
                                        options={[
                                            { value: "", label: "Everyone", render: <span className="flex items-center gap-2"><IconUsersGroup size={16} className="text-faint" />Everyone</span> },
                                            ...data.team.people.map((person) => ({
                                                value: String(person.id),
                                                label: person.name,
                                                render: (
                                                    <span className="flex items-center gap-2">
                                                        <Avatar name={person.name} />
                                                        {person.name}
                                                    </span>
                                                ),
                                            })),
                                        ]}
                                    />
                                </div>
                            )}
                            <RangePicker value={range} onChange={setRange} />
                        </div>
                    </div>

                    {dashboardQuery.isPending && <DashboardSkeleton />}
                    {dashboardQuery.isError && (
                        <ErrorState
                            title="Couldn't load your dashboard"
                            error={dashboardQuery.error}
                            onRetry={() => dashboardQuery.refetch()}
                            retrying={dashboardQuery.isFetching}
                        />
                    )}
                    {data && (
                        <div className={`transition-opacity duration-200 ${dashboardQuery.isPlaceholderData ? "opacity-60" : ""}`}>
                            <Overview data={data} range={range} userId={userId} agentId={agentId} onPickAgent={setAgentId} />
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function RangePicker({ value, onChange }: { value: DashboardRange; onChange: (range: DashboardRange) => void }) {
    return (
        <div role="radiogroup" aria-label="Period" className="flex rounded-lg bg-fill p-0.5">
            {(Object.keys(RANGES) as DashboardRange[]).map((key) => (
                <button
                    key={key}
                    type="button"
                    role="radio"
                    aria-checked={value === key}
                    aria-label={`Last ${RANGES[key].long}`}
                    onClick={() => onChange(key)}
                    className={`h-7 rounded-md px-3 text-sm font-medium transition-colors ${
                        value === key ? "bg-surface text-ink shadow-[0_1px_2px_rgb(0_0_0/0.08)]" : "text-muted hover:text-ink"
                    }`}
                >
                    {RANGES[key].short}
                </button>
            ))}
        </div>
    );
}

// Everything under the filters. Deal, lead and team cards only appear when the API sends
// them, so the grid fills whatever space the cards someone can see leave.
function Overview({
    data,
    range,
    userId,
    agentId,
    onPickAgent,
}: {
    data: Dashboard;
    range: DashboardRange;
    userId: number;
    agentId: number | null;
    onPickAgent: (id: number | null) => void;
}) {
    const rootRef = useRef<HTMLDivElement>(null);
    const { deals, leads, team } = data;
    const period = RANGES[range].long;
    const against = `vs previous ${period}`;

    // The cards rise in one after another the first time the page loads
    useLayoutEffect(() => {
        const media = gsap.matchMedia();
        media.add("(prefers-reduced-motion: no-preference)", () => {
            gsap.fromTo(
                rootRef.current!.querySelectorAll("[data-card]"),
                { opacity: 0, y: 12 },
                { opacity: 1, y: 0, duration: 0.45, ease: "power2.out", stagger: 0.04 },
            );
        });
        return () => media.revert();
    }, []);

    return (
        <div ref={rootRef} className="grid gap-4 lg:grid-cols-3">
            {deals && <DealTiles deals={deals} against={against} />}
            {!deals && leads && <LeadTiles leads={leads} against={against} />}

            {deals && <RevenueCard deals={deals} range={range} against={against} />}
            {deals && <ClosingSoonCard closing={deals.closing} />}

            {team && (
                <Card
                    title="Team performance"
                    description={`Ranked over the last ${period}. Click someone to see the dashboard through their numbers.`}
                    icon={IconUsersGroup}
                    tone="violet"
                    className="lg:col-span-3"
                >
                    <TeamTable team={team} meId={userId} selectedId={agentId} onPick={onPickAgent} />
                </Card>
            )}

            {deals && <PipelineCard open={deals.open} className={leads ? "lg:col-span-2" : "lg:col-span-3"} />}
            {leads && <LeadStagesCard leads={leads} period={period} className={deals ? "" : "lg:col-span-3"} />}

            {leads && <NewLeadsCard leads={leads} range={range} against={against} />}
            {(deals || leads) && <LostReasonsCard deals={deals?.lost.reasons} leads={leads?.lostReasons} period={period} className={leads ? "" : "lg:col-span-3"} />}
            {leads && <SourcePerformanceCard sources={leads.sources} won={deals?.won.bySource} period={period} />}
            {leads && <CampaignPerformanceCard campaigns={leads.campaigns} won={deals?.won.byCampaign} period={period} />}

            <div className="grid gap-4 lg:col-span-3 lg:grid-cols-2">
                <TasksCard tasks={data.tasks} />
                <ActivitiesCard activities={data.activities} />
            </div>
        </div>
    );
}

// --- Cards -----------------------------------------------------------------------------

function DealTiles({ deals, against }: { deals: Deals; against: string }) {
    const closed = deals.won.count + deals.lost.count;
    const previousClosed = deals.won.previousCount + deals.lost.previousCount;
    const winRate = percent(deals.won.count, closed);

    return (
        <div className="grid gap-4 sm:grid-cols-2 lg:col-span-3 xl:grid-cols-4">
            <StatTile icon={IconChartArrowsVertical} tone="blue" label="Open pipeline" value={<CountUp value={deals.open.value} format={formatMoney} />}>
                <p className="text-sm text-faint">Across {plural(deals.open.count, "open deal")}</p>
            </StatTile>

            <StatTile icon={IconTrendingUp} tone="indigo" label="Weighted forecast" value={<CountUp value={deals.open.weighted} format={formatMoney} />}>
                <p className="text-sm text-faint">Open deals × their chance to close</p>
            </StatTile>

            <StatTile icon={IconTrophy} tone="green" label="Win rate" value={closed ? `${winRate}%` : "—"}>
                {/* the share won, as a fill on a lighter track of the same blue */}
                <div
                    role="meter"
                    aria-label="Win rate"
                    aria-valuenow={winRate}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    className="mb-2 h-1.5 overflow-hidden rounded-full bg-accent-soft"
                >
                    <div className="h-full rounded-full bg-accent transition-[width] duration-700" style={{ width: `${winRate}%` }} />
                </div>
                {closed && previousClosed ? (
                    <Change current={winRate} previous={percent(deals.won.previousCount, previousClosed)} points against={against} />
                ) : (
                    <p className="text-sm text-faint">
                        {deals.won.count} won · {deals.lost.count} lost
                    </p>
                )}
            </StatTile>

            <StatTile icon={IconCoin} tone="amber" label="Average deal" value={deals.won.count ? <CountUp value={deals.won.averageDeal} format={formatMoney} /> : "—"}>
                <p className="text-sm text-faint">
                    {deals.won.averageDays === null ? "No deals won yet" : `Won in ${plural(deals.won.averageDays, "day")} on average`}
                </p>
            </StatTile>
        </div>
    );
}

// For someone who sees leads but not deals: the lead numbers take the top row instead
function LeadTiles({ leads, against }: { leads: Leads; against: string }) {
    return (
        <div className="grid gap-4 sm:grid-cols-2 lg:col-span-3">
            <StatTile icon={IconTargetArrow} tone="rose" label="New leads" value={<CountUp value={leads.created} format={String} />}>
                <Change current={leads.created} previous={leads.previousCreated} against={against} />
            </StatTile>
            <StatTile icon={IconTrophy} tone="green" label="Lead conversion" value={`${percent(leads.converted, leads.created)}%`}>
                <Change
                    current={percent(leads.converted, leads.created)}
                    previous={percent(leads.previousConverted, leads.previousCreated)}
                    points
                    against={against}
                />
            </StatTile>
        </div>
    );
}

function RevenueCard({ deals, range, against }: { deals: Deals; range: DashboardRange; against: string }) {
    const { won } = deals;

    return (
        <Card title="Revenue won" icon={IconCoin} tone="green" className="lg:col-span-2">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <CountUp value={won.value} format={formatMoney} className="font-display text-[48px] leading-none font-semibold tracking-[-0.035em] text-ink tabular-nums" />
                <Change current={won.value} previous={won.previousValue} against={against} />
            </div>
            <p className="mt-2 text-muted">
                {won.count === 0
                    ? `No deals won in the last ${RANGES[range].long} yet`
                    : `From ${plural(won.count, "deal")} won · ${formatMoney(won.previousValue)} the ${RANGES[range].long} before`}
            </p>
            <div className="mt-5">
                <TrendChart
                    title="Revenue won"
                    points={won.trend}
                    previous={won.previousTrend}
                    axisLabel={(point) => axisLabel(point, range)}
                    tooltipLabel={(point) => tooltipLabel(point, range)}
                    formatTick={formatMoneyShort}
                    formatValue={formatMoney}
                />
            </div>
        </Card>
    );
}

function axisLabel(point: TrendPoint, range: DashboardRange) {
    return utcDate(point.start, range === "12m" ? { month: "short" } : { month: "short", day: "numeric" });
}

function tooltipLabel(point: TrendPoint, range: DashboardRange) {
    if (range === "12m") return utcDate(point.start, { month: "long", year: "numeric" });
    if (range === "90d") return `Week of ${utcDate(point.start, { month: "short", day: "numeric" })}`;
    return utcDate(point.start, { weekday: "short", month: "short", day: "numeric" });
}

// Open deals expected to close in the next 30 days, soonest first
function ClosingSoonCard({ closing }: { closing: Deals["closing"] }) {
    return (
        <Card
            title="Closing soon"
            description={closing.total ? `${formatMoney(closing.value)} across ${plural(closing.total, "deal")} in the next 30 days` : undefined}
            icon={IconCalendarDue}
            tone="orange"
            action={<CardLink href="/deals">Deals</CardLink>}
        >
            {closing.items.length === 0 ? (
                <Empty>No deals expected to close in the next 30 days.</Empty>
            ) : (
                <ul className="-mx-2 flex flex-col">
                    {closing.items.map((deal) => (
                        <li key={deal.id}>
                            <Link href={`/deals?open=${deal.id}`} className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-paper">
                                <DateLeaf
                                    top={utcDate(deal.expectedCloseDate, { month: "short" })}
                                    bottom={utcDate(deal.expectedCloseDate, { day: "numeric" })}
                                />
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate font-medium text-ink">{deal.title}</span>
                                    <span className="flex items-center gap-1.5 text-sm text-faint">
                                        <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: deal.stage.color }} />
                                        <span className="truncate">{deal.stage.name}</span> · {deal.probability}% likely
                                    </span>
                                </span>
                                <span className="shrink-0 font-display font-medium text-ink tabular-nums">{formatMoneyShort(deal.amount)}</span>
                            </Link>
                        </li>
                    ))}
                </ul>
            )}

            {closing.pastDue > 0 && (
                <p className="mt-auto flex items-center gap-1.5 border-t border-line-light pt-3 text-sm text-danger">
                    <IconAlertTriangle size={14} className="shrink-0" />
                    {plural(closing.pastDue, "open deal")} {closing.pastDue === 1 ? "is" : "are"} past the expected close date
                </p>
            )}
        </Card>
    );
}

// One bar per stage, in board order, its length the money sitting in that stage
function PipelineCard({ open, className }: { open: Deals["open"]; className: string }) {
    const largest = Math.max(...open.stages.map((stage) => stage.value), 1);

    return (
        <Card
            title="Pipeline by stage"
            description={`${formatMoney(open.value)} in ${plural(open.count, "open deal")}`}
            icon={IconLayoutKanban}
            tone="blue"
            className={className}
            action={<CardLink href="/deals">Open board</CardLink>}
        >
            {open.stages.length === 0 ? (
                <Empty>No open stages. Add some in Settings → Stages &amp; sources.</Empty>
            ) : (
                <ul className="flex flex-col gap-3.5">
                    {open.stages.map((stage) => (
                        <BarRow
                            key={stage.id}
                            name={stage.name}
                            color={stage.color}
                            share={stage.value / largest}
                            figure={
                                <>
                                    <span className="font-display font-medium text-ink tabular-nums">{formatMoneyShort(stage.value)}</span>
                                    <span className="text-faint"> · {plural(stage.count, "deal")}</span>
                                </>
                            }
                        />
                    ))}
                </ul>
            )}
        </Card>
    );
}

// Where this period's leads are now, stage by stage: a funnel in board order
function LeadStagesCard({ leads, period, className }: { leads: Leads; period: string; className: string }) {
    const largest = Math.max(...leads.stages.map((stage) => stage.count), 1);

    return (
        <Card
            title="Lead stages"
            description={`Where the ${plural(leads.created, "new lead")} of the last ${period} are now`}
            icon={IconChartFunnel}
            tone="rose"
            className={className}
        >
            {leads.created === 0 ? (
                <Empty>No new leads in the last {period}.</Empty>
            ) : (
                <ul className="flex flex-col gap-3.5">
                    {leads.stages.map((stage) => (
                        <BarRow
                            key={stage.id}
                            name={stage.name}
                            color={stage.color}
                            share={stage.count / largest}
                            figure={
                                <>
                                    <span className="font-medium text-ink">{stage.count}</span>
                                    <span className="inline-block w-10 text-faint">{percent(stage.count, leads.created)}%</span>
                                </>
                            }
                        />
                    ))}
                </ul>
            )}
        </Card>
    );
}

function NewLeadsCard({ leads, range, against }: { leads: Leads; range: DashboardRange; against: string }) {
    const rate = percent(leads.converted, leads.created);

    return (
        <Card title="New leads" icon={IconTargetArrow} tone="rose" className="lg:col-span-2" action={<CardLink href="/leads">Leads</CardLink>}>
            <div className="flex flex-wrap gap-x-10 gap-y-3">
                <div>
                    <p className="text-[28px] leading-8 font-semibold tracking-tight text-ink">
                        <CountUp value={leads.created} format={String} />
                    </p>
                    <div className="mt-1">
                        <Change current={leads.created} previous={leads.previousCreated} against={against} />
                    </div>
                </div>
                <div>
                    <p className="text-[28px] leading-8 font-semibold tracking-tight text-ink">
                        {rate}%<span className="ml-2 text-base font-normal tracking-normal text-faint">converted ({leads.converted})</span>
                    </p>
                    <div className="mt-1">
                        <Change current={rate} previous={percent(leads.previousConverted, leads.previousCreated)} points against={against} />
                    </div>
                </div>
            </div>
            <div className="mt-5">
                <TrendChart
                    title="New leads"
                    variant="columns"
                    height={132}
                    points={leads.trend}
                    axisLabel={(point) => axisLabel(point, range)}
                    tooltipLabel={(point) => tooltipLabel(point, range)}
                    formatTick={(value) => (Number.isInteger(value) ? String(value) : "")}
                    formatValue={(value) => plural(value, "lead")}
                />
            </div>
        </Card>
    );
}

// Which sources are worth the effort: how many leads each brought this period, how many of
// those converted, and the revenue won from deals that started as one of its leads
function SourcePerformanceCard({ sources, won, period }: { sources: Leads["sources"]; won: Deals["won"]["bySource"] | undefined; period: string }) {
    const rows = sources.map((source) => {
        const deals = won?.find((row) => row.sourceId === source.id);
        return { key: String(source.id), name: source.name, color: source.color ?? "#d6d6d6", count: source.count, converted: source.converted, revenue: deals?.value ?? 0, wonCount: deals?.count ?? 0 };
    });

    return (
        <Card
            title="Source performance"
            description={`Where the last ${period}'s leads came from, and which sources turn into customers`}
            icon={IconAntenna}
            tone="sky"
            className="lg:col-span-3"
        >
            <PerformanceTable label="Source" rows={rows} showRevenue={!!won} empty={`No new leads in the last ${period}.`} />
        </Card>
    );
}

// The same for ad campaigns: leads that came in through a web form link tagged
// ?utm_campaign=…, and the revenue won from them. Leads with no campaign aren't listed.
function CampaignPerformanceCard({ campaigns, won, period }: { campaigns: Leads["campaigns"]; won: Deals["won"]["byCampaign"] | undefined; period: string }) {
    const names = [...new Set([...campaigns.map((row) => row.campaign), ...(won ?? []).map((row) => row.campaign)])];
    const rows = names.map((name) => {
        const leads = campaigns.find((row) => row.campaign === name);
        const deals = won?.find((row) => row.campaign === name);
        return { key: name, name, count: leads?.count ?? 0, converted: leads?.converted ?? 0, revenue: deals?.value ?? 0, wonCount: deals?.count ?? 0 };
    });

    return (
        <Card
            title="Campaign performance"
            description={`Which ad campaigns brought leads and revenue in the last ${period}`}
            icon={IconSpeakerphone}
            tone="violet"
            className="lg:col-span-3"
        >
            <PerformanceTable
                label="Campaign"
                rows={rows}
                showRevenue={!!won}
                empty={`No leads from a campaign in the last ${period}. Add ?utm_campaign=your-campaign to a web form's link to track one.`}
            />
        </Card>
    );
}

type PerformanceRow = { key: string; name: string; color?: string; count: number; converted: number; revenue: number; wonCount: number };

// Leads, conversion and revenue per row (a source or a campaign), best earners first; rows
// that brought neither leads nor revenue this period are left out
function PerformanceTable({ label, rows: all, showRevenue, empty }: { label: string; rows: PerformanceRow[]; showRevenue: boolean; empty: string }) {
    const rows = all.filter((row) => row.count > 0 || row.revenue > 0).sort((a, b) => b.revenue - a.revenue || b.count - a.count);
    const topRevenue = Math.max(...rows.map((row) => row.revenue), 1);
    const head = "py-2 pr-5 text-right font-medium whitespace-nowrap";

    if (rows.length === 0) return <Empty>{empty}</Empty>;

    return (
        <div className="-mx-5 overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse">
                <thead>
                    <tr className="border-y border-line-light text-left text-sm text-faint">
                        <th className="py-2 pr-4 pl-5 font-medium">{label}</th>
                        <th className={head}>New leads</th>
                        <th className={head}>Converted</th>
                        <th className={head}>Conversion rate</th>
                        {showRevenue && <th className={head}>Deals won</th>}
                        {showRevenue && <th className={head}>Revenue won</th>}
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row) => (
                        <tr key={row.key} className="border-b border-line-light text-muted tabular-nums last:border-b-0">
                            <td className="py-2.5 pr-4 pl-5">
                                <span className="flex items-center gap-2">
                                    {row.color && <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: row.color }} />}
                                    <span className="font-medium whitespace-nowrap text-ink">{row.name}</span>
                                </span>
                            </td>
                            <td className="py-2.5 pr-5 text-right">{row.count}</td>
                            <td className="py-2.5 pr-5 text-right">{row.converted}</td>
                            <td className="py-2.5 pr-5 text-right">{row.count === 0 ? <span className="text-light">—</span> : `${percent(row.converted, row.count)}%`}</td>
                            {showRevenue && <td className="py-2.5 pr-5 text-right">{row.wonCount}</td>}
                            {showRevenue && (
                                <td className="py-2.5 pr-5 text-right">
                                    <span className="font-medium text-ink">{formatMoney(row.revenue)}</span>
                                    {/* a thin bar: its share of the best row's revenue */}
                                    <span className="mt-1 ml-auto block h-1 w-24 rounded-full bg-accent-soft">
                                        <span className="block h-full rounded-full bg-accent" style={{ width: `${(row.revenue / topRevenue) * 100}%` }} />
                                    </span>
                                </td>
                            )}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

// Why deals (and leads) were lost this period, most common first. Someone who sees both can switch.
function LostReasonsCard({ deals, leads, period, className }: { deals?: LostReason[]; leads?: LostReason[]; period: string; className: string }) {
    const [showing, setShowing] = useState<"deals" | "leads">(deals ? "deals" : "leads");
    const reasons = (showing === "deals" ? deals : leads) ?? [];
    const total = reasons.reduce((sum, row) => sum + row.count, 0);
    const rows =
        reasons.length > 6 ? [...reasons.slice(0, 5), { reason: "Everything else", count: reasons.slice(5).reduce((sum, row) => sum + row.count, 0) }] : reasons;
    const largest = Math.max(...rows.map((row) => row.count), 1);

    return (
        <Card
            title="Why we lose"
            icon={IconThumbDown}
            tone="rose"
            className={className}
            action={
                deals &&
                leads && (
                    <div role="radiogroup" aria-label="Lost" className="-mt-1 flex rounded-lg bg-fill p-0.5">
                        {(["deals", "leads"] as const).map((key) => (
                            <button
                                key={key}
                                type="button"
                                role="radio"
                                aria-checked={showing === key}
                                onClick={() => setShowing(key)}
                                className={`h-6 rounded-md px-2 text-sm font-medium capitalize transition-colors ${
                                    showing === key ? "bg-surface text-ink shadow-[0_1px_2px_rgb(0_0_0/0.08)]" : "text-muted hover:text-ink"
                                }`}
                            >
                                {key}
                            </button>
                        ))}
                    </div>
                )
            }
        >
            {rows.length === 0 ? (
                <Empty icon>Nothing lost in the last {period}.</Empty>
            ) : (
                <ul className="flex flex-col gap-3.5">
                    {rows.map((row) => (
                        <BarRow
                            key={row.reason}
                            name={row.reason}
                            color={null}
                            share={row.count / largest}
                            figure={
                                <>
                                    <span className="font-medium text-ink">{row.count}</span>
                                    <span className="inline-block w-10 text-faint">{percent(row.count, total)}%</span>
                                </>
                            }
                        />
                    ))}
                </ul>
            )}
        </Card>
    );
}

function TasksCard({ tasks }: { tasks: Dashboard["tasks"] }) {
    const extra = tasks.overdue + tasks.dueToday - tasks.items.length;
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    return (
        <Card title="My tasks" icon={IconListCheck} tone="teal" action={<CardLink href="/tasks">All tasks</CardLink>}>
            {tasks.items.length === 0 ? (
                <Empty icon>You&apos;re all caught up. Nothing is overdue or due today.</Empty>
            ) : (
                <>
                    <p className="-mt-1 mb-2 flex gap-2 text-sm">
                        {tasks.overdue > 0 && <span className="rounded-full bg-danger-soft px-2 font-medium text-danger">{tasks.overdue} overdue</span>}
                        {tasks.dueToday > 0 && <span className="rounded-full bg-app px-2 font-medium text-muted">{tasks.dueToday} due today</span>}
                    </p>
                    <ul className="-mx-2 flex flex-col">
                        {tasks.items.map((task) => {
                            const overdue = new Date(task.dueDate) < today;
                            return (
                                <li key={task.id}>
                                    <Link href={`/tasks?open=${task.id}`} className="flex h-10 items-center gap-3 rounded-lg px-2 hover:bg-paper">
                                        <IconCircle size={16} className="shrink-0 text-light" />
                                        <span className="min-w-0 flex-1 truncate text-ink">{task.title}</span>
                                        <span className={`shrink-0 text-sm ${overdue ? "text-danger" : "text-muted"}`}>
                                            {overdue ? formatDay(task.dueDate).replace(/, \d{4}$/, "") : "Today"}
                                        </span>
                                        <PriorityBadge priority={task.priority} />
                                    </Link>
                                </li>
                            );
                        })}
                    </ul>
                    {extra > 0 && <p className="mt-2 text-sm text-faint">and {extra} more</p>}
                </>
            )}
        </Card>
    );
}

function ActivitiesCard({ activities }: { activities: Dashboard["activities"] }) {
    return (
        <Card title="Coming up" icon={IconCalendarEvent} tone="violet" action={<CardLink href="/activities">All activities</CardLink>}>
            {activities.length === 0 ? (
                <Empty icon>No calls or meetings in the next 7 days.</Empty>
            ) : (
                <ul className="-mx-2 flex flex-col">
                    {activities.map((activity) => {
                        const at = new Date(activity.scheduledAt);
                        const { label, icon: TypeIcon } = ACTIVITY_TYPES.find((item) => item.value === activity.type)!;
                        return (
                            <li key={activity.id}>
                                <Link href={`/activities?open=${activity.id}`} className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-paper">
                                    <DateLeaf top={at.toLocaleDateString("en-US", { weekday: "short" })} bottom={String(at.getDate())} />
                                    <span className="min-w-0 flex-1">
                                        <span className="block truncate font-medium text-ink">{activity.title}</span>
                                        <span className="flex items-center gap-1 text-sm text-faint">
                                            <TypeIcon size={13} className="shrink-0" />
                                            {label} · {at.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                                            {activity.durationMinutes ? ` · ${durationLabel(activity.durationMinutes)}` : ""}
                                        </span>
                                    </span>
                                </Link>
                            </li>
                        );
                    })}
                </ul>
            )}
        </Card>
    );
}

// --- Building blocks -------------------------------------------------------------------

function Card({
    title,
    description,
    icon: Icon,
    tone,
    action,
    className = "",
    children,
}: {
    title: string;
    description?: string;
    icon: Icon;
    tone: Tone;
    action?: ReactNode;
    className?: string;
    children: ReactNode;
}) {
    return (
        <section data-card className={`flex min-w-0 flex-col rounded-xl border border-line bg-surface p-5 shadow-[0_1px_2px_rgb(0_0_0/0.04)] ${className}`}>
            <header className="mb-4 flex items-start gap-2.5">
                <span className={`flex size-7 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset ${TONES[tone]}`}>
                    <Icon size={15} stroke={2} />
                </span>
                <div className="min-w-0 flex-1">
                    <h3 className="font-display text-[14px] leading-7 font-medium text-ink">{title}</h3>
                    {description && <p className="-mt-0.5 text-sm text-faint">{description}</p>}
                </div>
                {action && <div className="pt-1.5">{action}</div>}
            </header>
            {children}
        </section>
    );
}

// A card with one big number
function StatTile({ icon, tone, label, value, children }: { icon: Icon; tone: Tone; label: string; value: ReactNode; children: ReactNode }) {
    return (
        <Card title={label} icon={icon} tone={tone}>
            <p className="font-display text-[26px] leading-8 font-semibold tracking-tight text-ink tabular-nums">{value}</p>
            <div className="mt-1.5">{children}</div>
        </Card>
    );
}

// "↗ 24%" in green or "↘ 8%" in red, then what it's compared with. A rate changes in
// percentage points ("↗ 5 pts"), an amount in percent of what it was.
function Change({ current, previous, points = false, against }: { current: number; previous: number; points?: boolean; against: string }) {
    const diff = points ? current - previous : previous === 0 ? null : Math.round(((current - previous) / previous) * 100);

    let badge: ReactNode = <span className="font-medium text-muted">No change</span>;
    if (diff === null && current > 0) {
        badge = <Badge up>New</Badge>;
    } else if (diff) {
        badge = (
            <Badge up={diff > 0}>
                {Math.abs(diff)}
                {points ? " pts" : "%"}
            </Badge>
        );
    }

    return (
        <p className="flex flex-wrap items-center gap-1.5 text-sm text-faint">
            {badge}
            {against}
        </p>
    );
}

function Badge({ up, children }: { up: boolean; children: ReactNode }) {
    const Arrow = up ? IconArrowUpRight : IconArrowDownRight;

    return (
        <span
            className={`inline-flex h-5 items-center gap-0.5 rounded-full pr-1.5 pl-1 font-medium ${
                up ? "bg-[#e4f4ea] text-[#218358]" : "bg-danger-soft text-danger"
            }`}
        >
            <Arrow size={13} stroke={2.25} />
            {children}
        </span>
    );
}

// Counts up to the number when it first shows, and from the old to the new one when a filter changes
function CountUp({ value, format, className }: { value: number; format: (value: number) => string; className?: string }) {
    const ref = useRef<HTMLSpanElement>(null);
    const shown = useRef(0);

    useLayoutEffect(() => {
        // writes go into React's own text node, so React can still update it afterwards
        const text = ref.current?.firstChild;
        if (!text || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
            shown.current = value;
            return;
        }

        // start from where the number last was (0 the first time), before the page paints
        const counter = { n: shown.current };
        text.nodeValue = format(Math.round(counter.n));

        const tween = gsap.to(counter, {
            n: value,
            duration: 0.9,
            ease: "power3.out",
            onUpdate: () => {
                shown.current = counter.n;
                text.nodeValue = format(Math.round(counter.n));
            },
        });
        return () => {
            tween.kill();
        };
    }, [value, format]);

    return (
        <span ref={ref} className={className}>
            {format(value)}
        </span>
    );
}

// Name on the left (with its own colour as a dot), a thin blue bar, the figure on the right
function BarRow({ name, color, share, figure }: { name: string; color: string | null; share: number; figure: ReactNode }) {
    return (
        <li className="grid grid-cols-[minmax(0,8.5rem)_1fr_auto] items-center gap-3">
            <span className="flex min-w-0 items-center gap-2">
                <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: color ?? "#d6d6d6" }} />
                <span className="truncate text-muted">{name}</span>
            </span>
            <span className="h-2.5 min-w-0">
                {share > 0 && (
                    <span
                        className="block h-full min-w-1 rounded-r-sm bg-accent transition-[width] duration-700 ease-out"
                        style={{ width: `${share * 100}%` }}
                    />
                )}
            </span>
            <span className="text-right whitespace-nowrap tabular-nums">{figure}</span>
        </li>
    );
}

// A little calendar leaf: month or weekday over the day
function DateLeaf({ top, bottom }: { top: string; bottom: string }) {
    return (
        <span className="flex w-10 shrink-0 flex-col items-center rounded-lg border border-line bg-surface py-0.5 leading-tight">
            <span className="text-[10px] font-semibold text-accent uppercase">{top}</span>
            <span className="text-[15px] font-semibold text-ink">{bottom}</span>
        </span>
    );
}

function CardLink({ href, children }: { href: string; children: ReactNode }) {
    return (
        <Link href={href} className="group flex items-center gap-1 text-sm font-medium whitespace-nowrap text-muted hover:text-ink">
            {children}
            <IconArrowRight size={13} className="transition-transform group-hover:translate-x-0.5" />
        </Link>
    );
}

function Empty({ icon = false, children }: { icon?: boolean; children: ReactNode }) {
    return (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 py-6 text-center text-faint">
            {icon && <IconCircleCheck size={22} className="text-[#218358]" />}
            <p>{children}</p>
        </div>
    );
}

// The page's shape in grey while the first load runs
function DashboardSkeleton() {
    const card = "rounded-xl border border-line bg-surface p-5";

    return (
        <div aria-label="Loading dashboard" className="grid gap-4 lg:grid-cols-3">
            <div className="grid gap-4 sm:grid-cols-2 lg:col-span-3 xl:grid-cols-4">
                {[0, 1, 2, 3].map((index) => (
                    <div key={index} className={card}>
                        <Skeleton className="h-4 w-24" delay={index * 0.05} />
                        <Skeleton className="mt-4 h-7 w-32" delay={index * 0.05 + 0.05} />
                    </div>
                ))}
            </div>
            <div className={`${card} lg:col-span-2`}>
                <Skeleton className="h-4 w-28" />
                <Skeleton className="mt-5 h-11 w-56" delay={0.05} />
                <Skeleton className="mt-8 h-44 w-full" delay={0.1} />
            </div>
            <div className={card}>
                <Skeleton className="h-4 w-28" />
                {[0, 1, 2, 3].map((index) => (
                    <Skeleton key={index} className="mt-5 h-8 w-full" delay={index * 0.05} />
                ))}
            </div>
        </div>
    );
}
