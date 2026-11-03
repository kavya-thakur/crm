import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/auth/requirePermission";
import { handleRouteError, parseBody } from "@/lib/api/http";
import { automationRuleSchema } from "@/lib/validations/automations";
import { checkReferences } from "@/lib/automations/checkRule";

// The workspace's rules, in the order they run, each with how often it has run
export async function GET() {
    try {
        const user = await requirePermission("automations:manage");

        const rules = await prisma.automationRule.findMany({
            where: { organizationId: user.organizationId },
            orderBy: [{ order: "asc" }, { id: "asc" }],
            include: {
                _count: { select: { runs: true } },
                runs: { orderBy: { id: "desc" }, take: 1, select: { status: true, createdAt: true } },
            },
        });

        return NextResponse.json({ ok: true, data: rules });
    } catch (error) {
        return handleRouteError(error, "Get automations");
    }
}

export async function POST(req: NextRequest) {
    try {
        const user = await requirePermission("automations:manage");

        const body = await parseBody(req, automationRuleSchema);
        if (!body.success) return body.response;

        const problem = await checkReferences(user, body.data);
        if (problem) return NextResponse.json({ ok: false, message: problem }, { status: 400 });

        // new rules run after the existing ones
        const last = await prisma.automationRule.findFirst({ where: { organizationId: user.organizationId }, orderBy: { order: "desc" }, select: { order: true } });

        const rule = await prisma.automationRule.create({
            data: { ...body.data, organizationId: user.organizationId, createdById: user.id, order: (last?.order ?? -1) + 1 },
        });

        return NextResponse.json({ ok: true, message: "Automation created", data: rule }, { status: 201 });
    } catch (error) {
        return handleRouteError(error, "Create automation");
    }
}
