import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/generated/prisma/client";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { dealScope, hasPermission, leadScope, type CurrentUser } from "@/lib/auth/requirePermission";
import { handleRouteError, validationError } from "@/lib/api/http";
import { searchParamsToObject } from "@/lib/validations/common";
import { startOfToday } from "@/lib/work/tasks";
import { bucketIndex, dashboardPeriod, dashboardQuerySchema } from "@/lib/dashboard/periods";

type Period = ReturnType<typeof dashboardPeriod>;

const DAY = 24 * 60 * 60 * 1000;

// Everything the home page shows, in one request. Deal and lead numbers follow the same
// visibility as the lists (deal:all / lead:all see the team, everyone else their own),
// and are left out for someone who can't read deals or leads at all.
export async function GET(req: NextRequest) {
    try {
        const user = await getCurrentUser();

        if (!user) {
            throw new Error("UNAUTHORIZED");
        }

        const query = dashboardQuerySchema.safeParse(searchParamsToObject(req.nextUrl.searchParams));

        if (!query.success) {
            return validationError(query.error);
        }

        const { range, agentId } = query.data;
        const seesTeam = hasPermission(user, "deal:all") || hasPermission(user, "lead:all");

        // picking an agent only makes sense if you can see other people's work
        if (agentId !== undefined && !seesTeam) {
            throw new Error("FORBIDDEN");
        }

        const period = dashboardPeriod(range);
        // AND-ed with the usual scope, so the agent filter can only ever narrow it
        const agent = agentId ? { assignedToId: agentId } : {};

        const [deals, leads, team, tasks, activities] = await Promise.all([
            hasPermission(user, "deal:read") ? dealNumbers({ AND: [dealScope(user), agent] }, user, period) : null,
            hasPermission(user, "lead:read") ? leadNumbers({ AND: [leadScope(user), agent] }, user, period) : null,
            seesTeam ? teamPerformance(user, period) : null,
            myTasks(user),
            myUpcomingActivities(user),
        ]);

        return NextResponse.json({
            ok: true,
            data: {
                range,
                agentId: agentId ?? null,
                scope: seesTeam ? "team" : "mine",
                deals,
                leads,
                team,
                tasks,
                activities,
            },
        });
    } catch (error) {
        return handleRouteError(error, "Load dashboard");
    }
}

// Adds up rows into the period's slices: one total per day / week / month
function perBucket<T>(buckets: Date[], rows: T[], dateOf: (row: T) => Date, valueOf: (row: T) => number) {
    const totals = buckets.map(() => 0);
    for (const row of rows) {
        const index = bucketIndex(buckets, dateOf(row));
        if (index >= 0) totals[index] += valueOf(row);
    }
    return totals;
}

