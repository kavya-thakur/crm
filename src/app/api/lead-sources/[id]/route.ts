import { handleRouteError, parseBody, validationError } from "@/lib/api/http";
import { requirePermission } from "@/lib/auth/requirePermission";
import { prisma } from "@/lib/db/prisma";
import { idParamSchema } from "@/lib/validations/common";
import { updateLeadSourceSchema } from "@/lib/validations/leadSources";
import { NextRequest, NextResponse } from "next/server";

type Params = { params: Promise<{ id: string }> };

function sourceNotFound() {
    return NextResponse.json(
        { ok: false, message: "Lead source not found" },
        { status: 404 }
    );
}

export async function PATCH(req: NextRequest, { params }: Params) {
    try {
        const user = await requirePermission("lead-sources:manage");

        const id = idParamSchema.safeParse((await params).id);

        if (!id.success) {
            return validationError(id.error);
        }

        const body = await parseBody(req, updateLeadSourceSchema);

        if (!body.success) {
            return body.response;
        }

        const source = await prisma.leadSource.update({
            where: { id: id.data, organizationId: user.organizationId },
            data: body.data,
        });

        return NextResponse.json({ ok: true, data: source });
    } catch (error) {
        return handleRouteError(error, "Update lead source");
    }
}

export async function DELETE(req: NextRequest, { params }: Params) {
    try {
        const user = await requirePermission("lead-sources:manage");

        const id = idParamSchema.safeParse((await params).id);

        if (!id.success) {
            return validationError(id.error);
        }

        // Lead.sourceId is nullable, so leads using this source are simply
        // un-sourced rather than blocked, unlike stages (required) or
        // pipeline stages (deals need one).
        const { count } = await prisma.leadSource.deleteMany({
            where: { id: id.data, organizationId: user.organizationId },
        });

        if (count === 0) {
            return sourceNotFound();
        }

        return NextResponse.json({
            ok: true,
            message: "Lead source deleted successfully",
        });
    } catch (error) {
        return handleRouteError(error, "Delete lead source");
    }
}
