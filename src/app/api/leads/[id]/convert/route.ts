import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { hasPermission, leadScope, requirePermission } from "@/lib/auth/requirePermission";
import { createDealSchema } from "@/lib/validations/deals";
import { idParamSchema } from "@/lib/validations/common";
import { handleRouteError, parseBody, validationError } from "@/lib/api/http";
import { closedAtFor } from "@/lib/deals/stages";
import { dealLeadSelect } from "@/lib/deals/select";

// Only what a deal needs beyond the lead itself: the lead and its current
// assignee carry over as-is, so neither is asked for here. Deal custom fields
// are a separate set from the lead's, so they're left for the deal panel.
const convertLeadSchema = createDealSchema.omit({ leadId: true, assignedToId: true, customFields: true });

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const user = await requirePermission("lead:update");

        // Converting creates a deal, so it needs that permission too
        if (!hasPermission(user, "deal:create")) {
            throw new Error("FORBIDDEN");
        }

        const id = idParamSchema.safeParse((await params).id);

        if (!id.success) {
            return validationError(id.error);
        }

        const body = await parseBody(req, convertLeadSchema);

        if (!body.success) {
            return body.response;
        }

        const lead = await prisma.lead.findFirst({
            where: {
                id: id.data,
                ...leadScope(user),
            },
            select: { id: true, assignedToId: true, stage: { select: { isConverted: true } } },
        });

        if (!lead) {
            return NextResponse.json(
                { ok: false, message: "Lead not found" },
                { status: 404 }
            );
        }

        if (lead.stage.isConverted) {
            return NextResponse.json(
                { ok: false, message: "This lead has already been converted" },
                { status: 409 }
            );
        }

        // the stage a converted lead moves to — set up once per org in Lead Stages settings
        const convertedStage = await prisma.leadStage.findFirst({
            where: { organizationId: user.organizationId, isConverted: true },
            orderBy: { order: "asc" },
            select: { id: true },
        });

        if (!convertedStage) {
            return NextResponse.json(
                { ok: false, message: "No lead stage is marked as \"Converted\" yet — set one up in Settings > Lead Stages" },
                { status: 409 }
            );
        }

        const { pipelineStageId } = body.data;

        // Verify that the pipeline stage belongs to this organization.
        const stage = await prisma.pipelineStage.findFirst({
            where: {
                id: pipelineStageId,
                organizationId: user.organizationId,
            },
            select: { id: true, isWon: true, isLost: true },
        });

        if (!stage) {
            return NextResponse.json(
                { ok: false, message: "Invalid pipeline stage" },
                { status: 400 }
            );
        }

        // One transaction: either both the deal exists and the lead is marked
        // converted, or neither does.
        const [deal] = await prisma.$transaction([
            prisma.deal.create({
                data: {
                    ...body.data,
                    closedAt: closedAtFor(stage),
                    leadId: lead.id,
                    assignedToId: lead.assignedToId,
                    organizationId: user.organizationId,
                    createdById: user.id,
                    updatedById: user.id,
                    timeline: {
                        create: {
                            userId: user.id,
                            type: "CREATED",
                            message: "Deal created from lead conversion",
                        },
                    },
                },
                include: {
                    lead: dealLeadSelect,
                    assignedTo: { select: { id: true, name: true, email: true } },
                    pipelineStage: true,
                },
            }),

            prisma.lead.update({
                where: { id: lead.id },
                data: {
                    stageId: convertedStage.id,
                    lostReason: null,
                    updatedById: user.id,
                    timeline: {
                        create: {
                            userId: user.id,
                            type: "CONVERTED",
                            message: "Lead converted to a deal",
                        },
                    },
                },
            }),
        ]);

        return NextResponse.json(
            {
                ok: true,
                message: "Lead converted to a deal",
                data: deal,
            },
            { status: 201 }
        );
    } catch (error) {
        return handleRouteError(error, "Convert lead");
    }
}
