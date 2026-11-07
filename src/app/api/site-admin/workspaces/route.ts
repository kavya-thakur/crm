import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db/prisma";
import { handleRouteError, validationError } from "@/lib/api/http";
import { requireSiteAdmin } from "@/lib/auth/siteAdmin";

const PAGE_SIZE = 50;

const querySchema = z.object({
    search: z.string().trim().max(100).optional(),
    page: z.coerce.number().int().min(1).max(10_000).default(1),
});

// Every workspace (company) signed up, newest first: its owner, and how many people, leads and deals
export async function GET(req: NextRequest) {
    try {
        await requireSiteAdmin();

        const params = req.nextUrl.searchParams;
        const query = querySchema.safeParse({ search: params.get("search") || undefined, page: params.get("page") ?? undefined });
        if (!query.success) return validationError(query.error);
        const { search, page } = query.data;

        const where = search ? { name: { contains: search, mode: "insensitive" as const } } : {};
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
                    users: { where: { isOwner: true }, select: { id: true, name: true, email: true }, take: 1 },
                    _count: { select: { users: true, leads: true, deals: true } },
                },
            }),
            prisma.organization.count({ where }),
        ]);

        const data = workspaces.map(({ users, _count, ...workspace }) => ({ ...workspace, owner: users[0] ?? null, counts: _count }));
        return NextResponse.json({ ok: true, data, total, pageSize: PAGE_SIZE });
    } catch (error) {
        return handleRouteError(error, "Site admin workspaces");
    }
}