async function dealNumbers(where: Prisma.DealWhereInput, user: CurrentUser, period: Period) {
    const { start, end, previousStart, buckets, previousBuckets } = period;
    const today = startOfToday();
    const isOpen = { isWon: false, isLost: false };

    const open = { ...where, pipelineStage: isOpen };
    // open deals expected to close in the next 30 days
    const closingSoon = { ...open, expectedCloseDate: { gte: today, lt: new Date(today.getTime() + 30 * DAY) } };

    // Totals are added up by Postgres; only the won deals' dates and amounts come back as
    // rows, for the trend lines and the average time to close
    const lostThisPeriod = { ...where, pipelineStage: { isLost: true }, closedAt: { gte: start, lt: end } };

    const [won, previousWon, lost, previousLost, lostByReason, openStages, byStage, byProbability, closing, closingItems, pastDue] = await Promise.all([
        prisma.deal.findMany({
            where: { ...where, pipelineStage: { isWon: true }, closedAt: { gte: start, lt: end } },
            // the source and ad campaign of the lead it came from, for revenue per source and per campaign
            select: { amount: true, closedAt: true, createdAt: true, lead: { select: { sourceId: true, utmCampaign: true } } },
        }),
        prisma.deal.findMany({
            where: { ...where, pipelineStage: { isWon: true }, closedAt: { gte: previousStart, lt: start } },
            select: { amount: true, closedAt: true },
        }),
        prisma.deal.count({ where: lostThisPeriod }),
        prisma.deal.count({ where: { ...where, pipelineStage: { isLost: true }, closedAt: { gte: previousStart, lt: start } } }),
        prisma.deal.groupBy({ by: ["lostReason"], where: lostThisPeriod, _count: { _all: true } }),
        prisma.pipelineStage.findMany({
            where: { organizationId: user.organizationId, ...isOpen },
            orderBy: [{ order: "asc" }, { id: "asc" }],
            select: { id: true, name: true, color: true },
        }),
        prisma.deal.groupBy({ by: ["pipelineStageId"], where: open, _count: { _all: true }, _sum: { amount: true } }),
        // probability is a whole 0-100, so grouping by it is at most 101 rows: enough to
        // weight every open deal without loading any of them
        prisma.deal.groupBy({ by: ["probability"], where: open, _sum: { amount: true } }),
        prisma.deal.aggregate({ where: closingSoon, _count: { _all: true }, _sum: { amount: true } }),
        prisma.deal.findMany({
            where: closingSoon,
            orderBy: [{ expectedCloseDate: "asc" }, { id: "asc" }],
            take: 5,
            select: { id: true, title: true, amount: true, probability: true, expectedCloseDate: true, pipelineStageId: true },
        }),
        prisma.deal.count({ where: { ...open, expectedCloseDate: { lt: today } } }),
    ]);

    const wonValue = won.reduce((sum, deal) => sum + Number(deal.amount), 0);
    const daysToClose = won.map((deal) => (deal.closedAt!.getTime() - deal.createdAt.getTime()) / DAY);

    const trend = perBucket(buckets, won, (deal) => deal.closedAt!, (deal) => Number(deal.amount));
    const previousTrend = perBucket(previousBuckets, previousWon, (deal) => deal.closedAt!, (deal) => Number(deal.amount));

    // revenue won per lead source; deals that didn't come from a lead (or one without a source) count as "no source"
    const wonBySource = new Map<number | null, { value: number; count: number }>();
    for (const deal of won) {
        const sourceId = deal.lead?.sourceId ?? null;
        const row = wonBySource.get(sourceId) ?? { value: 0, count: 0 };
        wonBySource.set(sourceId, { value: row.value + Number(deal.amount), count: row.count + 1 });
    }

    // the same per ad campaign; deals from leads without one aren't counted here
    const wonByCampaign = new Map<string, { value: number; count: number }>();
    for (const deal of won) {
        const campaign = deal.lead?.utmCampaign;
        if (!campaign) continue;
        const row = wonByCampaign.get(campaign) ?? { value: 0, count: 0 };
        wonByCampaign.set(campaign, { value: row.value + Number(deal.amount), count: row.count + 1 });
    }

    // every open stage in board order, including the empty ones
    const stages = openStages.map((stage) => {
        const row = byStage.find((group) => group.pipelineStageId === stage.id);
        return { ...stage, count: row?._count._all ?? 0, value: Number(row?._sum.amount ?? 0) };
    });

    return {
        won: {
            value: wonValue,
            count: won.length,
            previousValue: previousTrend.reduce((sum, value) => sum + value, 0),
            previousCount: previousWon.length,
            averageDeal: won.length ? wonValue / won.length : 0,
            averageDays: daysToClose.length ? Math.round(daysToClose.reduce((sum, days) => sum + days, 0) / daysToClose.length) : null,
            trend: buckets.map((bucket, index) => ({ start: bucket.toISOString(), value: trend[index] })),
            previousTrend,
            bySource: [...wonBySource].map(([sourceId, row]) => ({ sourceId, ...row })),
            byCampaign: [...wonByCampaign].map(([campaign, row]) => ({ campaign, ...row })),
        },
        lost: { count: lost, previousCount: previousLost, reasons: reasonRows(lostByReason) },
        open: {
            value: stages.reduce((sum, stage) => sum + stage.value, 0),
            count: stages.reduce((sum, stage) => sum + stage.count, 0),
            // what the open deals are worth if each closes as likely as its probability says
            weighted: byProbability.reduce((sum, group) => sum + (Number(group._sum.amount ?? 0) * group.probability) / 100, 0),
            stages,
        },
        closing: {
            total: closing._count._all,
            value: Number(closing._sum.amount ?? 0),
            pastDue,
            items: closingItems.map((deal) => ({
                id: deal.id,
                title: deal.title,
                amount: Number(deal.amount),
                probability: deal.probability,
                expectedCloseDate: deal.expectedCloseDate!.toISOString(),
                stage: stages.find((stage) => stage.id === deal.pipelineStageId)!,
            })),
        },
    };
}

