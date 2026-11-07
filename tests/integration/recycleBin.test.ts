import { afterEach, describe, expect, it, vi, type Mock } from "vitest";
import { NextRequest } from "next/server";

import { prisma } from "@/lib/db/prisma";
import { createOrgWithUser, createLeadStage, cleanupOrg } from "../helpers";

vi.mock("@/lib/auth/getCurrentUser", () => ({ getCurrentUser: vi.fn() }));
// a big restore is queued: catch it here, and run it by hand
const queued: unknown[][] = [];
vi.mock("@/lib/jobs/queues", () => ({ bulkQueue: () => ({ add: async (...args: unknown[]) => queued.push(args) }) }));

import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { DELETE as deleteLead } from "@/app/api/leads/[id]/route";
import { DELETE as deleteContact } from "@/app/api/contacts/[id]/route";
import { PATCH as bulkLeads } from "@/app/api/leads/bulkUpdate/route";
import { GET as listBin } from "@/app/api/recycle-bin/route";
import { DELETE as purge, POST as restore } from "@/app/api/recycle-bin/[id]/route";
import { PATCH as updateWorkspace } from "@/app/api/workspace/route";
import { POST as bulkBin } from "@/app/api/recycle-bin/bulk/route";
import { runBulkJob } from "@/lib/jobs/bulkActions";

const params = (id: number) => ({ params: Promise.resolve({ id: String(id) }) });
const request = (method: string, body?: object) =>
    new NextRequest("http://localhost", { method, headers: { "content-type": "application/json" }, ...(body && { body: JSON.stringify(body) }) });
const bin = async () => (await (await listBin(new NextRequest("http://localhost/api/recycle-bin"))).json()) as { data: { id: number; name: string; entity: string; daysLeft: number }[]; total: number };

const ALL = ["lead:read", "lead:update", "lead:delete", "lead:all", "deal:read", "contact:read", "contact:delete", "contact:all"];

