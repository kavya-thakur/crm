import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/generated/prisma/client";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { createSavedFilterSchema, listSavedFiltersQuerySchema } from "@/lib/validations/savedFilters";
import { handleRouteError, parseBody, validationError } from "@/lib/api/http";

// Saved filters are personal, not an org resource: no permission check beyond
// being signed in, and every query is scoped by userId, not organizationId.

export async function GET(req: NextRequest) {
    try {
        const user = await getCurrentUser();

        if (!user) {
            throw new Error("UNAUTHORIZED");
        }

        const query = listSavedFiltersQuerySchema.safeParse({
            entity: req.nextUrl.searchParams.get("entity"),
        });

        if (!query.success) {
            return validationError(query.error);
        }

        const savedFilters = await prisma.savedFilter.findMany({
            where: { userId: user.id, entity: query.data.entity },
            orderBy: { createdAt: "asc" },
        });

        return NextResponse.json({ ok: true, data: savedFilters });
    } catch (error) {
        return handleRouteError(error, "Get saved filters");
    }
}

export async function POST(req: NextRequest) {
    try {
        const user = await getCurrentUser();

        if (!user) {
            throw new Error("UNAUTHORIZED");
        }

        const body = await parseBody(req, createSavedFilterSchema);

        if (!body.success) {
            return body.response;
        }

        const savedFilter = await prisma.savedFilter.create({
            data: {
                userId: user.id,
                entity: body.data.entity,
                name: body.data.name,
                filters: body.data.filters as Prisma.InputJsonObject,
            },
        });

        return NextResponse.json(
            { ok: true, message: "Filter saved successfully", data: savedFilter },
            { status: 201 }
        );
    } catch (error) {
        return handleRouteError(error, "Create saved filter");
    }
}
