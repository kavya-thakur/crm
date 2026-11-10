import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/generated/prisma/client";
import { handleRouteError, validationError } from "@/lib/api/http";
import { requireSiteAdmin } from "@/lib/auth/siteAdmin";
import { accessOf } from "@/lib/billing/plans";

const PAGE_SIZE = 50;

const querySchema = z.object({
    // the company, or its owner's name or email
    search: z.string().trim().max(100).optional(),
    plan: z.enum(["trial", "pro", "ended"]).optional(),
    sort: z.enum(["newest", "oldest", "people", "leads"]).default("newest"),
    page: z.coerce.number().int().min(1).max(10_000).default(1),
});

const ORDER: Record<string, Prisma.OrganizationOrderByWithRelationInput[]> = {
    newest: [{ createdAt: "desc" }, { id: "desc" }],
    oldest: [{ createdAt: "asc" }, { id: "asc" }],
    people: [{ users: { _count: "desc" } }, { id: "desc" }],
    leads: [{ leads: { _count: "desc" } }, { id: "desc" }],
};

// Where each plan state stands right now, the same rule as accessOf (src/lib/billing/plans.ts)
function planWhere(plan: "trial" | "pro" | "ended", now: Date): Prisma.OrganizationWhereInput {
    if (plan === "pro") return { plan: "PRO", paidUntil: { gt: now } };
    if (plan === "trial") return { plan: { not: "PRO" }, trialEndsAt: { gt: now } };
    return { OR: [{ plan: "PRO", OR: [{ paidUntil: null }, { paidUntil: { lte: now } }] }, { plan: { not: "PRO" }, trialEndsAt: { lte: now } }] };
}

// Every workspace (company) signed up: its owner, plan, and how many people, leads and deals
export async function GET(req: NextRequest) {
    try {
        await requireSiteAdmin();

        const params = req.nextUrl.searchParams;
        const query = querySchema.safeParse({
            search: params.get("search") || undefined,
            plan: params.get("plan") || undefined,
            sort: params.get("sort") || undefined,
            page: params.get("page") ?? undefined,
        });
        if (!query.success) return validationError(query.error);
        const { search, plan, sort, page } = query.data;

        const contains = { contains: search, mode: "insensitive" as const };
        const where: Prisma.OrganizationWhereInput = {
            AND: [
                search ? { OR: [{ name: contains }, { users: { some: { isOwner: true, OR: [{ name: contains }, { email: contains }] } } }] } : {},
                plan ? planWhere(plan, new Date()) : {},
            ],
        };
        const [workspaces, total] = await Promise.all([
            prisma.organization.findMany({
                where,
                orderBy: ORDER[sort],
                skip: (page - 1) * PAGE_SIZE,
                take: PAGE_SIZE,
                select: {
                    id: true,
                    name: true,
                    createdAt: true,
                    plan: true,
                    trialEndsAt: true,
                    paidUntil: true,
                    billingCycle: true,
                    planRequest: true,
                    planRequestedAt: true,
                    users: { where: { isOwner: true }, select: { id: true, name: true, email: true }, take: 1 },
                    _count: { select: { users: true, leads: true, deals: true } },
                },
            }),
            prisma.organization.count({ where }),
        ]);

        const data = workspaces.map(({ users, _count, ...workspace }) => {
            const { state, endsAt, daysLeft } = accessOf(workspace);
            return { ...workspace, owner: users[0] ?? null, counts: _count, access: { state, endsAt, daysLeft } };
        });
        return NextResponse.json({ ok: true, data, total, pageSize: PAGE_SIZE });
    } catch (error) {
        return handleRouteError(error, "Site admin workspaces");
    }
}