describe("recycle bin", () => {
    const organizationIds: number[] = [];

    afterEach(async () => {
        for (const organizationId of organizationIds.splice(0)) await cleanupOrg(organizationId);
    });

    async function setUp(permissions = ALL) {
        const { organization, user } = await createOrgWithUser(permissions);
        organizationIds.push(organization.id);
        (getCurrentUser as Mock).mockResolvedValue(user);
        const org = { organizationId: organization.id };
        const [fresh, qualified] = await Promise.all([createLeadStage(organization.id, { name: "New", order: 0 }), createLeadStage(organization.id, { name: "Qualified", order: 1 })]);
        const pipeline = await prisma.pipelineStage.create({ data: { ...org, name: "Proposal" } });
        return { organization, user, org, fresh, qualified, pipeline };
    }

    it("deletes a lead with everything on it, and puts it all back under the same id", async () => {
        const { user, org, qualified, pipeline } = await setUp();
        const teammate = await prisma.user.create({ data: { ...org, roleId: user.roleId, name: "Rohan Iyer", email: `rohan-${org.organizationId}@example.com`, passwordHash: "x" } });
        const contact = await prisma.contact.create({ data: { ...org, name: "Rahul Mehta", phone: "+91 98000 11111" } });
        const lead = await prisma.lead.create({
            data: { ...org, name: "Rahul Mehta", phone: "+91 98000 11111", stageId: qualified.id, assignedToId: user.id, contactId: contact.id, customFields: { budget: "50k" } },
        });
        await prisma.leadTimeline.create({ data: { leadId: lead.id, userId: user.id, type: "CREATED", message: "Lead created" } });
        await prisma.leadNote.create({ data: { leadId: lead.id, authorId: teammate.id, body: "Wants a demo" } });
        await prisma.task.create({ data: { ...org, title: "Call Rahul", dueDate: new Date(), assignedToId: user.id, createdById: user.id, leadId: lead.id } });
        await prisma.scheduledActivity.create({
            data: { ...org, title: "Demo", type: "MEETING", scheduledAt: new Date(), assignedToId: user.id, createdById: user.id, leadId: lead.id, attendees: { connect: { id: teammate.id } } },
        });
        await prisma.email.create({ data: { ...org, leadId: lead.id, sentById: user.id, to: "rahul@acme.example", subject: "Hi", body: "Hi", status: "SENT", trackingToken: `t-${lead.id}` } });
        const deal = await prisma.deal.create({ data: { ...org, title: "Acme licence", pipelineStageId: pipeline.id, leadId: lead.id } });

        const res = await deleteLead(request("DELETE"), params(lead.id));
        expect(res.status).toBe(200);
        expect(await prisma.lead.findUnique({ where: { id: lead.id } })).toBeNull();
        // its deal stays, unlinked, and the cascade took its tasks
        expect((await prisma.deal.findUniqueOrThrow({ where: { id: deal.id } })).leadId).toBeNull();
        expect(await prisma.task.count({ where: { leadId: lead.id } })).toBe(0);

        const listed = await bin();
        expect(listed.total).toBe(1);
        expect(listed.data[0]).toMatchObject({ name: "Rahul Mehta", entity: "lead", daysLeft: 30 });

        expect((await restore(request("POST"), params(listed.data[0].id))).status).toBe(200);

        const back = await prisma.lead.findUniqueOrThrow({
            where: { id: lead.id },
            include: { timeline: { orderBy: { id: "asc" } }, notes: true, tasks: true, scheduledActivities: { include: { attendees: true } }, emails: true },
        });
        expect(back).toMatchObject({ name: "Rahul Mehta", stageId: qualified.id, assignedToId: user.id, contactId: contact.id, customFields: { budget: "50k" } });
        expect(back.timeline.map((entry) => entry.type)).toEqual(["CREATED", "RESTORED"]);
        expect(back.notes[0]).toMatchObject({ body: "Wants a demo", authorId: teammate.id });
        expect(back.tasks.map((task) => task.title)).toEqual(["Call Rahul"]);
        expect(back.scheduledActivities[0].attendees.map((person) => person.id)).toEqual([teammate.id]);
        expect(back.emails).toHaveLength(1);
        // the deal is linked back, and the bin is empty again
        expect((await prisma.deal.findUniqueOrThrow({ where: { id: deal.id } })).leadId).toBe(lead.id);
        expect((await bin()).total).toBe(0);
    });

    it("lets go of what's gone since, and won't make a second open lead for the same person", async () => {
        const { org, fresh, qualified } = await setUp();
        const lead = await prisma.lead.create({ data: { ...org, name: "Asha Rao", phone: "+91 98000 22222", stageId: qualified.id } });
        await deleteLead(request("DELETE"), params(lead.id));
        const [item] = (await bin()).data;

        // the same person came back as a new lead meanwhile
        const copy = await prisma.lead.create({ data: { ...org, name: "Asha R.", phone: "+91 98000 22222", stageId: fresh.id } });
        const refused = await restore(request("POST"), params(item.id));
        expect(refused.status).toBe(409);
        expect((await refused.json()).message).toContain("another open lead");

        // once that's gone, and its stage deleted too: back, in the first stage
        await prisma.lead.delete({ where: { id: copy.id } });
        await prisma.leadStage.delete({ where: { id: qualified.id } });
        expect((await restore(request("POST"), params(item.id))).status).toBe(200);
        expect((await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).stageId).toBe(fresh.id);
    });

    it("takes bulk deletes too, shows agents only their own, and can delete forever", async () => {
        const { user, org, fresh } = await setUp();
        const [mine, theirs] = await Promise.all([
            prisma.lead.create({ data: { ...org, name: "Mine", stageId: fresh.id, assignedToId: user.id } }),
            prisma.lead.create({ data: { ...org, name: "Someone else's", stageId: fresh.id } }),
        ]);
        expect((await bulkLeads(request("PATCH", { action: "delete", leadIds: [mine.id, theirs.id] }))).status).toBe(200);
        expect((await bin()).total).toBe(2);

        // an agent (no lead:all) who didn't delete them: sees the one that was theirs only
        const canDelete = await prisma.permission.findFirstOrThrow({ where: { name: "lead:delete" } });
        const agentRole = await prisma.role.create({ data: { ...org, name: "Agent", permissions: { create: [{ permissionId: canDelete.id }] } } });
        const agent = await prisma.user.create({
            data: { ...org, roleId: agentRole.id, name: "Agent", email: `agent-${org.organizationId}@example.com`, passwordHash: "x" },
            include: { organization: true, role: { include: { permissions: { include: { permission: true } } } } },
        });
        await prisma.deletedRecord.updateMany({ where: { ...org, recordId: mine.id }, data: { ownerId: agent.id } });
        (getCurrentUser as Mock).mockResolvedValue(agent);
        const seen = await bin();
        expect(seen.data.map((item) => item.name)).toEqual(["Mine"]);
        const hidden = await prisma.deletedRecord.findFirstOrThrow({ where: { ...org, recordId: theirs.id } });
        expect((await restore(request("POST"), params(hidden.id))).status).toBe(404);

        expect((await purge(request("DELETE"), params(seen.data[0].id))).status).toBe(200);
        expect(await prisma.deletedRecord.count({ where: org })).toBe(1);
    });

    it("empties anything older than 30 days, and puts a contact back with its leads", async () => {
        const { org, fresh } = await setUp();
        const contact = await prisma.contact.create({ data: { ...org, name: "Vikram Das", phone: "+91 98000 33333" } });
        const lead = await prisma.lead.create({ data: { ...org, name: "Vikram Das", stageId: fresh.id, contactId: contact.id } });
        await deleteContact(request("DELETE"), params(contact.id));
        expect((await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).contactId).toBeNull();

        const [item] = (await bin()).data;
        expect((await restore(request("POST"), params(item.id))).status).toBe(200);
        expect((await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).contactId).toBe(contact.id);

        await deleteContact(request("DELETE"), params(contact.id));
        await prisma.deletedRecord.updateMany({ where: org, data: { deletedAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000) } });
        expect((await bin()).total).toBe(0);
        expect(await prisma.deletedRecord.count({ where: org })).toBe(0);
    });
});