async function leadNumbers(where: Prisma.LeadWhereInput, user: CurrentUser, { start, end, previousStart, buckets }: Period) {
    const thisPeriod = { ...where, createdAt: { gte: start, lt: end } };
    const lastPeriod = { ...where, createdAt: { gte: previousStart, lt: start } };

    // counted by Postgres; only each lead's creation time comes back, for the chart
    const [createdAt, byStage, bySource, convertedBySource, byCampaign, convertedByCampaign, lostByReason, converted, previousCreated, previousConverted, stages, sources] = await Promise.all([
        prisma.lead.findMany({ where: thisPeriod, select: { createdAt: true } }),
        prisma.lead.groupBy({ by: ["stageId"], where: thisPeriod, _count: { _all: true } }),
        prisma.lead.groupBy({ by: ["sourceId"], where: thisPeriod, _count: { _all: true } }),
        prisma.lead.groupBy({ by: ["sourceId"], where: { ...thisPeriod, stage: { isConverted: true } }, _count: { _all: true } }),
        prisma.lead.groupBy({ by: ["utmCampaign"], where: { ...thisPeriod, utmCampaign: { not: null } }, _count: { _all: true } }),
        prisma.lead.groupBy({ by: ["utmCampaign"], where: { ...thisPeriod, utmCampaign: { not: null }, stage: { isConverted: true } }, _count: { _all: true } }),
        prisma.lead.groupBy({ by: ["lostReason"], where: { ...thisPeriod, stage: { isLost: true } }, _count: { _all: true } }),
        prisma.lead.count({ where: { ...thisPeriod, stage: { isConverted: true } } }),
        prisma.lead.count({ where: lastPeriod }),
        prisma.lead.count({ where: { ...lastPeriod, stage: { isConverted: true } } }),
        prisma.leadStage.findMany({
            where: { organizationId: user.organizationId },
            orderBy: [{ order: "asc" }, { id: "asc" }],
            select: { id: true, name: true, color: true, isConverted: true, isLost: true },
        }),
        prisma.leadSource.findMany({
            where: { organizationId: user.organizationId },
            select: { id: true, name: true, color: true },
        }),
    ]);

    const perDay = perBucket(buckets, createdAt, (lead) => lead.createdAt, () => 1);

    // every source (leads without one get their own row), biggest first; the page drops the
    // ones that brought neither leads nor revenue this period
    const sourceRows = [...sources, { id: null, name: "No source", color: null }]
        .map((source) => ({
            ...source,
            count: bySource.find((group) => group.sourceId === source.id)?._count._all ?? 0,
            converted: convertedBySource.find((group) => group.sourceId === source.id)?._count._all ?? 0,
        }))
        .sort((a, b) => b.count - a.count);

    // the ad campaigns this period's leads came in from (utm_campaign on a web form), biggest first
    const campaignRows = byCampaign
        .map((group) => ({
            campaign: group.utmCampaign!,
            count: group._count._all,
            converted: convertedByCampaign.find((row) => row.utmCampaign === group.utmCampaign)?._count._all ?? 0,
        }))
        .sort((a, b) => b.count - a.count);

    return {
        created: createdAt.length,
        previousCreated,
        converted,
        previousConverted,
        trend: buckets.map((bucket, index) => ({ start: bucket.toISOString(), value: perDay[index] })),
        // where this period's leads are now, stage by stage in board order
        stages: stages.map((stage) => ({ ...stage, count: byStage.find((group) => group.stageId === stage.id)?._count._all ?? 0 })),
        sources: sourceRows,
        campaigns: campaignRows,
        lostReasons: reasonRows(lostByReason),
    };
}

// "Price too high: 4" rows, most common first; lost before reasons were asked = "Not recorded"
function reasonRows(groups: { lostReason: string | null; _count: { _all: number } }[]) {
    return groups
        .map((group) => ({ reason: group.lostReason ?? "Not recorded", count: group._count._all }))
        .sort((a, b) => b.count - a.count);
}

type Groups = { assignedToId: number | null; _count: { _all: number }; _sum?: { amount: Prisma.Decimal | null } }[];

