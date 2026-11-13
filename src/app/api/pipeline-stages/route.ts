import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/auth/requirePermission";
import { placeholderName, planOptionList } from "@/lib/settings/optionLists";
import { closedAtFor, STAGE_ORDER } from "@/lib/deals/stages";
import { handleRouteError, parseBody, validationError } from "@/lib/api/http";
import { broadcastChange } from "@/lib/realtime/notify";
import { searchParamsToObject } from "@/lib/validations/common";
import { createPipelineStageSchema, pipelineQuerySchema, savePipelineStagesSchema } from "@/lib/validations/pipelineStages";

/*
 * The stages of the deals boards. Each belongs to a pipeline (src/lib/deals/stages.ts); GET lists
 * every pipeline's (pipeline by pipeline, each in board order) or, with ?pipelineId=, one pipeline's.
 */

// Pipeline by pipeline, then each pipeline's own order
const BOARD_ORDER = [{ pipeline: { order: "asc" as const } }, { pipelineId: "asc" as const }, ...STAGE_ORDER];

// ?pipelineId=, checked to be one of this workspace's pipelines (null when it isn't)
async function pipelineFrom(req: NextRequest, organizationId: number) {
    const query = pipelineQuerySchema.safeParse(searchParamsToObject(req.nextUrl.searchParams));
    if (!query.success) return { error: validationError(query.error) };
    const { pipelineId } = query.data;
    if (pipelineId === undefined) return { pipelineId: undefined };
    const pipeline = await prisma.pipeline.findFirst({ where: { id: pipelineId, organizationId }, select: { id: true } });
    return pipeline ? { pipelineId: pipeline.id } : { error: NextResponse.json({ ok: false, message: "Pipeline not found" }, { status: 404 }) };
}

export async function GET(req: NextRequest) {
    try {
        // stages are the columns of the deals board, so anyone who can see deals needs them
        const user = await requirePermission("deal:read");

        const { pipelineId, error } = await pipelineFrom(req, user.organizationId);
        if (error) return error;

        const stages = await prisma.pipelineStage.findMany({
            where: { organizationId: user.organizationId, ...(pipelineId && { pipelineId }) },
            orderBy: BOARD_ORDER,
        });

        return NextResponse.json({ ok: true, data: stages });
    } catch (error) {
        return handleRouteError(error, "Get pipeline stages");
    }
}

export async function POST(req: NextRequest) {
    try {
        const user = await requirePermission("pipeline:manage");

        // like a validation middleware in Express: bad JSON or bad fields -> 400 with field errors
        const body = await parseBody(req, createPipelineStageSchema);

        if (!body.success) {
            return body.response;
        }

        const pipeline = await prisma.pipeline.findFirst({ where: { id: body.data.pipelineId, organizationId: user.organizationId }, select: { id: true } });
        if (!pipeline) {
            return NextResponse.json({ ok: false, message: "Pipeline not found" }, { status: 404 });
        }

        // new stages go at the end of their pipeline's board
        const last = await prisma.pipelineStage.findFirst({
            where: { pipelineId: pipeline.id },
            orderBy: { order: "desc" },
            select: { order: true },
        });

        const stage = await prisma.pipelineStage.create({
            data: {
                ...body.data,
                order: (last?.order ?? -1) + 1,
                organizationId: user.organizationId,
            },
        });

        broadcastChange(user.organizationId, "pipeline-stages");
        return NextResponse.json({ ok: true, data: stage }, { status: 201 });
    } catch (error) {
        return handleRouteError(error, "Create pipeline stage");
    }
}

// Saves one pipeline's whole list from the settings page in one go (?pipelineId=): renames,
// colours, won/lost, order, new stages and removed ones. All or nothing.
export async function PUT(req: NextRequest) {
    try {
        const user = await requirePermission("pipeline:manage");

        const { pipelineId, error } = await pipelineFrom(req, user.organizationId);
        if (error) return error;
        if (!pipelineId) {
            return NextResponse.json({ ok: false, message: "Pick the pipeline these stages belong to" }, { status: 400 });
        }

        const body = await parseBody(req, savePipelineStagesSchema);

        if (!body.success) {
            return body.response;
        }

        const existing = await prisma.pipelineStage.findMany({
            where: { pipelineId, organizationId: user.organizationId },
            select: { id: true, name: true, isWon: true, isLost: true },
        });

        // only this pipeline's stages can be renamed or removed from here
        const plan = planOptionList(existing.map((stage) => stage.id), body.data.options);

        if (!plan.ok) {
            return NextResponse.json({ ok: false, message: plan.message }, { status: 400 });
        }

        // Deal.pipelineStageId is required, so a stage that still has deals can't go
        if (plan.removeIds.length > 0) {
            const inUse = await prisma.deal.groupBy({
                by: ["pipelineStageId"],
                where: { organizationId: user.organizationId, pipelineStageId: { in: plan.removeIds } },
                _count: { _all: true },
            });

            if (inUse.length > 0) {
                const names = inUse.map((row) => existing.find((stage) => stage.id === row.pipelineStageId)?.name).join(", ");
                return NextResponse.json(
                    { ok: false, message: `Move the deals out of ${names} before removing it` },
                    { status: 409 }
                );
            }
        }

        await prisma.$transaction(async (tx) => {
            await tx.pipelineStage.deleteMany({
                where: { id: { in: plan.removeIds }, organizationId: user.organizationId },
            });

            for (const stage of plan.updates) {
                await tx.pipelineStage.update({
                    where: { id: stage.id, organizationId: user.organizationId },
                    data: { name: placeholderName(stage.id) },
                });
            }

            for (const { id, ...stage } of plan.updates) {
                await tx.pipelineStage.update({
                    where: { id, organizationId: user.organizationId },
                    data: stage,
                });

                // A stage that became won/lost closes the deals in it now; one that
                // stopped being won/lost reopens them
                const before = existing.find((row) => row.id === id)!;
                const wasClosed = before.isWon || before.isLost;
                if (wasClosed !== (stage.isWon || stage.isLost)) {
                    await tx.deal.updateMany({
                        where: { pipelineStageId: id, organizationId: user.organizationId },
                        data: { closedAt: closedAtFor(stage) },
                    });
                }
            }

            for (const stage of plan.creates) {
                await tx.pipelineStage.create({
                    data: { ...stage, pipelineId, organizationId: user.organizationId },
                });
            }
        });

        const stages = await prisma.pipelineStage.findMany({
            where: { pipelineId, organizationId: user.organizationId },
            orderBy: STAGE_ORDER,
        });

        broadcastChange(user.organizationId, "pipeline-stages");
        return NextResponse.json({ ok: true, data: stages });
    } catch (error) {
        return handleRouteError(error, "Save pipeline stages");
    }
}
