import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/generated/prisma/client";
import { assertHoldsPermissions, requirePermission, withViewPermissions } from "@/lib/auth/requirePermission";
import { createRoleSchema } from "@/lib/validations/roles";
import { escapeLike } from "@/lib/validations/common";
import { handleRouteError, parseBody } from "@/lib/api/http";
import { assertNotDemo } from "@/lib/demo/workspace";

const roleSelect = {
    id: true,
    name: true,
    createdAt: true,
    updatedAt: true,
    permissions: { select: { permission: { select: { id: true, name: true, description: true } } } },
    _count: { select: { users: true } },
} satisfies Prisma.RoleSelect;

export async function GET() {
    try {
        const user = await requirePermission("role:read");

        // ponytail: no pagination, an org has a handful of roles; add it if that stops being true
        const roles = await prisma.role.findMany({
            where: { organizationId: user.organizationId },
            select: roleSelect,
            orderBy: { name: "asc" },
        });

        return NextResponse.json({
            ok: true,
            data: roles,
        });
    } catch (error) {
        return handleRouteError(error, "Get roles");
    }
}

export async function POST(req: NextRequest) {
    try {
        const user = await requirePermission("role:create");
        // the demo workspace stays the same for every visitor
        assertNotDemo(user);

        const body = await parseBody(req, createRoleSchema);

        if (!body.success) {
            return body.response;
        }

        // Create, Edit or Delete without View is no use: View comes with them
        const permissionIds = await withViewPermissions(body.data.permissionIds);
        const { name } = body.data;

        // Also proves every id exists: the caller's own permissions are real rows
        assertHoldsPermissions(user, permissionIds);

        // Case-insensitive, so "Sales" and "sales" can't both exist (the DB index is case-sensitive)
        const existingRole = await prisma.role.findFirst({
            where: {
                organizationId: user.organizationId,
                name: { equals: escapeLike(name), mode: "insensitive" },
            },
            select: { id: true },
        });

        if (existingRole) {
            return NextResponse.json(
                { ok: false, message: "A role with this name already exists" },
                { status: 409 }
            );
        }

        // Nested create: the role and its permission rows are saved in one transaction
        const role = await prisma.role.create({
            data: {
                name,
                organizationId: user.organizationId,
                permissions: {
                    create: permissionIds.map((permissionId) => ({ permissionId })),
                },
            },
            select: roleSelect,
        });

        return NextResponse.json(
            {
                ok: true,
                message: "Role created successfully",
                data: role,
            },
            { status: 201 }
        );
    } catch (error) {
        return handleRouteError(error, "Create role");
    }
}
