import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/generated/prisma/client";
import {
    assertHoldsPermissions,
    findManageableRole,
    requirePermission,
} from "@/lib/auth/requirePermission";
import { escapeLike, idParamSchema } from "@/lib/validations/common";
import { updateRoleSchema } from "@/lib/validations/roles";
import { handleRouteError, parseBody, validationError } from "@/lib/api/http";
import { assertNotDemo } from "@/lib/demo/workspace";

type Params = { params: Promise<{ id: string }> };

const roleSelect = {
    id: true,
    name: true,
    createdAt: true,
    updatedAt: true,
    permissions: { select: { permission: { select: { id: true, name: true, description: true } } } },
    _count: { select: { users: true } },
} satisfies Prisma.RoleSelect;

function roleNotFound() {
    return NextResponse.json(
        { ok: false, message: "Role not found" },
        { status: 404 }
    );
}

export async function GET(req: NextRequest, { params }: Params) {
    try {
        const user = await requirePermission("role:read");

        const id = idParamSchema.safeParse((await params).id);

        if (!id.success) {
            return validationError(id.error);
        }

        const role = await prisma.role.findFirst({
            where: { id: id.data, organizationId: user.organizationId },
            select: roleSelect,
        });

        if (!role) {
            return roleNotFound();
        }

        return NextResponse.json({
            ok: true,
            data: role,
        });
    } catch (error) {
        return handleRouteError(error, "Get role");
    }
}

export async function PATCH(req: NextRequest, { params }: Params) {
    try {
        const user = await requirePermission("role:update");
        // the demo workspace stays the same for every visitor
        assertNotDemo(user);

        const id = idParamSchema.safeParse((await params).id);

        if (!id.success) {
            return validationError(id.error);
        }

        const body = await parseBody(req, updateRoleSchema);

        if (!body.success) {
            return body.response;
        }

        const { name, permissionIds } = body.data;

        const role = await findManageableRole(user, id.data);

        if (!role) {
            return roleNotFound();
        }

        if (permissionIds !== undefined) {
            // Removing role:update from your own role would lock you (and maybe everyone) out
            if (role.id === user.roleId) {
                return NextResponse.json(
                    { ok: false, message: "You cannot change the permissions of your own role" },
                    { status: 400 }
                );
            }

            assertHoldsPermissions(user, permissionIds);
        }

        if (name !== undefined) {
            const existingRole = await prisma.role.findFirst({
                where: {
                    organizationId: user.organizationId,
                    name: { equals: escapeLike(name), mode: "insensitive" },
                    id: { not: role.id },
                },
                select: { id: true },
            });

            if (existingRole) {
                return NextResponse.json(
                    { ok: false, message: "A role with this name already exists" },
                    { status: 409 }
                );
            }
        }

        // Nested writes run in one transaction: the old set is replaced, never half-applied
        const updatedRole = await prisma.role.update({
            where: { id: role.id, organizationId: user.organizationId },
            data: {
                name,
                ...(permissionIds !== undefined && {
                    permissions: {
                        deleteMany: {},
                        create: permissionIds.map((permissionId) => ({ permissionId })),
                    },
                }),
            },
            select: roleSelect,
        });

        return NextResponse.json({
            ok: true,
            message: "Role updated successfully",
            data: updatedRole,
        });
    } catch (error) {
        return handleRouteError(error, "Update role");
    }
}

export async function DELETE(req: NextRequest, { params }: Params) {
    try {
        const user = await requirePermission("role:delete");
        // the demo workspace stays the same for every visitor
        assertNotDemo(user);

        const id = idParamSchema.safeParse((await params).id);

        if (!id.success) {
            return validationError(id.error);
        }

        const role = await findManageableRole(user, id.data);

        if (!role) {
            return roleNotFound();
        }

        // User.roleId is required, so agents would be left without a role.
        // Also covers your own role, since you're one of its users.
        const userCount = await prisma.user.count({ where: { roleId: role.id } });

        if (userCount > 0) {
            return NextResponse.json(
                {
                    ok: false,
                    message: `This role is assigned to ${userCount} agent(s). Move them to another role first.`,
                },
                { status: 409 }
            );
        }

        // RolePermission rows go with it (onDelete: Cascade). If an agent was assigned
        // in between, the FK blocks this and handleRouteError returns 409.
        await prisma.role.delete({
            where: { id: role.id, organizationId: user.organizationId },
        });

        return NextResponse.json({
            ok: true,
            message: "Role deleted successfully",
        });
    } catch (error) {
        return handleRouteError(error, "Delete role");
    }
}
