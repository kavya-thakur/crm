import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/generated/prisma/client";
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

// The person behind a background job (an import, a bulk delete), loaded the way a request
// would see them, so the job runs within what they may do *now*, not when they started it
export function userForJob(userId: number): Promise<CurrentUser | null> {
    return prisma.user.findUnique({
        where: { id: userId },
        include: { organization: true, role: { include: { permissions: { include: { permission: true } } } } },
    });
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

// The leads, deals and contacts someone can open, as filters on a task's or activity's
// linked record
function openableRecords(user: CurrentUser) {
    return [
        ...(hasPermission(user, "lead:read") ? [{ lead: leadScope(user) }] : []),
        ...(hasPermission(user, "deal:read") ? [{ deal: dealScope(user) }] : []),
        ...(hasPermission(user, "contact:read") ? [{ contact: contactScope(user) }] : []),
    ]
}

// Anyone can create a task, but task:all is needed to see everyone's. Without it you see
// the tasks assigned to you or made by you, plus every task on a record you can open, so
// a lead's Tasks tab still shows its whole history to the lead's owner.
export function taskScope(user: CurrentUser): Prisma.TaskWhereInput {
    if (hasPermission(user, "task:all")) {
        return { organizationId: user.organizationId }
    }
    return {
        organizationId: user.organizationId,
        OR: [{ assignedToId: user.id }, { createdById: user.id }, ...openableRecords(user)],
    }
}

// Same for calls and meetings, where being tagged as an attendee also makes it yours
export function activityScope(user: CurrentUser): Prisma.ScheduledActivityWhereInput {
    if (hasPermission(user, "activity:all")) {
        return { organizationId: user.organizationId }
    }
    return {
        organizationId: user.organizationId,
        OR: [{ assignedToId: user.id }, { createdById: user.id }, { attendees: { some: { id: user.id } } }, ...openableRecords(user)],
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
