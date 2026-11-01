import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/auth/requirePermission";
import { handleRouteError, parseBody } from "@/lib/api/http";
import { createLeadStageSchema } from "@/lib/validations/leadStages";

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
