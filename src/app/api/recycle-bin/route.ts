import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { handleRouteError, validationError } from "@/lib/api/http";
import { BIN_DAYS, BIN_ENTITIES, binWhere, emptyOldBin } from "@/lib/recycleBin";

const PAGE_SIZE = 50;
const DAY = 24 * 60 * 60 * 1000;

const querySchema = z.object({
    entity: z.enum(BIN_ENTITIES).optional(),
    search: z.string().trim().max(100).optional(),
    page: z.coerce.number().int().min(1).max(1000).default(1),
});

// The recycle bin, newest first: what this person may see and restore (see binScope)
export async function GET(req: NextRequest) {
    try {
        const user = await getCurrentUser();
        if (!user) throw new Error("UNAUTHORIZED");

        const params = req.nextUrl.searchParams;
        const query = querySchema.safeParse({ entity: params.get("entity") || undefined, search: params.get("search") || undefined, page: params.get("page") ?? undefined });
        if (!query.success) return validationError(query.error);
        const { entity, search, page } = query.data;

        // anything past its 30 days is gone for good first
        await emptyOldBin(user.organizationId);

        const where = binWhere(user, { entity, search });
        const [items, total] = await Promise.all([
            prisma.deletedRecord.findMany({
                where,
                orderBy: [{ deletedAt: "desc" }, { id: "desc" }],
                skip: (page - 1) * PAGE_SIZE,
                take: PAGE_SIZE,
                // not `data`: the copy can be big, and the list only needs to name it
                select: { id: true, entity: true, recordId: true, name: true, deletedAt: true, deletedBy: { select: { id: true, name: true } } },
            }),
            prisma.deletedRecord.count({ where }),
        ]);

        // how long each has left before it's gone for good
        const now = Date.now();
        const data = items.map((item) => ({ ...item, daysLeft: Math.max(0, BIN_DAYS - Math.floor((now - item.deletedAt.getTime()) / DAY)) }));

        return NextResponse.json({ ok: true, data, total, pageSize: PAGE_SIZE, keepDays: BIN_DAYS });
    } catch (error) {
        return handleRouteError(error, "Get recycle bin");
    }
}
