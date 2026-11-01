import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db/prisma";
import { hasPermission, leadScope, requirePermission } from "@/lib/auth/requirePermission";
import { dbIdSchema } from "@/lib/validations/common";
import { handleRouteError, parseBody } from "@/lib/api/http";

const leadIdsSchema = z.array(dbIdSchema).min(1).max(500);

const bulkLeadSchema = z.discriminatedUnion("action", [
    z.object({
        action: z.literal("assign"),
        leadIds: leadIdsSchema,
        assignedToId: dbIdSchema.nullable(),
    }),

    z.object({
        action: z.literal("stage"),
        leadIds: leadIdsSchema,
        stageId: dbIdSchema,
    }),

    z.object({
        action: z.literal("delete"),
        leadIds: leadIdsSchema,
    }),
]);

export async function PATCH(req: NextRequest) {
    try {
        const body = await parseBody(req, bulkLeadSchema);

        if (!body.success) {
            return body.response;
        }

        const data = body.data;

        // Deleting needs lead:delete, same as DELETE /api/leads/:id
        const user = await requirePermission(
            data.action === "delete" ? "lead:delete" : "lead:update"
        );

        // Same rule as POST /api/leads/:id/assign
        if (data.action === "assign" && !hasPermission(user, "lead:all")) {
            throw new Error("FORBIDDEN");
        }

        // Remove duplicate IDs
        const leadIds = [...new Set(data.leadIds)];

        // Verify all selected leads are ones this user can see
        const leads = await prisma.lead.findMany({
            where: {
                id: {
                    in: leadIds,
                },
                ...leadScope(user),
            },
            select: {
                id: true,
                assignedToId: true,
                stageId: true,
            },
        });

        if (leads.length !== leadIds.length) {
            const found = new Set(leads.map((lead) => lead.id));

            return NextResponse.json(
                {
                    ok: false,
                    message: "One or more leads were not found in your organization",
                    // tells the client exactly which ids to drop from the selection
                    notFoundIds: leadIds.filter((id) => !found.has(id)),
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

            // Leads already assigned this way are skipped, so no duplicate timeline entries
            const changed = leads.filter((lead) => lead.assignedToId !== assignedToId);

            if (changed.length > 0) {
                await prisma.$transaction(async (tx) => {
                    await tx.lead.updateMany({
                        where: {
                            id: {
                                in: changed.map((lead) => lead.id),
                            },
                            organizationId: user.organizationId,
                        },
                        data: {
                            assignedToId,
                        },
                    });

                    await tx.leadTimeline.createMany({
                        data: changed.map((lead) => ({
                            leadId: lead.id,
                            userId: user.id,
                            type:
                                assignedToId === null
                                    ? "UNASSIGNED"
                                    : lead.assignedToId === null
                                        ? "ASSIGNED"
                                        : "REASSIGNED",
                            message:
                                assignedToId === null
                                    ? "Lead unassigned"
                                    : lead.assignedToId === null
                                        ? `Lead assigned to ${agentName}`
                                        : `Lead reassigned to ${agentName}`,
                        })),
                    });
                });
            }

            return NextResponse.json({
                ok: true,
                message: `${changed.length} leads updated successfully`,
                affected: changed.length,
            });
        }

        /*
         * STAGE
         */
        if (data.action === "stage") {
            const stage = await prisma.leadStage.findFirst({
                where: { id: data.stageId, organizationId: user.organizationId },
                select: { id: true, name: true },
            });

            if (!stage) {
                return NextResponse.json(
                    { ok: false, message: "Invalid lead stage" },
                    { status: 400 }
                );
            }

            const stageNames = new Map(
                (
                    await prisma.leadStage.findMany({
                        where: { organizationId: user.organizationId },
                        select: { id: true, name: true },
                    })
                ).map((s) => [s.id, s.name])
            );

            const changed = leads.filter((lead) => lead.stageId !== stage.id);

            if (changed.length > 0) {
                await prisma.$transaction(async (tx) => {
                    await tx.lead.updateMany({
                        where: {
                            id: {
                                in: changed.map((lead) => lead.id),
                            },
                            ...leadScope(user),
                        },
                        data: {
                            stageId: stage.id,
                        },
                    });

                    await tx.leadTimeline.createMany({
                        data: changed.map((lead) => ({
                            leadId: lead.id,
                            userId: user.id,
                            type: "STATUS_CHANGED",
                            message: `Lead stage changed from ${stageNames.get(lead.stageId)} to ${stage.name}`,
                        })),
                    });
                });
            }

            return NextResponse.json({
                ok: true,
                message: `${changed.length} leads updated successfully`,
                affected: changed.length,
            });
        }

        /*
         * DELETE
         */
        // a single deleteMany is already atomic, so no $transaction needed
        const { count } = await prisma.lead.deleteMany({
            where: {
                id: {
                    in: leadIds,
                },
                ...leadScope(user),
            },
        });

        return NextResponse.json({
            ok: true,
            message: `${count} leads deleted successfully`,
            affected: count,
        });
    } catch (error) {
        return handleRouteError(error, "Bulk lead operation");
    }
}
