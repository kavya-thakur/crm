import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/generated/prisma/client";
import { findManageableRole, requirePermission } from "@/lib/auth/requirePermission";
import { idParamSchema } from "@/lib/validations/common";
import { updateAgentSchema } from "@/lib/validations/agents";
import { handleRouteError, parseBody, validationError } from "@/lib/api/http";
import { assertNotDemo } from "@/lib/demo/workspace";
import { isRootAdmin, isSiteAdmin } from "@/lib/auth/siteAdmin";

type Params = { params: Promise<{ id: string }> };

// Never select passwordHash into a response
const agentSelect = {
    id: true,
    name: true,
    email: true,
    createdAt: true,
    updatedAt: true,
    role: { select: { id: true, name: true } },
    // Members shows the owner, and who the owner lets "Log in as" teammates
    isOwner: true,
    canLogInAs: true,
} satisfies Prisma.UserSelect;

/**
 * Two admins changing each other at the same moment (each demoting or removing the other): each
 * was allowed when it was checked, but only the first may go through. Both people's rows are locked
 * (always in id order, so the two requests can't wait on each other forever) and the second request,
 * once it gets them, finds things changed and is refused. Run inside the transaction that writes.
 */
async function lockBoth(tx: Prisma.TransactionClient, actor: { id: number; roleId: number }, target: { id: number; roleId: number }) {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id IN (${actor.id}, ${target.id}) ORDER BY id FOR UPDATE`;
    const now = await tx.user.findMany({ where: { id: { in: [actor.id, target.id] } }, select: { id: true, roleId: true } });
    const roleOf = (id: number) => now.find((person) => person.id === id)?.roleId;
    // the one doing it was demoted or removed meanwhile, or the other person's role changed since the check
    if (roleOf(actor.id) !== actor.roleId || roleOf(target.id) !== target.roleId) throw new Error("FORBIDDEN");
}

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
        // the demo workspace stays the same for every visitor
        assertNotDemo(user);

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
            select: { id: true, roleId: true, email: true, isOwner: true, isSiteAdmin: true },
        });

        if (!agent) {
            return agentNotFound();
        }

        // The owner's account is the owner's alone: an admin changing its email (then "Forgot
        // password") or its role would take the workspace, and its billing, from them
        if (agent.isOwner && agent.id !== user.id) {
            return NextResponse.json({ ok: false, message: "Only the owner can change the owner's account" }, { status: 403 });
        }

        // 403 if the agent's role is stronger than yours (a manager can't edit an admin)
        await findManageableRole(user, agent.roleId);

        const emailChanged = email !== undefined && email !== agent.email;
        if (emailChanged) {
            // a site admin's email is their key to every workspace: only they change it
            if (isSiteAdmin(agent) && agent.id !== user.id) {
                return NextResponse.json({ ok: false, message: "Only they can change their own email" }, { status: 403 });
            }
            // and an email in SITE_ADMIN_EMAILS would make this person a site admin
            if (isRootAdmin({ email })) {
                return NextResponse.json({ ok: false, message: "This email can't be used for a team member" }, { status: 403 });
            }
        }

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
        const updatedAgent = await prisma.$transaction(async (tx) => {
            if (roleId !== undefined && roleId !== agent.roleId) await lockBoth(tx, user, agent);
            return tx.user.update({
                where: { id: agent.id, organizationId: user.organizationId },
                data: { name, email, roleId },
                select: agentSelect,
            });
        });
        // a reset link sent to the old address stops working
        if (emailChanged) await prisma.passwordReset.deleteMany({ where: { userId: agent.id } });

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
        // the demo workspace stays the same for every visitor
        assertNotDemo(user);

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
            select: { id: true, roleId: true, isOwner: true, _count: { select: { leadTimeline: true } } },
        });

        if (!agent) {
            return agentNotFound();
        }

        // without its owner nobody can pay for the workspace or run it: never deleted from here
        if (agent.isOwner) {
            return NextResponse.json({ ok: false, message: "The workspace owner can't be removed" }, { status: 403 });
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
        await prisma.$transaction(async (tx) => {
            await lockBoth(tx, user, agent);
            await tx.user.delete({ where: { id: agent.id, organizationId: user.organizationId } });
        });

        return NextResponse.json({
            ok: true,
            message: "Agent deleted successfully",
        });
    } catch (error) {
        return handleRouteError(error, "Delete agent");
    }
}
