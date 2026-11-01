import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/auth/requirePermission";
import { updateCustomFieldSchema } from "@/lib/validations/customFields";
import { idParamSchema } from "@/lib/validations/common";
import { handleRouteError, parseBody, validationError } from "@/lib/api/http";

type Params = { params: Promise<{ id: string }> };

function customFieldNotFound() {
    return NextResponse.json(
        { ok: false, message: "Custom field not found" },
        { status: 404 }
    );
}

export async function PATCH(req: NextRequest, { params }: Params) {
    try {
        const user = await requirePermission("custom-fields:manage");

        const id = idParamSchema.safeParse((await params).id);

        if (!id.success) {
            return validationError(id.error);
        }

        const body = await parseBody(req, updateCustomFieldSchema);

        if (!body.success) {
            return body.response;
        }

        const existing = await prisma.customFieldDefinition.findFirst({
            where: { id: id.data, organizationId: user.organizationId },
            select: { type: true, options: true },
        });

        if (!existing) {
            return customFieldNotFound();
        }

        const nextType = body.data.type ?? existing.type;
        const hasOptions = (options: unknown) => Array.isArray(options) && options.length > 0;

        if (nextType !== "SELECT" && body.data.options) {
            return NextResponse.json(
                { ok: false, message: "Only select fields have options" },
                { status: 400 }
            );
        }

        if (nextType === "SELECT" && !hasOptions(body.data.options) && !hasOptions(existing.options)) {
            return NextResponse.json(
                { ok: false, message: "A select field needs at least one option" },
                { status: 400 }
            );
        }

        const customField = await prisma.customFieldDefinition.update({
            where: { id: id.data, organizationId: user.organizationId },
            data: {
                ...body.data,
                // leaving SELECT drops the now-meaningless options list
                options: nextType === "SELECT"
                    ? (body.data.options as Prisma.InputJsonValue | undefined ?? existing.options ?? undefined)
                    : Prisma.JsonNull,
            },
        });

        return NextResponse.json({ ok: true, data: customField });
    } catch (error) {
        return handleRouteError(error, "Update custom field");
    }
}

export async function DELETE(req: NextRequest, { params }: Params) {
    try {
        const user = await requirePermission("custom-fields:manage");

        const id = idParamSchema.safeParse((await params).id);

        if (!id.success) {
            return validationError(id.error);
        }

        // The field's existing values just sit unused in each record's
        // customFields JSON after this — nothing references this row to clean up.
        const { count } = await prisma.customFieldDefinition.deleteMany({
            where: { id: id.data, organizationId: user.organizationId },
        });

        if (count === 0) {
            return customFieldNotFound();
        }

        return NextResponse.json({
            ok: true,
            message: "Custom field deleted successfully",
        });
    } catch (error) {
        return handleRouteError(error, "Delete custom field");
    }
}
