import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { hasPermission, requirePermission } from "@/lib/auth/requirePermission";
import { dbIdSchema, idParamSchema } from "@/lib/validations/common";
import { handleRouteError, parseBody, validationError } from "@/lib/api/http";
import { firstName, notify } from "@/lib/realtime/notify";

const assignLeadSchema = z.object({
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
        const user = await requirePermission("lead:update");

        // Handing leads out is a manager action, not something an agent does to their own leads
        if (!hasPermission(user, "lead:all")) {
            throw new Error("FORBIDDEN");
        }

        const id = idParamSchema.safeParse((await params).id);

        if (!id.success) {
            return validationError(id.error);
        }

        const body = await parseBody(req, assignLeadSchema);

        if (!body.success) {
            return body.response;
        }

        const { assignedToId } = body.data;

        // Check that the lead belongs to the current organization
        const lead = await prisma.lead.findFirst({
            where: {
                id: id.data,
                organizationId: user.organizationId,
            },
            include: {
                assignedTo: assignedToSelect,
            },
        });

        if (!lead) {
            return NextResponse.json(
                {
                    ok: false,
                    message: "Lead not found",
                },
                { status: 404 }
            );
        }

        // Nothing changes, so don't write an update or a timeline entry
        if (lead.assignedToId === assignedToId) {
            return NextResponse.json({
                ok: true,
                message: "Lead is already assigned this way",
                data: lead,
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

        // the no-change case returned early, so only these three remain
        const timelineEntry =
            assignedToId === null
                ? { type: "UNASSIGNED", message: "Lead unassigned" }
                : lead.assignedToId === null
                    ? { type: "ASSIGNED", message: `Lead assigned to ${agentName}` }
                    : { type: "REASSIGNED", message: `Lead reassigned to ${agentName}` };

        // Update + timeline entry in one query (nested create), so no $transaction needed
        const updatedLead = await prisma.lead.update({
            where: {
                id: lead.id,
                organizationId: user.organizationId,
            },
            data: {
                assignedToId,
                updatedById: user.id,
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

        await notify([assignedToId], {
            organizationId: user.organizationId,
            actorId: user.id,
            type: "LEAD_ASSIGNED",
            title: `${firstName(user.name)} assigned you a lead`,
            body: lead.name,
            link: `/leads?open=${lead.id}`,
        });

        return NextResponse.json({
            ok: true,
            message:
                assignedToId === null
                    ? "Lead unassigned successfully"
                    : "Lead assigned successfully",
            data: updatedLead,
        });
    } catch (error) {
        return handleRouteError(error, "Assign lead");
    }
}
