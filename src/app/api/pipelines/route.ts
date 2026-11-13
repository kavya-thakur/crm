import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/auth/requirePermission";
import { handleRouteError, parseBody } from "@/lib/api/http";
import { broadcastChange } from "@/lib/realtime/notify";
import { createPipeline, pipelineNameTaken, STAGE_ORDER } from "@/lib/deals/stages";
import { pipelineSchema } from "@/lib/validations/pipelineStages";

/*
 * The workspace's deal pipelines ("New sales", "Renewals"), each with its own stages. Everyone who
 * sees deals reads them (the board's switcher, stage pickers); admins (pipeline:manage) add them.
 * Renaming and deleting one: ./[id]. Its stages are edited at /api/pipeline-stages?pipelineId=.
 */

export async function GET() {
    try {
        const user = await requirePermission("deal:read");
        const pipelines = await prisma.pipeline.findMany({
            where: { organizationId: user.organizationId },
            orderBy: [{ order: "asc" }, { id: "asc" }],
            include: { stages: { orderBy: STAGE_ORDER, include: { _count: { select: { deals: true } } } } },
        });
        // how many deals each has, for its card in Settings > Pipelines
        const data = pipelines.map((pipeline) => ({ ...pipeline, dealCount: pipeline.stages.reduce((sum, stage) => sum + stage._count.deals, 0) }));
        return NextResponse.json({ ok: true, data });
    } catch (error) {
        return handleRouteError(error, "Get pipelines");
    }
}

// A new pipeline, at the end, with a few stages to rename and add to
export async function POST(req: NextRequest) {
    try {
        const user = await requirePermission("pipeline:manage");

        const body = await parseBody(req, pipelineSchema);
        if (!body.success) return body.response;

        const taken = await pipelineNameTaken(user.organizationId, body.data.name);
        if (taken) return NextResponse.json({ ok: false, message: taken }, { status: 409 });

        const last = await prisma.pipeline.findFirst({ where: { organizationId: user.organizationId }, orderBy: { order: "desc" }, select: { order: true } });
        const pipeline = await createPipeline(prisma, { organizationId: user.organizationId, name: body.data.name, order: (last?.order ?? -1) + 1 });

        broadcastChange(user.organizationId, "pipeline-stages");
        return NextResponse.json({ ok: true, data: pipeline }, { status: 201 });
    } catch (error) {
        return handleRouteError(error, "Create pipeline");
    }
}
