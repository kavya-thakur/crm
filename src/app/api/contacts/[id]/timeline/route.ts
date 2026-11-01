import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/db/prisma";
import { contactScope, requirePermission } from "@/lib/auth/requirePermission";
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
        const user = await requirePermission("contact:read");

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
        const contactId = id.data;
        const skip = (page - 1) * limit;

        // Make sure the contact is one this user can see
        const contact = await prisma.contact.findFirst({
            where: {
                id: contactId,
                ...contactScope(user),
            },
            select: {
                id: true,
            },
        });

        if (!contact) {
            return NextResponse.json(
                {
                    ok: false,
                    message: "Contact not found",
                },
                { status: 404 }
            );
        }

        const [timeline, total] = await Promise.all([
            prisma.contactTimeline.findMany({
                where: {
                    contactId: contact.id,
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

            prisma.contactTimeline.count({
                where: {
                    contactId: contact.id,
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
        return handleRouteError(error, "Get contact timeline");
    }
}
