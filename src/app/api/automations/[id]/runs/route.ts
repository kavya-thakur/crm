import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/auth/requirePermission";
import { handleRouteError, validationError } from "@/lib/api/http";
import { idParamSchema } from "@/lib/validations/common";

// What a rule did lately, newest first, with the lead's name or the deal's title
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const user = await requirePermission("automations:manage");

        const id = idParamSchema.safeParse((await params).id);
        if (!id.success) return validationError(id.error);

        const rule = await prisma.automationRule.findFirst({ where: { id: id.data, organizationId: user.organizationId }, select: { id: true } });
        if (!rule) return NextResponse.json({ ok: false, message: "Automation not found" }, { status: 404 });

        const runs = await prisma.automationRun.findMany({ where: { ruleId: rule.id }, orderBy: { id: "desc" }, take: 50 });
        const [leads, deals] = await Promise.all([
            prisma.lead.findMany({ where: { id: { in: runs.flatMap((run) => (run.leadId ? [run.leadId] : [])) } }, select: { id: true, name: true } }),
            prisma.deal.findMany({ where: { id: { in: runs.flatMap((run) => (run.dealId ? [run.dealId] : [])) } }, select: { id: true, title: true } }),
        ]);

        return NextResponse.json({
            ok: true,
            data: runs.map((run) => ({
                ...run,
                lead: leads.find((lead) => lead.id === run.leadId) ?? null,
                deal: deals.find((deal) => deal.id === run.dealId) ?? null,
            })),
        });
    } catch (error) {
        return handleRouteError(error, "Get automation runs");
    }
}
