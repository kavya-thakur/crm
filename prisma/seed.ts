import "dotenv/config";
import { prisma } from "../src/lib/db/prisma";
import { createPipeline, DEFAULT_PIPELINE_NAME, DEFAULT_PIPELINE_STAGES } from "../src/lib/deals/stages";
import { DEFAULT_LEAD_STAGES } from "../src/lib/leads/stages";
import { DEFAULT_LEAD_SOURCES } from "../src/lib/leads/sources";

const resources = ["lead", "deal", "contact", "role", "user"];
const actions = ["create", "read", "update", "delete"];

async function main() {
    for (const resource of resources) {
        for (const action of actions) {
            const name = `${resource}:${action}`;
            // upsert so the seed can be re-run safely
            await prisma.permission.upsert({
                where: { name },
                update: {},
                create: { name, description: `Can ${action} ${resource}s` },
            });
        }
    }

    // Not resource:action shaped: widens the lead:* permissions from "my leads" to "all org leads"
    await prisma.permission.upsert({
        where: { name: "lead:all" },
        update: {},
        create: { name: "lead:all", description: "Can see and act on every lead, not just assigned ones" },
    });

    await prisma.permission.upsert({
        where: { name: "deal:all" },
        update: {},
        create: { name: "deal:all", description: "Can see and act on every deal, not just assigned ones" },
    });

    await prisma.permission.upsert({
        where: { name: "contact:all" },
        update: {},
        create: { name: "contact:all", description: "Can see and act on every contact, not just assigned ones" },
    });

    // Anyone can add tasks and calls/meetings; these let someone see and manage everyone's
    await prisma.permission.upsert({
        where: { name: "task:all" },
        update: {},
        create: { name: "task:all", description: "Can see and act on every task, not just their own" },
    });

    await prisma.permission.upsert({
        where: { name: "activity:all" },
        update: {},
        create: { name: "activity:all", description: "Can see and act on every call and meeting, not just their own" },
    });

    // One switch for the whole pipeline setup (create, edit, reorder, delete stages), not CRUD
    await prisma.permission.upsert({
        where: { name: "pipeline:manage" },
        update: {},
        create: { name: "pipeline:manage", description: "Can create, edit, reorder and delete pipeline stages" },
    });

    // Same, but for the leads board's stages
    await prisma.permission.upsert({
        where: { name: "lead-stages:manage" },
        update: {},
        create: { name: "lead-stages:manage", description: "Can create, edit, reorder and delete lead stages" },
    });

    // Same, but for the leads board's managed source list
    await prisma.permission.upsert({
        where: { name: "lead-sources:manage" },
        update: {},
        create: { name: "lead-sources:manage", description: "Can create, edit, reorder and delete lead sources" },
    });

    // Creating web forms that put leads straight into the workspace
    await prisma.permission.upsert({
        where: { name: "lead-forms:manage" },
        update: {},
        create: { name: "lead-forms:manage", description: "Can create, edit and delete web forms that capture leads" },
    });

    // The workspace's shared email templates (anyone who can see a lead can still email it)
    await prisma.permission.upsert({
        where: { name: "email-templates:manage" },
        update: {},
        create: { name: "email-templates:manage", description: "Can create, edit and delete the workspace's email templates" },
    });

    // "When a lead comes in, do this": rules that act for the team
    await prisma.permission.upsert({
        where: { name: "automations:manage" },
        update: {},
        create: { name: "automations:manage", description: "Can create, edit and turn off the workspace's automation rules" },
    });

    // One switch for defining custom fields, not CRUD on the fields themselves
    await prisma.permission.upsert({
        where: { name: "custom-fields:manage" },
        update: {},
        create: { name: "custom-fields:manage", description: "Can create, edit and delete custom field definitions" },
    });

    await prisma.permission.upsert({
        where: { name: "workspace:manage" },
        update: {},
        create: { name: "workspace:manage", description: "Can change the workspace's settings, like its currency" },
    });

    // Admin roles only get the permissions that existed when their org registered;
    // give them any added since. ponytail: matches by name, add Role.isSystem if admins can rename it
    const [permissions, adminRoles] = await Promise.all([
        prisma.permission.findMany({ select: { id: true } }),
        prisma.role.findMany({ where: { name: "Admin" }, select: { id: true } }),
    ]);

    await prisma.rolePermission.createMany({
        data: adminRoles.flatMap((role) =>
            permissions.map((permission) => ({ roleId: role.id, permissionId: permission.id }))
        ),
        skipDuplicates: true,
    });

    // Organizations registered before deals existed have no pipeline; give them the default one
    const orgsWithoutPipeline = await prisma.organization.findMany({
        where: { pipelines: { none: {} } },
        select: { id: true },
    });

    for (const org of orgsWithoutPipeline) {
        await createPipeline(prisma, { organizationId: org.id, name: DEFAULT_PIPELINE_NAME, order: 0 }, DEFAULT_PIPELINE_STAGES);
    }

    // Same backfill, for organizations with no lead stages yet
    const orgsWithoutLeadStages = await prisma.organization.findMany({
        where: { leadStages: { none: {} } },
        select: { id: true },
    });

    await prisma.leadStage.createMany({
        data: orgsWithoutLeadStages.flatMap((org) =>
            DEFAULT_LEAD_STAGES.map((stage) => ({ ...stage, organizationId: org.id }))
        ),
    });

    // Same backfill, for organizations with no lead sources yet
    const orgsWithoutLeadSources = await prisma.organization.findMany({
        where: { leadSources: { none: {} } },
        select: { id: true },
    });

    await prisma.leadSource.createMany({
        data: orgsWithoutLeadSources.flatMap((org) =>
            DEFAULT_LEAD_SOURCES.map((source) => ({ ...source, organizationId: org.id }))
        ),
    });

    console.log("Permissions:", (await prisma.permission.findMany()).map((p) => p.name));
}

main().finally(() => prisma.$disconnect());
