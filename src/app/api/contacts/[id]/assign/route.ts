import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { hasPermission, requirePermission } from "@/lib/auth/requirePermission";
import { dbIdSchema, idParamSchema } from "@/lib/validations/common";
import { handleRouteError, parseBody, validationError } from "@/lib/api/http";

const assignContactSchema = z.object({
    assignedToId: dbIdSchema.nullable(),
});

const assignedToSelect = {
    select: {
        id: true,
        name: true,
        email: true,
    },
};

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const user = await requirePermission("contact:update");

        // Handing contacts out is a manager action, not something an agent does to their own contacts
        if (!hasPermission(user, "contact:all")) {
            throw new Error("FORBIDDEN");
        }

        const id = idParamSchema.safeParse((await params).id);

        if (!id.success) {
            return validationError(id.error);
        }

        const body = await parseBody(req, assignContactSchema);

        if (!body.success) {
            return body.response;
        }

        const { assignedToId } = body.data;

        // Check that the contact belongs to the current organization
        const contact = await prisma.contact.findFirst({
            where: {
                id: id.data,
                organizationId: user.organizationId,
            },
            include: {
                assignedTo: assignedToSelect,
            },
        });

        if (!contact) {
            return NextResponse.json(
                {
                    ok: false,
                    message: "Contact not found",
                },
                { status: 404 }
            );
        }

        // Nothing changes, so don't write an update
        if (contact.assignedToId === assignedToId) {
            return NextResponse.json({
                ok: true,
                message: "Contact is already assigned this way",
                data: contact,
            });
        }

        // If assigning to an agent, verify that the agent
        // belongs to the same organization.
        let agentName: string | null = null;

        if (assignedToId !== null) {
            const agent = await prisma.user.findFirst({
                where: {
                    id: assignedToId,
                    organizationId: user.organizationId,
                },
                select: { name: true },
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

        // the no-change case returned early, so only these three remain
        const timelineEntry =
            assignedToId === null
                ? { type: "UNASSIGNED", message: "Contact unassigned" }
                : contact.assignedToId === null
                    ? { type: "ASSIGNED", message: `Contact assigned to ${agentName}` }
                    : { type: "REASSIGNED", message: `Contact reassigned to ${agentName}` };

        // Update + timeline entry in one query (nested create), so no $transaction needed
        const updatedContact = await prisma.contact.update({
            where: {
                id: contact.id,
                organizationId: user.organizationId,
            },
            data: {
                assignedToId,
                timeline: {
                    create: {
                        userId: user.id,
                        ...timelineEntry,
                    },
                },
            },
            include: {
                assignedTo: assignedToSelect,
            },
        });

        return NextResponse.json({
            ok: true,
            message:
                assignedToId === null
                    ? "Contact unassigned successfully"
                    : "Contact assigned successfully",
            data: updatedContact,
        });
    } catch (error) {
        return handleRouteError(error, "Assign contact");
    }
}
