import { handleRouteError, parseBody, validationError } from "@/lib/api/http";
import { requirePermission } from "@/lib/auth/requirePermission";
import { prisma } from "@/lib/db/prisma";
import { idParamSchema } from "@/lib/validations/common";
import { updateLeadStageSchema } from "@/lib/validations/leadStages";
import { NextRequest, NextResponse } from "next/server";

type Params = { params: Promise<{ id: string }> };

function stageNotFound() {
    return NextResponse.json(
        { ok: false, message: "Lead stage not found" },
        { status: 404 }
    );
}

export async function PATCH(req: NextRequest, { params }: Params) {
    try {
        const user = await requirePermission("lead-stages:manage");

        const id = idParamSchema.safeParse((await params).id);

        if (!id.success) {
            return validationError(id.error);
        }

        const body = await parseBody(req, updateLeadStageSchema);

        if (!body.success) {
            return body.response;
        }

        const existing = await prisma.leadStage.findFirst({
            where: {
                id: id.data,
                organizationId: user.organizationId,
            },
            select: { isConverted: true, isLost: true },
        });

        if (!existing) {
            return stageNotFound();
        }

        // the schema only checks converted/lost within the patch itself; merge with
        // what's already there so flipping just one of them is still caught
        const nextIsConverted = body.data.isConverted ?? existing.isConverted;
        const nextIsLost = body.data.isLost ?? existing.isLost;

        if (nextIsConverted && nextIsLost) {
            return NextResponse.json(
                { ok: false, message: "A stage can't be both converted and lost" },
                { status: 400 }
            );
        }

        const stage = await prisma.leadStage.update({
            where: {
                id: id.data,
                organizationId: user.organizationId,
            },
            data: body.data,
        });

        return NextResponse.json({ ok: true, data: stage });
    } catch (error) {
        return handleRouteError(error, "Update lead stage");
    }
}

export async function DELETE(req: NextRequest, { params }: Params) {
    try {
        const user = await requirePermission("lead-stages:manage");

        const id = idParamSchema.safeParse((await params).id);

        if (!id.success) {
            return validationError(id.error);
        }

        // Lead.stageId is required, so deleting a stage still in use
        // would otherwise fail with a raw foreign-key error
        const leadCount = await prisma.lead.count({
            where: {
                stageId: id.data,
                organizationId: user.organizationId,
            },
        });

        if (leadCount > 0) {
            return NextResponse.json(
                {
                    ok: false,
                    message: `Move or delete the ${leadCount} lead${leadCount === 1 ? "" : "s"} in this stage first`,
                },
                { status: 409 }
            );
        }

        const { count } = await prisma.leadStage.deleteMany({
            where: {
                id: id.data,
                organizationId: user.organizationId,
            },
        });

        if (count === 0) {
            return stageNotFound();
        }

        return NextResponse.json({
            ok: true,
            message: "Lead stage deleted successfully",
        });
    } catch (error) {
        return handleRouteError(error, "Delete lead stage");
    }
}