describe("recycle bin, many at once", () => {
    const organizationIds: number[] = [];
    afterEach(async () => {
        for (const organizationId of organizationIds.splice(0)) await cleanupOrg(organizationId);
    });

    async function binOf(leads: number, contacts = 0) {
        const { organization, user } = await createOrgWithUser(ALL);
        organizationIds.push(organization.id);
        (getCurrentUser as Mock).mockResolvedValue(user);
        const org = { organizationId: organization.id };
        const stage = await createLeadStage(organization.id, { name: "New", order: 0 });
        await prisma.lead.createMany({ data: Array.from({ length: leads }, (_, index) => ({ ...org, name: `Lead ${index}`, phone: `+91 98100 ${String(index).padStart(5, "0")}`, stageId: stage.id })) });
        await prisma.contact.createMany({ data: Array.from({ length: contacts }, (_, index) => ({ ...org, name: `Contact ${index}`, phone: `+91 98200 ${String(index).padStart(5, "0")}` })) });
        const leadIds = (await prisma.lead.findMany({ where: org, select: { id: true } })).map((lead) => lead.id);
        await bulkLeads(request("PATCH", { action: "delete", leadIds }));
        for (const contact of await prisma.contact.findMany({ where: org })) await deleteContact(request("DELETE"), params(contact.id));
        return { org, user };
    }

    it("deletes ticked items forever, or a whole tab of them with Empty bin", async () => {
        const { org } = await binOf(5, 2);
        const items = (await bin()).data;
        expect(items).toHaveLength(7);

        const ticked = items.filter((item) => item.entity === "lead").slice(0, 2).map((item) => item.id);
        expect((await (await bulkBin(request("POST", { action: "purge", ids: ticked }))).json()).affected).toBe(2);

        // "Delete all leads": the contacts stay
        expect((await (await bulkBin(request("POST", { action: "purge", all: { entity: "lead" } }))).json()).affected).toBe(3);
        expect((await prisma.deletedRecord.findMany({ where: org })).map((item) => item.entity)).toEqual(["contact", "contact"]);
    });

    it("restores a few straight away, and many as a background job", async () => {
        const { org } = await binOf(30);
        const few = (await bin()).data.slice(0, 3).map((item) => item.id);
        const res = await bulkBin(request("POST", { action: "restore", ids: few }));
        expect((await res.json()).affected).toBe(3);
        expect(await prisma.lead.count({ where: org })).toBe(3);

        // the other 27: "Select all", then Restore
        const started = await bulkBin(request("POST", { action: "restore", all: {} }));
        expect(started.status).toBe(201);
        const job = (await started.json()).data;
        expect(job).toMatchObject({ entity: "record", action: "restore", total: 27 });
        await runBulkJob(job.id);

        expect(await prisma.lead.count({ where: org })).toBe(30);
        expect(await prisma.bulkJob.findUniqueOrThrow({ where: { id: job.id } })).toMatchObject({ status: "DONE", processed: 27, affected: 27 });
        expect((await bin()).total).toBe(0);
    });
});

describe("workspace currency", () => {
    it("only someone with workspace:manage can change it, to a listed currency", async () => {
        const agent = await createOrgWithUser([]);
        (getCurrentUser as Mock).mockResolvedValue(agent.user);
        expect((await updateWorkspace(request("PATCH", { currency: "USD" }))).status).toBe(403);
        await cleanupOrg(agent.organization.id);

        const admin = await createOrgWithUser(["workspace:manage"]);
        (getCurrentUser as Mock).mockResolvedValue(admin.user);
        expect((await updateWorkspace(request("PATCH", { currency: "XYZ" }))).status).toBe(400);
        expect((await updateWorkspace(request("PATCH", { currency: "USD" }))).status).toBe(200);
        expect((await prisma.organization.findUniqueOrThrow({ where: { id: admin.organization.id } })).currency).toBe("USD");
        await cleanupOrg(admin.organization.id);
    });
});
