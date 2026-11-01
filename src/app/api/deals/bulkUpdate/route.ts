import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db/prisma";
import { dealScope, hasPermission, requirePermission } from "@/lib/auth/requirePermission";
import { dbIdSchema } from "@/lib/validations/common";
import { handleRouteError, parseBody } from "@/lib/api/http";

const dealIdsSchema = z.array(dbIdSchema).min(1).max(500);

const bulkDealSchema = z.discriminatedUnion("action", [
    z.object({
        action: z.literal("assign"),
        dealIds: dealIdsSchema,
        assignedToId: dbIdSchema.nullable(),
    }),

    z.object({
        action: z.literal("stage"),
        dealIds: dealIdsSchema,
        pipelineStageId: dbIdSchema,
    }),

    z.object({
        action: z.literal("delete"),
        dealIds: dealIdsSchema,
    }),
]);

export async function PATCH(req: NextRequest) {
    try {
        const body = await parseBody(req, bulkDealSchema);

        if (!body.success) {
            return body.response;
        }

        const data = body.data;

        // Deleting needs deal:delete, same as DELETE /api/deals/:id
        const user = await requirePermission(
            data.action === "delete" ? "deal:delete" : "deal:update"
        );

        // Same rule as POST /api/deals/:id/assign
        if (data.action === "assign" && !hasPermission(user, "deal:all")) {
            throw new Error("FORBIDDEN");
        }

        // Remove duplicate IDs
        const dealIds = [...new Set(data.dealIds)];

        // Verify all selected deals are ones this user can see
        const deals = await prisma.deal.findMany({
            where: {
                id: {
                    in: dealIds,
                },
                ...dealScope(user),
            },
            select: {
                id: true,
                assignedToId: true,
                pipelineStageId: true,
            },
        });

        if (deals.length !== dealIds.length) {
            const found = new Set(deals.map((deal) => deal.id));

            return NextResponse.json(
                {
                    ok: false,
                    message: "One or more deals were not found in your organization",
                    // tells the client exactly which ids to drop from the selection
                    notFoundIds: dealIds.filter((id) => !found.has(id)),
                },
                { status: 404 }
            );
        }

        /*
         * ASSIGN
         */
        if (data.action === "assign") {
            const { assignedToId } = data;

            let agentName: string | null = null;

            if (assignedToId !== null) {
                const agent = await prisma.user.findFirst({
                    where: {
                        id: assignedToId,
                        organizationId: user.organizationId,
                    },
                    select: {
                        name: true,
                    },
                });

                if (!agent) {
                    return NextResponse.json(
                        {
                            ok: false,
                            message: "Agent not found in your organization",
                        },
                        { status: 404 }
                    );
                }

                agentName = agent.name;
            }

            // Deals already assigned this way are skipped, so no duplicate timeline entries
            const changed = deals.filter((deal) => deal.assignedToId !== assignedToId);

            if (changed.length > 0) {
                await prisma.$transaction(async (tx) => {
                    await tx.deal.updateMany({
                        where: {
                            id: {
                                in: changed.map((deal) => deal.id),
                            },
                            organizationId: user.organizationId,
                        },
                        data: {
                            assignedToId,
                        },
                    });

                    await tx.dealTimeline.createMany({
                        data: changed.map((deal) => ({
                            dealId: deal.id,
                            userId: user.id,
                            type:
                                assignedToId === null
                                    ? "UNASSIGNED"
                                    : deal.assignedToId === null
                                        ? "ASSIGNED"
                                        : "REASSIGNED",
                            message:
                                assignedToId === null
                                    ? "Deal unassigned"
                                    : deal.assignedToId === null
                                        ? `Deal assigned to ${agentName}`
                                        : `Deal reassigned to ${agentName}`,
                        })),
                    });
                });
            }

            return NextResponse.json({
                ok: true,
                message: `${changed.length} deals updated successfully`,
                affected: changed.length,
            });
        }

        /*
         * STAGE
         */
        if (data.action === "stage") {
            // Verify that the pipeline stage belongs to this organization.
            const stage = await prisma.pipelineStage.findFirst({
                where: {
                    id: data.pipelineStageId,
                    organizationId: user.organizationId,
                },
                select: { id: true },
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

            const changed = deals.filter(
                (deal) => deal.pipelineStageId !== data.pipelineStageId
            );

            if (changed.length > 0) {
                await prisma.$transaction(async (tx) => {
                    await tx.deal.updateMany({
                        where: {
                            id: {
                                in: changed.map((deal) => deal.id),
                            },
                            organizationId: user.organizationId,
                        },
                        data: {
                            pipelineStageId: data.pipelineStageId,
                        },
                    });

                    await tx.dealTimeline.createMany({
                        data: changed.map((deal) => ({
                            dealId: deal.id,
                            userId: user.id,
                            type: "STAGE_CHANGED",
                            message: "Deal moved to a new pipeline stage",
                        })),
                    });
                });
            }

            return NextResponse.json({
                ok: true,
                message: `${changed.length} deals updated successfully`,
                affected: changed.length,
            });
        }

        /*
         * DELETE
         */
        // a single deleteMany is already atomic, so no $transaction needed
        const { count } = await prisma.deal.deleteMany({
            where: {
                id: {
                    in: dealIds,
                },
                ...dealScope(user),
            },
        });

        return NextResponse.json({
            ok: true,
            message: `${count} deals deleted successfully`,
            affected: count,
        });
    } catch (error) {
        return handleRouteError(error, "Bulk deal operation");
    }
}
