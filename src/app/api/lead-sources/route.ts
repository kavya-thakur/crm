import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/auth/requirePermission";
import { handleRouteError, parseBody } from "@/lib/api/http";
import { createLeadSourceSchema } from "@/lib/validations/leadSources";

export async function GET() {
    try {
        // sources show up in the lead form's picker, so anyone who can see leads needs them
        const user = await requirePermission("lead:read");

        const sources = await prisma.leadSource.findMany({
            where: { organizationId: user.organizationId },
            // id as tie-breaker so sources with the same order never swap places
            orderBy: [{ order: "asc" }, { id: "asc" }],
        });

        return NextResponse.json({ ok: true, data: sources });
    } catch (error) {
        return handleRouteError(error, "Get lead sources");
    }
}

export async function POST(req: NextRequest) {
    try {
        const user = await requirePermission("lead-sources:manage");

        const body = await parseBody(req, createLeadSourceSchema);

        if (!body.success) {
            return body.response;
        }

        // new sources go at the end of the list
        const last = await prisma.leadSource.findFirst({
            where: { organizationId: user.organizationId },
            orderBy: { order: "desc" },
            select: { order: true },
        });

        const source = await prisma.leadSource.create({
            data: {
                ...body.data,
                order: (last?.order ?? -1) + 1,
                organizationId: user.organizationId,
            },
        });

        return NextResponse.json({ ok: true, data: source }, { status: 201 });
    } catch (error) {
        return handleRouteError(error, "Create lead source");
    }
}
