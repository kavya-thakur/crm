import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "./getCurrentUser";

export type CurrentUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

export function hasPermission(user: CurrentUser, permissionName: string) {
    return user.role.permissions.some(({ permission }) => permission.name === permissionName)
}

export async function requirePermission(permissionName: string) {
    const user = await getCurrentUser()
    if (!user) {
        throw new Error("UNAUTHORIZED")
    }
    if (!hasPermission(user, permissionName)) {
        throw new Error("FORBIDDEN")
    }
    return user
}

// Every leads query starts from this: lead:all sees the whole org, everyone else only
// the leads assigned to them. Leads outside it simply don't match, so routes answer 404
// and never confirm that the id exists.
export function leadScope(user: CurrentUser) {
    return {
        organizationId: user.organizationId,
        ...(!hasPermission(user, "lead:all") && { assignedToId: user.id }),
    }
}

// Same idea for deals: deal:all sees the whole org, everyone else only their own.
export function dealScope(user: CurrentUser) {
    return {
        organizationId: user.organizationId,
        ...(!hasPermission(user, "deal:all") && { assignedToId: user.id }),
    }
}

// Same idea for contacts: contact:all sees the whole org, everyone else only their own.
export function contactScope(user: CurrentUser) {
    return {
        organizationId: user.organizationId,
        ...(!hasPermission(user, "contact:all") && { assignedToId: user.id }),
    }
}

// You can only grant, change or take away access you hold yourself. Without this,
// role:update lets someone add any permission to their own role, and user:update
// lets them move an admin to a weaker role.
export function assertHoldsPermissions(user: CurrentUser, permissionIds: number[]) {
    const own = new Set(user.role.permissions.map(({ permissionId }) => permissionId))
    if (!permissionIds.every((id) => own.has(id))) {
        throw new Error("FORBIDDEN")
    }
}

// A role of the caller's org that they may assign, edit or delete (403 if it's stronger
// than theirs). null = no such role in this org.
export async function findManageableRole(user: CurrentUser, roleId: number) {
    const role = await prisma.role.findFirst({
        where: { id: roleId, organizationId: user.organizationId },
        select: { id: true, permissions: { select: { permissionId: true } } },
    })
    if (role) {
        assertHoldsPermissions(user, role.permissions.map(({ permissionId }) => permissionId))
    }
    return role
}
