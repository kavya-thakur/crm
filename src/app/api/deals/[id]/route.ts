import { handleRouteError, parseBody, validationError } from "@/lib/api/http";
import { dealScope, requirePermission } from "@/lib/auth/requirePermission";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/generated/prisma/client";
import { idParamSchema } from "@/lib/validations/common";
import { updateDealSchema } from "@/lib/validations/deals";
import { validateCustomFieldValues } from "@/lib/customFields";
import { closedAtFor } from "@/lib/pipelineStages";
import { NextRequest, NextResponse } from "next/server";
import { dealLeadSelect } from "@/lib/deals";

type Params = { params: Promise<{ id: string }> };

function dealNotFound() {
    return NextResponse.json(
        {
            ok: false,
            message: "Deal not found",
        },
        { status: 404 }
    );
}

export async function GET(req: NextRequest, { params }: Params) {
    try {
        const user = await requirePermission("deal:read");

        const id = idParamSchema.safeParse((await params).id);

        if (!id.success) {
            return validationError(id.error);
        }

        const deal = await prisma.deal.findFirst({
            where: {
                id: id.data,
                ...dealScope(user),
            },
            include: {
                lead: dealLeadSelect,
                assignedTo: {
                    select: { id: true, name: true, email: true },
                },
                pipelineStage: true,
            },
        });

        if (!deal) {
            return dealNotFound();
        }

        return NextResponse.json({
            ok: true,
            data: deal,
        });
    } catch (error) {
        return handleRouteError(error, "Get deal");
    }
}

export async function PUT(req: NextRequest, { params }: Params) {
    try {
        const user = await requirePermission("deal:update");

        const id = idParamSchema.safeParse((await params).id);

        if (!id.success) {
            return validationError(id.error);
        }

        const body = await parseBody(req, updateDealSchema);

        if (!body.success) {
            return body.response;
        }

        const existingDeal = await prisma.deal.findFirst({
            where: {
                id: id.data,
                ...dealScope(user),
            },
            select: {
                pipelineStageId: true,
                customFields: true,
            },
        });

        if (!existingDeal) {
            return dealNotFound();
        }

        const { pipelineStageId, leadId, customFields: submittedCustomFields, ...fields } = body.data;

        // when the stage changes: the moment the deal closed, or null if it's open again
        let closedAt: Date | null = null;
        let lost = false;

        // Verify that the pipeline stage belongs to this organization, if changing it.
        if (pipelineStageId !== undefined) {
            const stage = await prisma.pipelineStage.findFirst({
                where: {
                    id: pipelineStageId,
                    organizationId: user.organizationId,
                },
                select: { id: true, isWon: true, isLost: true },
            });

            if (!stage) {
                return NextResponse.json(
                    {
                        ok: false,
                        message: "Invalid pipeline stage",
                    },
                    { status: 400 }
                );
            }

            closedAt = closedAtFor(stage);
            lost = stage.isLost;
        }

        // Verify that the lead belongs to this organization, if changing it.
        if (leadId != null) {
            const lead = await prisma.lead.findFirst({
                where: {
                    id: leadId,
                    organizationId: user.organizationId,
                },
                select: { id: true },
            });

            if (!lead) {
                return NextResponse.json(
                    {
                        ok: false,
                        message: "Invalid lead",
                    },
                    { status: 400 }
                );
            }
        }

        const stageChanged =
            pipelineStageId !== undefined && pipelineStageId !== existingDeal.pipelineStageId;

        // Custom fields are edited one at a time (like every other field here),
        // so only the submitted keys are validated and merged into what's there.
        let customFields: Prisma.InputJsonObject | undefined;

        if (submittedCustomFields) {
            const definitions = await prisma.customFieldDefinition.findMany({
                where: { organizationId: user.organizationId, entity: "deal" },
            });

            const result = validateCustomFieldValues(definitions, submittedCustomFields, { partial: true });

            if (!result.ok) {
                return NextResponse.json(
                    { ok: false, message: "Invalid custom field values", errors: result.errors },
                    { status: 400 }
                );
            }

            customFields = {
                ...(existingDeal.customFields as Prisma.InputJsonObject | null),
                ...result.data,
            } as Prisma.InputJsonObject;
        }

        // scope in the where too, so the write itself is checked; if the deal is
        // deleted or moved to another org in between, Prisma throws P2025 -> 404
        const updatedDeal = await prisma.deal.update({
            where: {
                id: id.data,
                ...dealScope(user),
            },
            data: {
                ...fields,
                pipelineStageId,
                leadId,
                updatedById: user.id,
                ...(customFields && { customFields }),
                ...(stageChanged && {
                    closedAt,
                    // a deal that's no longer lost has no reason to be
                    ...(!lost && { lostReason: null }),
                    timeline: {
                        create: {
                            userId: user.id,
                            type: "STAGE_CHANGED",
                            message: lost && fields.lostReason ? `Deal lost: ${fields.lostReason}` : "Deal moved to a new pipeline stage",
                        },
                    },
                }),
            },
            include: {
                lead: dealLeadSelect,
                assignedTo: {
                    select: { id: true, name: true, email: true },
                },
                pipelineStage: true,
            },
        });

        return NextResponse.json({
            ok: true,
            data: updatedDeal,
        });
    } catch (error) {
        return handleRouteError(error, "Update deal");
    }
}

export async function DELETE(req: NextRequest, { params }: Params) {
    try {
        const user = await requirePermission("deal:delete");

        const id = idParamSchema.safeParse((await params).id);

        if (!id.success) {
            return validationError(id.error);
        }

        // One query that checks the scope and deletes, so there's no gap for a race
        const { count } = await prisma.deal.deleteMany({
            where: {
                id: id.data,
                ...dealScope(user),
            },
        });

        if (count === 0) {
            return dealNotFound();
        }

        return NextResponse.json({
            ok: true,
            message: "Deal deleted successfully",
        });
    } catch (error) {
        return handleRouteError(error, "Delete deal");
    }
}
