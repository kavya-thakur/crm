import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/auth/requirePermission";
import { placeholderName, planOptionList } from "@/lib/optionLists";
import { handleRouteError, parseBody } from "@/lib/api/http";
import { createLeadStageSchema, saveLeadStagesSchema } from "@/lib/validations/leadStages";

export async function GET() {
    try {
        // stages are the columns of the leads board, so anyone who can see leads needs them
        const user = await requirePermission("lead:read");

        const stages = await prisma.leadStage.findMany({
            where: { organizationId: user.organizationId },
            // id as tie-breaker so stages with the same order never swap places
            orderBy: [{ order: "asc" }, { id: "asc" }],
        });

        return NextResponse.json({ ok: true, data: stages });
    } catch (error) {
        return handleRouteError(error, "Get lead stages");
    }
}

export async function POST(req: NextRequest) {
    try {
        const user = await requirePermission("lead-stages:manage");

        const body = await parseBody(req, createLeadStageSchema);

        if (!body.success) {
            return body.response;
        }

        // new stages go at the end of the board
        const last = await prisma.leadStage.findFirst({
            where: { organizationId: user.organizationId },
            orderBy: { order: "desc" },
            select: { order: true },
        });

        const stage = await prisma.leadStage.create({
            data: {
                ...body.data,
                order: (last?.order ?? -1) + 1,
                organizationId: user.organizationId,
            },
        });

        return NextResponse.json({ ok: true, data: stage }, { status: 201 });
    } catch (error) {
        return handleRouteError(error, "Create lead stage");
    }
}

// Saves the whole list from the settings page in one go: renames, colours, converted/lost,
// order, new stages and removed ones. All or nothing.
export async function PUT(req: NextRequest) {
    try {
        const user = await requirePermission("lead-stages:manage");

        const body = await parseBody(req, saveLeadStagesSchema);

        if (!body.success) {
            return body.response;
        }

        const existing = await prisma.leadStage.findMany({
            where: { organizationId: user.organizationId },
            select: { id: true, name: true },
        });

        const plan = planOptionList(existing.map((stage) => stage.id), body.data.options);

        if (!plan.ok) {
            return NextResponse.json({ ok: false, message: plan.message }, { status: 400 });
        }

        // Lead.stageId is required, so a stage that still has leads can't go
        if (plan.removeIds.length > 0) {
            const inUse = await prisma.lead.groupBy({
                by: ["stageId"],
                where: { organizationId: user.organizationId, stageId: { in: plan.removeIds } },
                _count: { _all: true },
            });

            if (inUse.length > 0) {
                const names = inUse.map((row) => existing.find((stage) => stage.id === row.stageId)?.name).join(", ");
                return NextResponse.json(
                    { ok: false, message: `Move the leads out of ${names} before removing it` },
                    { status: 409 }
                );
            }
        }

        await prisma.$transaction(async (tx) => {
            await tx.leadStage.deleteMany({
                where: { id: { in: plan.removeIds }, organizationId: user.organizationId },
            });

            for (const stage of plan.updates) {
                await tx.leadStage.update({
                    where: { id: stage.id, organizationId: user.organizationId },
                    data: { name: placeholderName(stage.id) },
                });
            }

            for (const { id, ...stage } of plan.updates) {
                await tx.leadStage.update({
                    where: { id, organizationId: user.organizationId },
                    data: stage,
                });
            }

            for (const stage of plan.creates) {
                await tx.leadStage.create({
                    data: { ...stage, organizationId: user.organizationId },
                });
            }
        });

        const stages = await prisma.leadStage.findMany({
            where: { organizationId: user.organizationId },
            orderBy: [{ order: "asc" }, { id: "asc" }],
        });

        return NextResponse.json({ ok: true, data: stages });
    } catch (error) {
        return handleRouteError(error, "Save lead stages");
    }
}
