import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/generated/prisma/client";
import { findManageableRole, requirePermission } from "@/lib/auth/requirePermission";
import { idParamSchema } from "@/lib/validations/common";
import { updateAgentSchema } from "@/lib/validations/agents";
import { handleRouteError, parseBody, validationError } from "@/lib/api/http";

type Params = { params: Promise<{ id: string }> };

// Never select passwordHash into a response
const agentSelect = {
    id: true,
    name: true,
    email: true,
    createdAt: true,
    updatedAt: true,
    role: { select: { id: true, name: true } },
} satisfies Prisma.UserSelect;

function agentNotFound() {
    return NextResponse.json(
        { ok: false, message: "Agent not found" },
        { status: 404 }
    );
}

export async function GET(req: NextRequest, { params }: Params) {
    try {
        const user = await requirePermission("user:read");

        const id = idParamSchema.safeParse((await params).id);

        if (!id.success) {
            return validationError(id.error);
        }

        const agent = await prisma.user.findFirst({
            where: { id: id.data, organizationId: user.organizationId },
            select: agentSelect,
        });

        if (!agent) {
            return agentNotFound();
        }

        return NextResponse.json({
            ok: true,
            data: agent,
        });
    } catch (error) {
        return handleRouteError(error, "Get agent");
    }
}

export async function PATCH(req: NextRequest, { params }: Params) {
    try {
        const user = await requirePermission("user:update");

        const id = idParamSchema.safeParse((await params).id);

        if (!id.success) {
            return validationError(id.error);
        }

        const body = await parseBody(req, updateAgentSchema);

        if (!body.success) {
            return body.response;
        }

        const { name, email, roleId } = body.data;

        const agent = await prisma.user.findFirst({
            where: { id: id.data, organizationId: user.organizationId },
            select: { id: true, roleId: true },
        });

        if (!agent) {
            return agentNotFound();
        }

        // 403 if the agent's role is stronger than yours (a manager can't edit an admin)
        await findManageableRole(user, agent.roleId);

        if (roleId !== undefined && roleId !== agent.roleId) {
            // Demoting yourself could leave the org with nobody able to manage agents
            if (agent.id === user.id) {
                return NextResponse.json(
                    { ok: false, message: "You cannot change your own role" },
                    { status: 400 }
                );
            }

            if (!(await findManageableRole(user, roleId))) {
                return NextResponse.json(
                    { ok: false, message: "Role not found in your organization" },
                    { status: 404 }
                );
            }
        }

        if (email !== undefined) {
            const existingUser = await prisma.user.findFirst({
                where: { email, id: { not: agent.id } },
                select: { id: true },
            });

            if (existingUser) {
                return NextResponse.json(
                    { ok: false, message: "Email is already in use" },
                    { status: 409 }
                );
            }
        }

        // undefined fields are skipped by Prisma; org in the where keeps the write tenant-scoped
        const updatedAgent = await prisma.user.update({
            where: { id: agent.id, organizationId: user.organizationId },
            data: { name, email, roleId },
            select: agentSelect,
        });

        return NextResponse.json({
            ok: true,
            message: "Agent updated successfully",
            data: updatedAgent,
        });
    } catch (error) {
        return handleRouteError(error, "Update agent");
    }
}

export async function DELETE(req: NextRequest, { params }: Params) {
    try {
        const user = await requirePermission("user:delete");

        const id = idParamSchema.safeParse((await params).id);

        if (!id.success) {
            return validationError(id.error);
        }

        if (id.data === user.id) {
            return NextResponse.json(
                { ok: false, message: "You cannot delete your own account" },
                { status: 400 }
            );
        }

        const agent = await prisma.user.findFirst({
            where: { id: id.data, organizationId: user.organizationId },
            select: { id: true, roleId: true, _count: { select: { leadTimeline: true } } },
        });

        if (!agent) {
            return agentNotFound();
        }

        // 403 if the agent's role is stronger than yours (a manager can't delete an admin)
        await findManageableRole(user, agent.roleId);

        // LeadTimeline.userId is required with no cascade: deleting would either fail
        // or wipe the lead history this agent wrote
        if (agent._count.leadTimeline > 0) {
            return NextResponse.json(
                {
                    ok: false,
                    message: "This agent has lead timeline history and cannot be deleted",
                },
                { status: 409 }
            );
        }

        // Their assigned leads become unassigned (Lead.assignedTo is optional -> SET NULL)
        await prisma.user.delete({
            where: { id: agent.id, organizationId: user.organizationId },
        });

        return NextResponse.json({
            ok: true,
            message: "Agent deleted successfully",
        });
    } catch (error) {
        return handleRouteError(error, "Delete agent");
    }
}
