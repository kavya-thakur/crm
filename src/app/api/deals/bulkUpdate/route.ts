import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db/prisma";
import { dealScope, hasPermission, requirePermission } from "@/lib/auth/requirePermission";
import { dbIdSchema, optionalText } from "@/lib/validations/common";
import { handleRouteError, parseBody } from "@/lib/api/http";
import { mergeCustomFieldsSql, validateCustomFieldEdit } from "@/lib/settings/customFields";
import { bulkDealChangesSchema } from "@/lib/validations/deals";
import { firstName, notify } from "@/lib/realtime/notify";
import { assignDeals, moveDeals } from "@/lib/jobs/bulkActions";
import { stageEvents, startAutomations } from "@/lib/automations/engine";

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
        // asked for when the stage is a lost one
        lostReason: optionalText(200),
    }),

    // the same value for one field (or custom field) on every selected deal
    z.object({
        action: z.literal("update"),
        dealIds: dealIdsSchema,
        changes: bulkDealChangesSchema,
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
                title: true,
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

            // deals already assigned this way are skipped, so no duplicate timeline entries
            const changed = await prisma.$transaction((tx) => assignDeals(tx, user, deals, assignedToId === null ? null : { id: assignedToId, name: agentName! }));

            if (changed.length > 0) {
                const [only] = changed;
                await notify([assignedToId], {
                    organizationId: user.organizationId,
                    actorId: user.id,
                    type: "DEAL_ASSIGNED",
                    title: `${firstName(user.name)} assigned you ${changed.length === 1 ? "a deal" : `${changed.length} deals`}`,
                    body: changed.length === 1 ? only.title : null,
                    link: changed.length === 1 ? `/deals?open=${only.id}` : "/deals",
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

            const changed = await prisma.$transaction((tx) => moveDeals(tx, user, deals, stage, data.lostReason));
            await startAutomations(...stageEvents("deal", user.organizationId, changed.map((deal) => deal.id), stage));

            return NextResponse.json({
                ok: true,
                message: `${changed.length} deals updated successfully`,
                affected: changed.length,
            });
        }

        /*
         * UPDATE: the same value for one field (or custom field) on every selected deal
         */
        if (data.action === "update") {
            const { customFields: submittedCustomFields, ...fields } = data.changes;

            let customFields: Record<string, unknown> | undefined;

            if (submittedCustomFields) {
                const result = await validateCustomFieldEdit(user.organizationId, "deal", submittedCustomFields);

                if (!result.ok) {
                    return NextResponse.json(
                        { ok: false, message: "Invalid custom field values", errors: result.errors },
                        { status: 400 }
                    );
                }

                customFields = result.data;
            }

            // one statement for the plain fields and one for the custom fields, however many
            // deals are selected; together, so either all of them change or none do
            await prisma.$transaction(async (tx) => {
                if (Object.keys(fields).length > 0) {
                    await tx.deal.updateMany({
                        where: { id: { in: dealIds }, organizationId: user.organizationId },
                        data: { ...fields, updatedById: user.id },
                    });
                }

                if (customFields) {
                    await tx.$executeRaw(mergeCustomFieldsSql("Deal", dealIds, user, customFields));
                }
            });

            return NextResponse.json({
                ok: true,
                message: `${dealIds.length} deals updated successfully`,
                affected: dealIds.length,
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
