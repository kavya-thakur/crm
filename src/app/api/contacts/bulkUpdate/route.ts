import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db/prisma";
import { contactScope, hasPermission, requirePermission } from "@/lib/auth/requirePermission";
import { dbIdSchema } from "@/lib/validations/common";
import { handleRouteError, parseBody } from "@/lib/api/http";

const contactIdsSchema = z.array(dbIdSchema).min(1).max(500);

const bulkContactSchema = z.discriminatedUnion("action", [
    z.object({
        action: z.literal("assign"),
        contactIds: contactIdsSchema,
        assignedToId: dbIdSchema.nullable(),
    }),

    z.object({
        action: z.literal("delete"),
        contactIds: contactIdsSchema,
    }),
]);

export async function PATCH(req: NextRequest) {
    try {
        const body = await parseBody(req, bulkContactSchema);

        if (!body.success) {
            return body.response;
        }

        const data = body.data;

        // Deleting needs contact:delete, same as DELETE /api/contacts/:id
        const user = await requirePermission(
            data.action === "delete" ? "contact:delete" : "contact:update"
        );

        // Same rule as POST /api/contacts/:id/assign
        if (data.action === "assign" && !hasPermission(user, "contact:all")) {
            throw new Error("FORBIDDEN");
        }

        // Remove duplicate IDs
        const contactIds = [...new Set(data.contactIds)];

        // Verify all selected contacts are ones this user can see
        const contacts = await prisma.contact.findMany({
            where: {
                id: {
                    in: contactIds,
                },
                ...contactScope(user),
            },
            select: {
                id: true,
                assignedToId: true,
            },
        });

        if (contacts.length !== contactIds.length) {
            const found = new Set(contacts.map((contact) => contact.id));

            return NextResponse.json(
                {
                    ok: false,
                    message: "One or more contacts were not found in your organization",
                    // tells the client exactly which ids to drop from the selection
                    notFoundIds: contactIds.filter((id) => !found.has(id)),
                },
                { status: 404 }
            );
        }

        /*
         * ASSIGN
         */
        if (data.action === "assign") {
            const { assignedToId } = data;

            if (assignedToId !== null) {
                const agent = await prisma.user.findFirst({
                    where: {
                        id: assignedToId,
                        organizationId: user.organizationId,
                    },
                    select: { id: true },
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
            }

            // Contacts already assigned this way are skipped
            const changed = contacts.filter((contact) => contact.assignedToId !== assignedToId);

            if (changed.length > 0) {
                await prisma.contact.updateMany({
                    where: {
                        id: {
                            in: changed.map((contact) => contact.id),
                        },
                        organizationId: user.organizationId,
                    },
                    data: {
                        assignedToId,
                    },
                });
            }

            return NextResponse.json({
                ok: true,
                message: `${changed.length} contacts updated successfully`,
                affected: changed.length,
            });
        }

        /*
         * DELETE
         */
        // a single deleteMany is already atomic, so no $transaction needed
        const { count } = await prisma.contact.deleteMany({
            where: {
                id: {
                    in: contactIds,
                },
                ...contactScope(user),
            },
        });

        return NextResponse.json({
            ok: true,
            message: `${count} contacts deleted successfully`,
            affected: count,
        });
    } catch (error) {
        return handleRouteError(error, "Bulk contact operation");
    }
}
