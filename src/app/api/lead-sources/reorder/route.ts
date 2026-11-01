import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/auth/requirePermission";
import { dbIdSchema } from "@/lib/validations/common";
import { handleRouteError, parseBody } from "@/lib/api/http";

const reorderSchema = z.object({
    // every source id, in the order they should appear
    sourceIds: z.array(dbIdSchema).min(1),
});

export async function PATCH(req: NextRequest) {
    try {
        const user = await requirePermission("lead-sources:manage");

        const body = await parseBody(req, reorderSchema);

        if (!body.success) {
            return body.response;
        }

        const { sourceIds } = body.data;

        const sources = await prisma.leadSource.findMany({
            where: { organizationId: user.organizationId },
            select: { id: true },
        });

        const orgIds = new Set(sources.map((source) => source.id));
        const sentIds = new Set(sourceIds);

        const matches = orgIds.size === sentIds.size && [...orgIds].every((id) => sentIds.has(id));

        if (!matches) {
            return NextResponse.json(
                { ok: false, message: "The source list doesn't match your organization's sources" },
                { status: 400 }
            );
        }

        await prisma.$transaction(
            sourceIds.map((id, order) =>
                prisma.leadSource.update({
                    where: { id, organizationId: user.organizationId },
                    data: { order },
                })
            )
        );

        return NextResponse.json({
            ok: true,
            message: "Lead sources reordered successfully",
        });
    } catch (error) {
        return handleRouteError(error, "Reorder lead sources");
    }
}
