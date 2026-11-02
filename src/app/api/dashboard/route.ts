import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/generated/prisma/client";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { dealScope, hasPermission, leadScope, type CurrentUser } from "@/lib/auth/requirePermission";
import { handleRouteError, validationError } from "@/lib/api/http";
import { searchParamsToObject } from "@/lib/validations/common";
import { startOfToday } from "@/lib/tasks";
import { bucketIndex, dashboardPeriod, dashboardQuerySchema } from "@/lib/dashboard";

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

    const [won, previousWon, lost, previousLost, openStages, openDeals] = await Promise.all([
        prisma.deal.findMany({
            where: { ...where, pipelineStage: { isWon: true }, closedAt: { gte: start, lt: end } },
            select: { amount: true, closedAt: true, createdAt: true },
        }),
        prisma.deal.findMany({
            where: { ...where, pipelineStage: { isWon: true }, closedAt: { gte: previousStart, lt: start } },
            select: { amount: true, closedAt: true },
        }),
        prisma.deal.count({ where: { ...where, pipelineStage: { isLost: true }, closedAt: { gte: start, lt: end } } }),
        prisma.deal.count({ where: { ...where, pipelineStage: { isLost: true }, closedAt: { gte: previousStart, lt: start } } }),
        prisma.pipelineStage.findMany({
            where: { organizationId: user.organizationId, ...isOpen },
            orderBy: [{ order: "asc" }, { id: "asc" }],
            select: { id: true, name: true, color: true },
        }),
        // ponytail: every open deal is loaded to weight it by its probability; switch to a
        // SUM(amount * probability) query if an org ever has tens of thousands open
        prisma.deal.findMany({
            where: { ...where, pipelineStage: isOpen },
            select: { id: true, title: true, amount: true, probability: true, expectedCloseDate: true, pipelineStageId: true },
        }),
    ]);

    const wonValue = won.reduce((sum, deal) => sum + Number(deal.amount), 0);
    const daysToClose = won.map((deal) => (deal.closedAt!.getTime() - deal.createdAt.getTime()) / DAY);

    const trend = perBucket(buckets, won, (deal) => deal.closedAt!, (deal) => Number(deal.amount));
    const previousTrend = perBucket(previousBuckets, previousWon, (deal) => deal.closedAt!, (deal) => Number(deal.amount));

    // every open stage in board order, including the empty ones
    const stages = openStages.map((stage) => {
        const inStage = openDeals.filter((deal) => deal.pipelineStageId === stage.id);
        return { ...stage, count: inStage.length, value: inStage.reduce((sum, deal) => sum + Number(deal.amount), 0) };
    });

    // open deals expected to close in the next 30 days, soonest first
    const in30Days = new Date(today.getTime() + 30 * DAY);
    const closingSoon = openDeals
        .filter((deal) => deal.expectedCloseDate && deal.expectedCloseDate >= today && deal.expectedCloseDate < in30Days)
        .sort((a, b) => a.expectedCloseDate!.getTime() - b.expectedCloseDate!.getTime());

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
        },
        lost: { count: lost, previousCount: previousLost },
        open: {
            value: stages.reduce((sum, stage) => sum + stage.value, 0),
            count: openDeals.length,
            // what the open deals are worth if each closes as likely as its probability says
            weighted: openDeals.reduce((sum, deal) => sum + (Number(deal.amount) * deal.probability) / 100, 0),
            stages,
        },
        closing: {
            total: closingSoon.length,
            value: closingSoon.reduce((sum, deal) => sum + Number(deal.amount), 0),
            pastDue: openDeals.filter((deal) => deal.expectedCloseDate && deal.expectedCloseDate < today).length,
            items: closingSoon.slice(0, 5).map((deal) => ({
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
    const [leads, previousCreated, previousConverted, stages, sources] = await Promise.all([
        // the period's leads, counted three ways below (per day, per stage, per source)
        prisma.lead.findMany({
            where: { ...where, createdAt: { gte: start, lt: end } },
            select: { createdAt: true, stageId: true, sourceId: true },
        }),
        prisma.lead.count({ where: { ...where, createdAt: { gte: previousStart, lt: start } } }),
        prisma.lead.count({ where: { ...where, createdAt: { gte: previousStart, lt: start }, stage: { isConverted: true } } }),
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

    const convertedStages = new Set(stages.filter((stage) => stage.isConverted).map((stage) => stage.id));
    const perDay = perBucket(buckets, leads, (lead) => lead.createdAt, () => 1);

    // leads without a source get their own row; sources nobody used this period are left out
    const sourceRows = [...sources, { id: null, name: "No source", color: null }]
        .map((source) => ({ ...source, count: leads.filter((lead) => lead.sourceId === source.id).length }))
        .filter((source) => source.count > 0)
        .sort((a, b) => b.count - a.count);

    return {
        created: leads.length,
        previousCreated,
        converted: leads.filter((lead) => convertedStages.has(lead.stageId)).length,
        previousConverted,
        trend: buckets.map((bucket, index) => ({ start: bucket.toISOString(), value: perDay[index] })),
        // where this period's leads are now, stage by stage in board order
        stages: stages.map((stage) => ({ ...stage, count: leads.filter((lead) => lead.stageId === stage.id).length })),
        sources: sourceRows,
    };
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
        // tasks that were due this period and got done, and calls/meetings held this period
        prisma.task.groupBy({ by: ["assignedToId"], where: { ...org, status: "COMPLETED", dueDate: inPeriod }, _count: { _all: true } }),
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
