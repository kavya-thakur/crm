import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/generated/prisma/client";
import { handleRouteError, validationError } from "@/lib/api/http";
import { idParamSchema } from "@/lib/validations/common";
import { isRootAdmin, requireSiteAdmin, rootEmails } from "@/lib/auth/siteAdmin";

const PAGE_SIZE = 50;

const querySchema = z.object({
    search: z.string().trim().max(100).optional(),
    // one workspace's people (from the Workspaces tab)
    organizationId: idParamSchema.optional(),
    // workspace owners, agents (everyone else in a workspace), or site admins (roots by email included)
    type: z.enum(["owners", "agents", "admins"]).optional(),
    page: z.coerce.number().int().min(1).max(10_000).default(1),
});

// Every user on the website, newest first, 50 a page: by name, email or workspace name
export async function GET(req: NextRequest) {
    try {
        await requireSiteAdmin();

        const params = req.nextUrl.searchParams;
        const query = querySchema.safeParse({
            search: params.get("search") || undefined,
            organizationId: params.get("organizationId") || undefined,
            type: params.get("type") || undefined,
            page: params.get("page") ?? undefined,
        });
        if (!query.success) return validationError(query.error);
        const { search, organizationId, type, page } = query.data;

        const contains = { contains: search, mode: "insensitive" as const };
        const where: Prisma.UserWhereInput = {
            ...(organizationId && { organizationId }),
            ...(type === "owners" && { isOwner: true }),
            ...(type === "agents" && { isOwner: false }),
            ...(type === "admins" && { OR: [{ isSiteAdmin: true }, { email: { in: rootEmails() } }] }),
            ...(search && { AND: [{ OR: [{ name: contains }, { email: contains }, { organization: { name: contains } }] }] }),
        };
        const [users, total] = await Promise.all([
            prisma.user.findMany({
                where,
                orderBy: [{ createdAt: "desc" }, { id: "desc" }],
                skip: (page - 1) * PAGE_SIZE,
                take: PAGE_SIZE,
                select: {
                    id: true,
                    name: true,
                    email: true,
                    createdAt: true,
                    isOwner: true,
                    isSiteAdmin: true,
                    role: { select: { name: true } },
                    organization: { select: { id: true, name: true } },
                },
            }),
            prisma.user.count({ where }),
        ]);

        // roots are site admins by their email; the page shows them as such, and they can't be switched off here
        const data = users.map((user) => ({ ...user, isRootAdmin: isRootAdmin(user) }));
        return NextResponse.json({ ok: true, data, total, pageSize: PAGE_SIZE });
    } catch (error) {
        return handleRouteError(error, "Site admin users");
    }
}
