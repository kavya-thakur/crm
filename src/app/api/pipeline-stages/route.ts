import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/auth/requirePermission";
import { placeholderName, planOptionList } from "@/lib/optionLists";
import { closedAtFor } from "@/lib/pipelineStages";
import { handleRouteError, parseBody } from "@/lib/api/http";
import { createPipelineStageSchema, savePipelineStagesSchema } from "@/lib/validations/pipelineStages";


export async function GET() {
    try {
        // stages are the columns of the deals board, so anyone who can see deals needs them
        const user = await requirePermission("deal:read");

        const stages = await prisma.pipelineStage.findMany({
            where: { organizationId: user.organizationId },
            // id as tie-breaker so stages with the same order never swap places
            orderBy: [{ order: "asc" }, { id: "asc" }],
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

        // new stages go at the end of the board
        const last = await prisma.pipelineStage.findFirst({
            where: { organizationId: user.organizationId },
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

        return NextResponse.json({ ok: true, data: stage }, { status: 201 });
    } catch (error) {
        return handleRouteError(error, "Create pipeline stage");
    }
}

// Saves the whole list from the settings page in one go: renames, colours, won/lost,
// order, new stages and removed ones. All or nothing.
export async function PUT(req: NextRequest) {
    try {
        const user = await requirePermission("pipeline:manage");

        const body = await parseBody(req, savePipelineStagesSchema);

        if (!body.success) {
            return body.response;
        }

        const existing = await prisma.pipelineStage.findMany({
            where: { organizationId: user.organizationId },
            select: { id: true, name: true, isWon: true, isLost: true },
        });

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
                    data: { ...stage, organizationId: user.organizationId },
                });
            }
        });

        const stages = await prisma.pipelineStage.findMany({
            where: { organizationId: user.organizationId },
            orderBy: [{ order: "asc" }, { id: "asc" }],
        });

        return NextResponse.json({ ok: true, data: stages });
    } catch (error) {
        return handleRouteError(error, "Save pipeline stages");
    }
}
