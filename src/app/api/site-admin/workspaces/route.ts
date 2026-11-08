import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db/prisma";
import { handleRouteError, validationError } from "@/lib/api/http";
import { requireSiteAdmin } from "@/lib/auth/siteAdmin";
import { accessOf } from "@/lib/billing/plans";

const PAGE_SIZE = 50;

const querySchema = z.object({
    search: z.string().trim().max(100).optional(),
    // only the ones whose owner asked for Pro, waiting to be switched on
    requested: z.literal("1").optional(),
    page: z.coerce.number().int().min(1).max(10_000).default(1),
});

// Every workspace (company) signed up, newest first: its owner, and how many people, leads and deals
export async function GET(req: NextRequest) {
    try {
        await requireSiteAdmin();

        const params = req.nextUrl.searchParams;
        const query = querySchema.safeParse({ search: params.get("search") || undefined, requested: params.get("requested") || undefined, page: params.get("page") ?? undefined });
        if (!query.success) return validationError(query.error);
        const { search, requested, page } = query.data;

        const where = {
            ...(search && { name: { contains: search, mode: "insensitive" as const } }),
            ...(requested && { planRequest: { not: null } }),
        };
        const [workspaces, total] = await Promise.all([
            prisma.organization.findMany({
                where,
                orderBy: [{ createdAt: "desc" }, { id: "desc" }],
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
        // how many owners are waiting for Pro, for the tab's badge
        const waiting = await prisma.organization.count({ where: { planRequest: { not: null } } });
        return NextResponse.json({ ok: true, data, total, pageSize: PAGE_SIZE, waiting });
    } catch (error) {
        return handleRouteError(error, "Site admin workspaces");
    }
}
