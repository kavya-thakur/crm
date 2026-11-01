import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/db/prisma";
import { dealScope, requirePermission } from "@/lib/auth/requirePermission";
import {
    idParamSchema,
    paginationSchema,
    searchParamsToObject,
} from "@/lib/validations/common";
import { handleRouteError, validationError } from "@/lib/api/http";

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const user = await requirePermission("deal:read");

        const id = idParamSchema.safeParse((await params).id);

        if (!id.success) {
            return validationError(id.error);
        }

        const query = paginationSchema.safeParse(
            searchParamsToObject(req.nextUrl.searchParams)
        );

        if (!query.success) {
            return validationError(query.error);
        }

        const { page, limit } = query.data;
        const dealId = id.data;
        const skip = (page - 1) * limit;

        // Make sure the deal is one this user can see
        const deal = await prisma.deal.findFirst({
            where: {
                id: dealId,
                ...dealScope(user),
            },
            select: {
                id: true,
            },
        });

        if (!deal) {
            return NextResponse.json(
                {
                    ok: false,
                    message: "Deal not found",
                },
                { status: 404 }
            );
        }

        const [timeline, total] = await Promise.all([
            prisma.dealTimeline.findMany({
                where: {
                    dealId: deal.id,
                },
                include: {
                    user: {
                        select: {
                            id: true,
                            name: true,
                            email: true,
                        },
                    },
                },
                // id as tie-breaker so entries created in the same ms keep a stable order
                orderBy: [{ createdAt: "desc" }, { id: "desc" }],
                skip,
                take: limit,
            }),

            prisma.dealTimeline.count({
                where: {
                    dealId: deal.id,
                },
            }),
        ]);

        return NextResponse.json({
            ok: true,
            data: timeline,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        });
    } catch (error) {
        return handleRouteError(error, "Get deal timeline");
    }
}
