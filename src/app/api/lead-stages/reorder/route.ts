import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/auth/requirePermission";
import { dbIdSchema } from "@/lib/validations/common";
import { handleRouteError, parseBody } from "@/lib/api/http";

const reorderSchema = z.object({
    // every stage id, in the order they should appear
    stageIds: z.array(dbIdSchema).min(1),
});

export async function PATCH(req: NextRequest) {
    try {
        const user = await requirePermission("lead-stages:manage");

        const body = await parseBody(req, reorderSchema);

        if (!body.success) {
            return body.response;
        }

        const { stageIds } = body.data;

        const stages = await prisma.leadStage.findMany({
            where: { organizationId: user.organizationId },
            select: { id: true },
        });

        const orgIds = new Set(stages.map((stage) => stage.id));
        const sentIds = new Set(stageIds);

        // Must be exactly this org's stages, no more, no fewer — a partial list
        // would leave some stages with a stale order
        const matches = orgIds.size === sentIds.size && [...orgIds].every((id) => sentIds.has(id));

        if (!matches) {
            return NextResponse.json(
                { ok: false, message: "The stage list doesn't match your organization's stages" },
                { status: 400 }
            );
        }

        await prisma.$transaction(
            stageIds.map((id, order) =>
                prisma.leadStage.update({
                    where: { id, organizationId: user.organizationId },
                    data: { order },
                })
            )
        );

        return NextResponse.json({
            ok: true,
            message: "Lead stages reordered successfully",
        });
    } catch (error) {
        return handleRouteError(error, "Reorder lead stages");
    }
}
