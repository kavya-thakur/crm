import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";

// Mirrors prisma/seed.ts's permission set, just upserted on demand instead of
// via a separate seed run — keeps the test DB self-sufficient.
const PERMISSIONS = [
    "lead:create", "lead:read", "lead:update", "lead:delete", "lead:all",
    "deal:create", "deal:read", "deal:update", "deal:delete", "deal:all",
    "contact:create", "contact:read", "contact:update", "contact:delete", "contact:all",
    "task:all", "activity:all",
    "pipeline:manage",
    "lead-stages:manage",
    "lead-sources:manage",
    "lead-forms:manage",
    "custom-fields:manage",
    "email-templates:manage",
    "automations:manage",
];

let seeded = false;

async function ensurePermissionsSeeded() {
    if (seeded) return;

    for (const name of PERMISSIONS) {
        try {
            await prisma.permission.upsert({
                where: { name },
                update: {},
                create: { name, description: name },
            });
        } catch (error) {
            // Test files run as separate processes and race to seed the same
            // row; losing the race is fine, the permission exists either way.
            const isDuplicate = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
            if (!isDuplicate) throw error;
        }
    }

    seeded = true;
}

// A fresh org + role (with exactly the given permissions) + user, ready to
// pass straight to the getCurrentUser mock.
export async function createOrgWithUser(permissionNames: string[]) {
    await ensurePermissionsSeeded();

    const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const organization = await prisma.organization.create({
        data: { name: `Test Org ${unique}`, slug: `test-org-${unique}` },
    });

    const permissions = await prisma.permission.findMany({
        where: { name: { in: permissionNames } },
        select: { id: true },
    });

    const role = await prisma.role.create({
        data: {
            organizationId: organization.id,
            name: "Test Role",
            permissions: { create: permissions.map((permission) => ({ permissionId: permission.id })) },
        },
    });

    const user = await prisma.user.create({
        data: {
            organizationId: organization.id,
            roleId: role.id,
            name: "Test User",
            email: `test-${unique}@example.com`,
            passwordHash: "not-used-by-these-tests",
        },
        include: {
            organization: true,
            role: { include: { permissions: { include: { permission: true } } } },
        },
    });

    return { organization, user };
}

export async function createPipelineStage(organizationId: number, overrides: Partial<{ name: string; order: number }> = {}) {
    return prisma.pipelineStage.create({
        data: {
            organizationId,
            name: overrides.name ?? "Stage",
            order: overrides.order ?? 0,
        },
    });
}

export async function createLeadStage(
    organizationId: number,
    overrides: Partial<{ name: string; order: number; isConverted: boolean; isLost: boolean }> = {},
) {
    return prisma.leadStage.create({
        data: {
            organizationId,
            name: overrides.name ?? "Stage",
            order: overrides.order ?? 0,
            isConverted: overrides.isConverted ?? false,
            isLost: overrides.isLost ?? false,
        },
    });
}

export async function createLeadSource(organizationId: number, overrides: Partial<{ name: string; order: number }> = {}) {
    return prisma.leadSource.create({
        data: {
            organizationId,
            name: overrides.name ?? "Source",
            order: overrides.order ?? 0,
        },
    });
}

// Deletes everything hanging off an org, in FK order, so each test leaves no trace.
export async function cleanupOrg(organizationId: number) {
    await prisma.task.deleteMany({ where: { organizationId } });
    await prisma.scheduledActivity.deleteMany({ where: { organizationId } });
    await prisma.dealNote.deleteMany({ where: { deal: { organizationId } } });
    await prisma.dealTimeline.deleteMany({ where: { deal: { organizationId } } });
    await prisma.deal.deleteMany({ where: { organizationId } });
    await prisma.leadNote.deleteMany({ where: { lead: { organizationId } } });
    await prisma.leadTimeline.deleteMany({ where: { lead: { organizationId } } });
    await prisma.lead.deleteMany({ where: { organizationId } });
    await prisma.contactNote.deleteMany({ where: { contact: { organizationId } } });
    await prisma.contactTimeline.deleteMany({ where: { contact: { organizationId } } });
    await prisma.contact.deleteMany({ where: { organizationId } });
    await prisma.pipelineStage.deleteMany({ where: { organizationId } });
    await prisma.leadStage.deleteMany({ where: { organizationId } });
    await prisma.leadSource.deleteMany({ where: { organizationId } });
    await prisma.rolePermission.deleteMany({ where: { role: { organizationId } } });
    await prisma.user.deleteMany({ where: { organizationId } });
    await prisma.role.deleteMany({ where: { organizationId } });
    await prisma.organization.delete({ where: { id: organizationId } });
}
