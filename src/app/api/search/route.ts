import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { activityScope, contactScope, dealScope, hasPermission, leadScope, taskScope } from "@/lib/auth/requirePermission";
import { handleRouteError, validationError } from "@/lib/api/http";
import { escapeLike, searchParamsToObject } from "@/lib/validations/common";

const SEARCH_KINDS = ["lead", "deal", "contact", "task", "activity"] as const;

const searchQuerySchema = z.object({
    q: z.string().trim().min(1, "Type something to search for").max(100),
    // only one kind, when the menu's filter is set
    type: z.enum(SEARCH_KINDS).optional(),
});

// Best matches first: the name itself, then names starting with it, then a word in the
// name starting with it ("acme" finds "The Acme Co"), then anything that only contains it
function rank(text: string | null | undefined, q: string) {
    const value = (text ?? "").toLowerCase();
    if (value === q) return 0;
    if (value.startsWith(q)) return 1;
    if (value.includes(` ${q}`)) return 2;
    return 3;
}

function best<T>(rows: T[], q: string, labelOf: (row: T) => string, count: number) {
    return rows
        .map((row, index) => ({ row, score: rank(labelOf(row), q), index }))
        .sort((a, b) => a.score - b.score || a.index - b.index)
        .slice(0, count)
        .map(({ row }) => row);
}

// The ⌘K search: one request across leads, deals, contacts, tasks and calls/meetings,
// each limited to what this person can see. The trigram indexes keep "contains" fast.
export async function GET(req: NextRequest) {
    try {
        const user = await getCurrentUser();

        if (!user) {
            throw new Error("UNAUTHORIZED");
        }

        const query = searchQuerySchema.safeParse(searchParamsToObject(req.nextUrl.searchParams));

        if (!query.success) {
            return validationError(query.error);
        }

        const { type } = query.data;
        const q = query.data.q.toLowerCase();
        const contains = { contains: escapeLike(query.data.q), mode: "insensitive" as const };
        // the best 5 of each kind, or 10 when only one kind is asked for
        const count = type ? 10 : 5;
        // a few more than shown, so ranking can pick the best of them
        const take = count * 3;
        const wants = (kind: (typeof SEARCH_KINDS)[number]) => type === undefined || type === kind;
        const owner = { assignedTo: { select: { name: true } } };
        const recentFirst = { updatedAt: "desc" as const };

        const [leads, deals, contacts, tasks, activities] = await Promise.all([
            hasPermission(user, "lead:read") && wants("lead")
                ? prisma.lead.findMany({
                      where: { ...leadScope(user), OR: [{ name: contains }, { companyName: contains }, { email: contains }, { phone: contains }] },
                      select: {
                          id: true,
                          name: true,
                          companyName: true,
                          email: true,
                          phone: true,
                          createdAt: true,
                          stage: { select: { name: true, color: true } },
                          source: { select: { name: true, color: true } },
                          ...owner,
                      },
                      orderBy: recentFirst,
                      take,
                  })
                : [],
            hasPermission(user, "deal:read") && wants("deal")
                ? prisma.deal.findMany({
                      where: { ...dealScope(user), OR: [{ title: contains }, { lead: { name: contains } }] },
                      select: {
                          id: true,
                          title: true,
                          amount: true,
                          probability: true,
                          expectedCloseDate: true,
                          lead: { select: { name: true } },
                          ...owner,
                          pipelineStage: { select: { name: true, color: true } },
                      },
                      orderBy: recentFirst,
                      take,
                  })
                : [],
            hasPermission(user, "contact:read") && wants("contact")
                ? prisma.contact.findMany({
                      where: { ...contactScope(user), OR: [{ name: contains }, { email: contains }, { phone: contains }, { jobTitle: contains }] },
                      select: { id: true, name: true, email: true, phone: true, jobTitle: true, company: { select: { name: true } }, ...owner },
                      orderBy: recentFirst,
                      take,
                  })
                : [],
            wants("task")
                ? prisma.task.findMany({
                      where: { AND: [taskScope(user)], title: contains },
                      select: {
                          id: true,
                          title: true,
                          status: true,
                          priority: true,
                          dueDate: true,
                          lead: { select: { name: true } },
                          deal: { select: { title: true } },
                          contact: { select: { name: true } },
                          ...owner,
                      },
                      orderBy: recentFirst,
                      take,
                  })
                : [],
            wants("activity")
                ? prisma.scheduledActivity.findMany({
                      where: { AND: [activityScope(user)], title: contains },
                      select: { id: true, title: true, type: true, status: true, scheduledAt: true, durationMinutes: true, ...owner },
                      orderBy: recentFirst,
                      take,
                  })
                : [],
        ]);

        return NextResponse.json({
            ok: true,
            data: {
                leads: best(leads, q, (lead) => lead.name, count),
                deals: best(deals, q, (deal) => deal.title, count).map((deal) => ({ ...deal, amount: Number(deal.amount) })),
                contacts: best(contacts, q, (contact) => contact.name, count),
                tasks: best(tasks, q, (task) => task.title, count),
                activities: best(activities, q, (activity) => activity.title, count),
            },
        });
    } catch (error) {
        return handleRouteError(error, "Search");
    }
}
