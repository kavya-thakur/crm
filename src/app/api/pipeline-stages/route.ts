import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/auth/requirePermission";
import { handleRouteError, parseBody } from "@/lib/api/http";
import { createPipelineStageSchema } from "@/lib/validations/pipelineStages";


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
