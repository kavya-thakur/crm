import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { hasPermission } from "@/lib/auth/requirePermission";
import { handleRouteError, validationError } from "@/lib/api/http";
import { startOfToday } from "@/lib/work/tasks";

const DAY = 24 * 60 * 60 * 1000;
// rows per card; the rest are a count and a link
const SHOWN = 5;

// The browser's own midnight, so "today" is the person's today, not the server's
const querySchema = z.object({ dayStart: z.coerce.date().optional() });

const linked = {
    lead: { select: { id: true, name: true } },
    deal: { select: { id: true, title: true } },
    contact: { select: { id: true, name: true } },
} as const;

const taskSelect = { id: true, title: true, priority: true, dueDate: true, ...linked } as const;

/**
 * My day: everything the signed-in person should act on today, in one request. Only their own
 * work: tasks assigned to them, calls and meetings they run or are invited to, their leads nobody
 * has contacted yet, and their deals due to close this week. Every list is its top few + a total.
 */
export async function GET(req: NextRequest) {
    try {
        const user = await getCurrentUser();
        if (!user) throw new Error("UNAUTHORIZED");

        const query = querySchema.safeParse({ dayStart: req.nextUrl.searchParams.get("dayStart") ?? undefined });
        if (!query.success) return validationError(query.error);

        const dayStart = query.data.dayStart ?? startOfToday();
        const dayEnd = new Date(dayStart.getTime() + DAY);
        // a task's due day is stored as midnight UTC (see startOfToday)
        const today = startOfToday();
        const org = { organizationId: user.organizationId };
        const myOpenTasks = { ...org, assignedToId: user.id, status: { not: "COMPLETED" as const } };

        // "Waiting for first contact": my leads still in the first open stage (New) with no next
        // step planned. One with an open task or a booked call is already in hand: it shows up
        // under its task or call on the right day, so a pile of bulk-assigned leads can't flood the page
        const firstStage = hasPermission(user, "lead:read")
            ? await prisma.leadStage.findFirst({ where: { ...org, isConverted: false, isLost: false }, orderBy: { order: "asc" }, select: { id: true, name: true } })
            : null;
        const waiting = firstStage && {
            ...org,
            assignedToId: user.id,
            stageId: firstStage.id,
            tasks: { none: { status: { not: "COMPLETED" as const } } },
            scheduledActivities: { none: { status: "SCHEDULED" as const } },
        };

        const mine = { OR: [{ assignedToId: user.id }, { attendees: { some: { id: user.id } } }] };
        const where = {
            overdueTasks: { ...myOpenTasks, dueDate: { lt: today } },
            todayTasks: { ...myOpenTasks, dueDate: today },
            // today's calls and meetings I run or am invited to, done or not yet
            activities: { ...org, ...mine, status: "SCHEDULED" as const, scheduledAt: { gte: dayStart, lt: dayEnd } },
            // earlier ones never marked done
            missed: { ...org, ...mine, status: "SCHEDULED" as const, scheduledAt: { lt: dayStart } },
            // open deals due to close within a week, including ones already past their date
            closingDeals: { ...org, assignedToId: user.id, closedAt: null, expectedCloseDate: { lt: new Date(dayStart.getTime() + 7 * DAY) } },
        };
        const seesDeals = hasPermission(user, "deal:read");

        // Each card shows its first few and a total: someone with 1,000 overdue tasks gets the 5
        // that matter most and "+995 more", never a page of 1,000 rows
        const [overdueTasks, overdueTotal, todayTasks, todayTotal, activities, activityTotal, missed, newLeads, newLeadTotal, closingDeals, closingTotal] =
            await Promise.all([
                // the most important first, then the longest waiting
                prisma.task.findMany({ where: where.overdueTasks, orderBy: [{ priority: "desc" }, { dueDate: "asc" }], take: SHOWN, select: taskSelect }),
                prisma.task.count({ where: where.overdueTasks }),
                prisma.task.findMany({ where: where.todayTasks, orderBy: [{ priority: "desc" }, { id: "asc" }], take: SHOWN, select: taskSelect }),
                prisma.task.count({ where: where.todayTasks }),
                prisma.scheduledActivity.findMany({
                    where: where.activities,
                    orderBy: { scheduledAt: "asc" },
                    take: SHOWN,
                    select: { id: true, title: true, type: true, scheduledAt: true, durationMinutes: true, ...linked },
                }),
                prisma.scheduledActivity.count({ where: where.activities }),
                prisma.scheduledActivity.count({ where: where.missed }),
                // the freshest few: a lead that came in an hour ago is the hottest
                waiting
                    ? prisma.lead.findMany({
                          where: waiting,
                          orderBy: { createdAt: "desc" },
                          take: SHOWN,
                          select: { id: true, name: true, phone: true, companyName: true, createdAt: true, source: { select: { name: true } } },
                      })
                    : null,
                waiting ? prisma.lead.count({ where: waiting }) : 0,
                seesDeals
                    ? prisma.deal.findMany({
                          where: where.closingDeals,
                          orderBy: { expectedCloseDate: "asc" },
                          take: SHOWN,
                          select: { id: true, title: true, amount: true, expectedCloseDate: true, pipelineStage: { select: { name: true, color: true } } },
                      })
                    : null,
                seesDeals ? prisma.deal.count({ where: where.closingDeals }) : 0,
            ]);

        return NextResponse.json({
            ok: true,
            data: {
                overdueTasks: { total: overdueTotal, items: overdueTasks },
                todayTasks: { total: todayTotal, items: todayTasks },
                activities: { total: activityTotal, items: activities, missed },
                newLeads: newLeads && { stage: firstStage!, total: newLeadTotal, items: newLeads },
                closingDeals: closingDeals && { total: closingTotal, items: closingDeals.map((deal) => ({ ...deal, amount: Number(deal.amount) })) },
            },
        });
    } catch (error) {
        return handleRouteError(error, "Get my day");
    }
}
