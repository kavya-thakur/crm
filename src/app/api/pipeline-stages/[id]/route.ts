import { handleRouteError, parseBody, validationError } from "@/lib/api/http";
import { requirePermission } from "@/lib/auth/requirePermission";
import { prisma } from "@/lib/db/prisma";
import { closedAtFor } from "@/lib/pipelineStages";
import { idParamSchema } from "@/lib/validations/common";
import { updatePipelineStageSchema } from "@/lib/validations/pipelineStages";
import { NextRequest, NextResponse } from "next/server";

type Params = { params: Promise<{ id: string }> };

function stageNotFound() {
    return NextResponse.json(
        { ok: false, message: "Pipeline stage not found" },
        { status: 404 }
    );
}

export async function PATCH(req: NextRequest, { params }: Params) {
    try {
        const user = await requirePermission("pipeline:manage");

        const id = idParamSchema.safeParse((await params).id);

        if (!id.success) {
            return validationError(id.error);
        }

        const body = await parseBody(req, updatePipelineStageSchema);

        if (!body.success) {
            return body.response;
        }

        const existing = await prisma.pipelineStage.findFirst({
            where: {
                id: id.data,
                organizationId: user.organizationId,
            },
            select: { isWon: true, isLost: true },
        });

        if (!existing) {
            return stageNotFound();
        }

        // the schema only checks won/lost within the patch itself; merge with
        // what's already there so flipping just one of them is still caught
        const nextIsWon = body.data.isWon ?? existing.isWon;
        const nextIsLost = body.data.isLost ?? existing.isLost;

        if (nextIsWon && nextIsLost) {
            return NextResponse.json(
                { ok: false, message: "A stage can't be both won and lost" },
                { status: 400 }
            );
        }

        const stage = await prisma.pipelineStage.update({
            where: {
                id: id.data,
                organizationId: user.organizationId,
            },
            data: body.data,
        });

        // becoming won/lost closes the deals already here; the reverse reopens them
        if ((existing.isWon || existing.isLost) !== (stage.isWon || stage.isLost)) {
            await prisma.deal.updateMany({
                where: { pipelineStageId: stage.id, organizationId: user.organizationId },
                data: { closedAt: closedAtFor(stage) },
            });
        }

        return NextResponse.json({ ok: true, data: stage });
    } catch (error) {
        return handleRouteError(error, "Update pipeline stage");
    }
}

export async function DELETE(req: NextRequest, { params }: Params) {
    try {
        const user = await requirePermission("pipeline:manage");

        const id = idParamSchema.safeParse((await params).id);

        if (!id.success) {
            return validationError(id.error);
        }

        // Deal.pipelineStageId is required, so deleting a stage still in use
        // would otherwise fail with a raw foreign-key error
        const dealCount = await prisma.deal.count({
            where: {
                pipelineStageId: id.data,
                organizationId: user.organizationId,
            },
        });

        if (dealCount > 0) {
            return NextResponse.json(
                {
                    ok: false,
                    message: `Move or delete the ${dealCount} deal${dealCount === 1 ? "" : "s"} in this stage first`,
                },
                { status: 409 }
            );
        }

        const { count } = await prisma.pipelineStage.deleteMany({
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
            message: "Pipeline stage deleted successfully",
        });
    } catch (error) {
        return handleRouteError(error, "Delete pipeline stage");
    }
}
