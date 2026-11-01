import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/auth/requirePermission";
import { createCustomFieldSchema, listCustomFieldsQuerySchema } from "@/lib/validations/customFields";
import type { EntityType } from "@/lib/validations/common";
import { handleRouteError, parseBody, validationError } from "@/lib/api/http";

// Anyone who can read the entity needs its field definitions (to render the
// create form, table columns and filter panel) — defining/editing them is
// the separate "custom-fields:manage" permission, checked below.
const READ_PERMISSION: Record<EntityType, string> = {
    lead: "lead:read",
    deal: "deal:read",
    contact: "contact:read",
};

export async function GET(req: NextRequest) {
    try {
        const query = listCustomFieldsQuerySchema.safeParse({
            entity: req.nextUrl.searchParams.get("entity"),
        });

        if (!query.success) {
            return validationError(query.error);
        }

        const user = await requirePermission(READ_PERMISSION[query.data.entity]);

        const customFields = await prisma.customFieldDefinition.findMany({
            where: { organizationId: user.organizationId, entity: query.data.entity },
            orderBy: [{ order: "asc" }, { id: "asc" }],
        });

        return NextResponse.json({ ok: true, data: customFields });
    } catch (error) {
        return handleRouteError(error, "Get custom fields");
    }
}

export async function POST(req: NextRequest) {
    try {
        const user = await requirePermission("custom-fields:manage");

        const body = await parseBody(req, createCustomFieldSchema);

        if (!body.success) {
            return body.response;
        }

        const { entity, key, label, type, options, group, required, showInFilter, showInList } = body.data;

        // new fields go at the end of the list, like pipeline stages do
        const last = await prisma.customFieldDefinition.findFirst({
            where: { organizationId: user.organizationId, entity },
            orderBy: { order: "desc" },
            select: { order: true },
        });

        const customField = await prisma.customFieldDefinition.create({
            data: {
                organizationId: user.organizationId,
                entity,
                key,
                label,
                type,
                options: type === "SELECT" ? options : undefined,
                group: group || undefined,
                required,
                showInFilter,
                showInList,
                order: (last?.order ?? -1) + 1,
            },
        });

        return NextResponse.json(
            { ok: true, message: "Custom field created successfully", data: customField },
            { status: 201 }
        );
    } catch (error) {
        return handleRouteError(error, "Create custom field");
    }
}
