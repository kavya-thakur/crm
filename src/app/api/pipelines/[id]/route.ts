import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/auth/requirePermission";
import { handleRouteError, parseBody, validationError } from "@/lib/api/http";
import { broadcastChange } from "@/lib/realtime/notify";
import { pipelineNameTaken, pipelineWithStages } from "@/lib/deals/stages";
import { idParamSchema } from "@/lib/validations/common";
import { pipelineSchema } from "@/lib/validations/pipelineStages";

type Params = { params: Promise<{ id: string }> };

const notFound = () => NextResponse.json({ ok: false, message: "Pipeline not found" }, { status: 404 });

// Renames a pipeline
export async function PATCH(req: NextRequest, { params }: Params) {
    try {
        const user = await requirePermission("pipeline:manage");
        const id = idParamSchema.safeParse((await params).id);
        if (!id.success) return validationError(id.error);

        const body = await parseBody(req, pipelineSchema);
        if (!body.success) return body.response;

        const taken = await pipelineNameTaken(user.organizationId, body.data.name, id.data);
        if (taken) return NextResponse.json({ ok: false, message: taken }, { status: 409 });

        const { count } = await prisma.pipeline.updateMany({ where: { id: id.data, organizationId: user.organizationId }, data: { name: body.data.name } });
        if (count === 0) return notFound();

        const pipeline = await prisma.pipeline.findUniqueOrThrow({ where: { id: id.data }, include: pipelineWithStages });
        broadcastChange(user.organizationId, "pipeline-stages");
        return NextResponse.json({ ok: true, data: pipeline });
    } catch (error) {
        return handleRouteError(error, "Rename pipeline");
    }
}

// Deletes a pipeline and its stages, once no deal is in it, and never the last one (deals need a board)
export async function DELETE(_req: NextRequest, { params }: Params) {
    try {
        const user = await requirePermission("pipeline:manage");
        const id = idParamSchema.safeParse((await params).id);
        if (!id.success) return validationError(id.error);

        const pipeline = await prisma.pipeline.findFirst({ where: { id: id.data, organizationId: user.organizationId }, select: { id: true, name: true } });
        if (!pipeline) return notFound();

        const [pipelines, deals] = await Promise.all([
            prisma.pipeline.count({ where: { organizationId: user.organizationId } }),
            prisma.deal.count({ where: { organizationId: user.organizationId, pipelineStage: { pipelineId: pipeline.id } } }),
        ]);
        if (pipelines === 1) return NextResponse.json({ ok: false, message: "A workspace needs at least one pipeline" }, { status: 409 });
        if (deals > 0) {
            return NextResponse.json({ ok: false, message: `Move or delete the ${deals} deal${deals === 1 ? "" : "s"} in ${pipeline.name} first` }, { status: 409 });
        }

        // its stages go with it (cascade). A deal moved in meanwhile makes this fail on its foreign key: a 409, nothing deleted
        await prisma.pipeline.delete({ where: { id: pipeline.id } });
        broadcastChange(user.organizationId, "pipeline-stages");
        return NextResponse.json({ ok: true, message: `${pipeline.name} deleted` });
    } catch (error) {
        return handleRouteError(error, "Delete pipeline");
    }
}