// One row per person in the organization, so a manager can see who's doing well. Deal
// columns need deal:all and lead columns lead:all; the others come back as null.
async function teamPerformance(user: CurrentUser, { start, end }: Period) {
    const org = { organizationId: user.organizationId };
    const inPeriod = { gte: start, lt: end };
    const seesDeals = hasPermission(user, "deal:all");
    const seesLeads = hasPermission(user, "lead:all");
    const none: Groups = [];

    const [people, won, lost, open, leads, converted, tasksDone, activitiesDone] = await Promise.all([
        prisma.user.findMany({ where: org, select: { id: true, name: true }, orderBy: { name: "asc" } }),
        seesDeals
            ? prisma.deal.groupBy({
                  by: ["assignedToId"],
                  where: { ...org, pipelineStage: { isWon: true }, closedAt: inPeriod },
                  _count: { _all: true },
                  _sum: { amount: true },
              })
            : none,
        seesDeals
            ? prisma.deal.groupBy({ by: ["assignedToId"], where: { ...org, pipelineStage: { isLost: true }, closedAt: inPeriod }, _count: { _all: true } })
            : none,
        seesDeals
            ? prisma.deal.groupBy({
                  by: ["assignedToId"],
                  where: { ...org, pipelineStage: { isWon: false, isLost: false } },
                  _count: { _all: true },
                  _sum: { amount: true },
              })
            : none,
        seesLeads ? prisma.lead.groupBy({ by: ["assignedToId"], where: { ...org, createdAt: inPeriod }, _count: { _all: true } }) : none,
        seesLeads
            ? prisma.lead.groupBy({ by: ["assignedToId"], where: { ...org, createdAt: inPeriod, stage: { isConverted: true } }, _count: { _all: true } })
            : none,
        // tasks finished this period, and calls/meetings held this period
        prisma.task.groupBy({ by: ["assignedToId"], where: { ...org, status: "COMPLETED", completedAt: inPeriod }, _count: { _all: true } }),
        prisma.scheduledActivity.groupBy({ by: ["assignedToId"], where: { ...org, status: "COMPLETED", scheduledAt: inPeriod }, _count: { _all: true } }),
    ]);

    const countOf = (groups: Groups, id: number) => groups.find((group) => group.assignedToId === id)?._count._all ?? 0;
    const sumOf = (groups: Groups, id: number) => Number(groups.find((group) => group.assignedToId === id)?._sum?.amount ?? 0);

    return {
        seesDeals,
        seesLeads,
        people: people.map(({ id, name }) => {
            const wonCount = countOf(won, id);
            const closed = wonCount + countOf(lost, id);
            return {
                id,
                name,
                revenue: seesDeals ? sumOf(won, id) : null,
                won: seesDeals ? wonCount : null,
                // of the deals they closed this period, the share they won; null when none closed
                winRate: seesDeals && closed > 0 ? Math.round((wonCount / closed) * 100) : null,
                openValue: seesDeals ? sumOf(open, id) : null,
                openCount: seesDeals ? countOf(open, id) : null,
                leads: seesLeads ? countOf(leads, id) : null,
                converted: seesLeads ? countOf(converted, id) : null,
                tasksDone: countOf(tasksDone as Groups, id),
                activitiesDone: countOf(activitiesDone as Groups, id),
            };
        }),
    };
}

// My open tasks that need attention: overdue or due today, most urgent first
async function myTasks(user: CurrentUser) {
    const today = startOfToday();
    const mine = { organizationId: user.organizationId, assignedToId: user.id, status: { not: "COMPLETED" as const } };

    const [overdue, dueToday, items] = await Promise.all([
        prisma.task.count({ where: { ...mine, dueDate: { lt: today } } }),
        prisma.task.count({ where: { ...mine, dueDate: today } }),
        prisma.task.findMany({
            where: { ...mine, dueDate: { lte: today } },
            orderBy: [{ dueDate: "asc" }, { priority: "desc" }],
            take: 6,
            select: { id: true, title: true, dueDate: true, priority: true },
        }),
    ]);

    return { overdue, dueToday, items };
}

// Calls and meetings in the next 7 days that I run or am invited to
async function myUpcomingActivities(user: CurrentUser) {
    const now = new Date();

    return prisma.scheduledActivity.findMany({
        where: {
            organizationId: user.organizationId,
            status: "SCHEDULED",
            scheduledAt: { gte: now, lt: new Date(now.getTime() + 7 * DAY) },
            OR: [{ assignedToId: user.id }, { attendees: { some: { id: user.id } } }],
        },
        orderBy: { scheduledAt: "asc" },
        take: 6,
        select: { id: true, title: true, type: true, scheduledAt: true, durationMinutes: true },
    });
}
