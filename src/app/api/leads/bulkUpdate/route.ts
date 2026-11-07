import { NextRequest, NextResponse } from "next/server";
import { moveToCompany } from "@/lib/companies";
import { deleteToBin } from "@/lib/recycleBin";
import { z } from "zod";

import { prisma } from "@/lib/db/prisma";
import { hasPermission, leadScope, requirePermission } from "@/lib/auth/requirePermission";
import { dbIdSchema, optionalText } from "@/lib/validations/common";
import { handleRouteError, parseBody } from "@/lib/api/http";
import { mergeCustomFieldsSql, validateCustomFieldEdit } from "@/lib/settings/customFields";
import { bulkLeadChangesSchema } from "@/lib/validations/leads";
import { assignLeads, moveLeads } from "@/lib/jobs/bulkActions";
import { firstName, notify } from "@/lib/realtime/notify";
import { stageEvents, startAutomations } from "@/lib/automations/engine";

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
        // asked for when the stage is a lost one
        lostReason: optionalText(200),
    }),

    // the same value for one field (or custom field) on every selected lead
    z.object({
        action: z.literal("update"),
        leadIds: leadIdsSchema,
        changes: bulkLeadChangesSchema,
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
                name: true,
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

            // leads already assigned this way are skipped, so no duplicate timeline entries
            const changed = await prisma.$transaction((tx) => assignLeads(tx, user, leads, assignedToId === null ? null : { id: assignedToId, name: agentName! }));

            if (changed.length > 0) {
                const [only] = changed;
                await notify([assignedToId], {
                    organizationId: user.organizationId,
                    actorId: user.id,
                    type: "LEAD_ASSIGNED",
                    title: `${firstName(user.name)} assigned you ${changed.length === 1 ? "a lead" : `${changed.length} leads`}`,
                    body: changed.length === 1 ? only.name : null,
                    link: changed.length === 1 ? `/leads?open=${only.id}` : "/leads",
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
                select: { id: true, name: true, isLost: true },
            });

            if (!stage) {
                return NextResponse.json(
                    { ok: false, message: "Invalid lead stage" },
                    { status: 400 }
                );
            }

            const changed = await prisma.$transaction((tx) => moveLeads(tx, user, leads, stage, data.lostReason));
            await startAutomations(...stageEvents("lead", user.organizationId, changed.map((lead) => lead.id), stage));

            return NextResponse.json({
                ok: true,
                message: `${changed.length} leads updated successfully`,
                affected: changed.length,
            });
        }

        /*
         * UPDATE: the same value for one field (or custom field) on every selected lead
         */
        if (data.action === "update") {
            const { customFields: submittedCustomFields, ...fields } = data.changes;

            // a source has to be one of this organization's
            if (fields.sourceId) {
                const source = await prisma.leadSource.findFirst({
                    where: { id: fields.sourceId, organizationId: user.organizationId },
                    select: { id: true },
                });

                if (!source) {
                    return NextResponse.json({ ok: false, message: "Invalid lead source" }, { status: 400 });
                }
            }

            let customFields: Record<string, unknown> | undefined;

            if (submittedCustomFields) {
                const result = await validateCustomFieldEdit(user.organizationId, "lead", submittedCustomFields);

                if (!result.ok) {
                    return NextResponse.json(
                        { ok: false, message: "Invalid custom field values", errors: result.errors },
                        { status: 400 }
                    );
                }

                customFields = result.data;
            }

            // one statement for the plain fields and one for the custom fields, however many
            // leads are selected; together, so either all of them change or none do
            await prisma.$transaction(async (tx) => {
                if (Object.keys(fields).length > 0) {
                    await tx.lead.updateMany({
                        where: { id: { in: leadIds }, organizationId: user.organizationId },
                        data: { ...fields, updatedById: user.id },
                    });
                }

                if (customFields) {
                    await tx.$executeRaw(mergeCustomFieldsSql("Lead", leadIds, user, customFields));
                }

                // their contacts move to that company too, so they show on the Companies page
                if (fields.companyName !== undefined) {
                    await moveToCompany(tx, user.organizationId, leadIds, fields.companyName);
                }
            });

            return NextResponse.json({
                ok: true,
                message: `${leadIds.length} leads updated successfully`,
                affected: leadIds.length,
            });
        }

        /*
         * DELETE
         */
        // into the recycle bin first (a copy of each, with its history), all in one transaction
        const count = await prisma.$transaction((tx) => deleteToBin(tx, user, "lead", { id: { in: leadIds }, ...leadScope(user) }));

        return NextResponse.json({
            ok: true,
            message: `${count} leads moved to the recycle bin`,
            affected: count,
        });
    } catch (error) {
        return handleRouteError(error, "Bulk lead operation");
    }
}
