import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { dealScope, requirePermission } from "@/lib/auth/requirePermission";
import { idParamSchema } from "@/lib/validations/common";
import { handleRouteError, validationError } from "@/lib/api/http";

// Other deals that look like copies of this one: the same title (in any case), or another
// still-open deal for the same lead (a won deal and a later upsell are both real). Shown in
// the deal's panel as a suggestion to merge; nothing is merged here.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const user = await requirePermission("deal:read");

        const id = idParamSchema.safeParse((await params).id);

        if (!id.success) {
            return validationError(id.error);
        }

        const deal = await prisma.deal.findFirst({ where: { id: id.data, ...dealScope(user) }, select: { title: true, leadId: true } });

        if (!deal) {
            return NextResponse.json({ ok: false, message: "Deal not found" }, { status: 404 });
        }

        const matches = await prisma.deal.findMany({
            where: {
                ...dealScope(user),
                id: { not: id.data },
                OR: [{ title: { equals: deal.title.trim(), mode: "insensitive" } }, ...(deal.leadId ? [{ leadId: deal.leadId, closedAt: null }] : [])],
            },
            orderBy: { updatedAt: "desc" },
            take: 5,
            select: { id: true, title: true, leadId: true, pipelineStage: { select: { name: true } } },
        });

        return NextResponse.json({
            ok: true,
            data: matches.map((match) => ({
                id: match.id,
                title: match.title,
                stage: match.pipelineStage.name,
                matchedOn: deal.leadId && match.leadId === deal.leadId ? "lead" : "title",
            })),
        });
    } catch (error) {
        return handleRouteError(error, "Find duplicate deals");
    }
}
