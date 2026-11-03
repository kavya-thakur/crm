import { afterEach, describe, expect, it, vi, type Mock } from "vitest";
import { NextRequest } from "next/server";

import { prisma } from "@/lib/db/prisma";
import { runBulkJob } from "@/lib/jobs/bulkActions";
import { createOrgWithUser, createLeadStage, cleanupOrg } from "../helpers";

vi.mock("@/lib/auth/getCurrentUser", () => ({ getCurrentUser: vi.fn() }));
// no Redis needed: the queue is replaced by a stand-in that records what was added
const added: unknown[] = [];
vi.mock("@/lib/jobs/queues", () => ({ bulkQueue: () => ({ add: async (...args: unknown[]) => added.push(args) }) }));
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { POST as startBulkJob } from "@/app/api/bulk-jobs/route";
import { GET as listLeads } from "@/app/api/leads/route";

describe("bulk delete in the background", () => {
    let organizationId = 0;

    afterEach(async () => {
        if (organizationId) await cleanupOrg(organizationId);
        organizationId = 0;
        added.length = 0;
    });

    async function setUp(permissions = ["lead:read", "lead:delete", "lead:all"]) {
        const { organization, user } = await createOrgWithUser(permissions);
        organizationId = organization.id;
        (getCurrentUser as Mock).mockResolvedValue(user);
        const org = { organizationId };
        const [fresh, lost] = await Promise.all([
            createLeadStage(organizationId, { name: "New", order: 0 }),
            createLeadStage(organizationId, { name: "Lost", order: 1, isLost: true }),
        ]);
        const colleague = await prisma.user.create({
            data: { ...org, roleId: user.roleId, name: "Colleague", email: `bulk-${organizationId}@example.com`, passwordHash: "x" },
        });
        const make = (count: number, data: object) =>
            prisma.lead.createManyAndReturn({ data: Array.from({ length: count }, (_, index) => ({ ...org, name: `Lead ${index}`, stageId: fresh.id, assignedToId: user.id, ...data })) });
        return { org, user, colleague, fresh, lost, make };
    }

    const bulkJob = (org: { organizationId: number }, userId: number, ids: number[], extra: object = {}) =>
        prisma.bulkJob.create({ data: { ...org, userId, entity: "lead", action: "delete", ids, total: ids.length, ...extra } });

    it("deletes in batches and reports how many actually went", async () => {
        const { org, user, make } = await setUp();
        const leads = await make(1200, {});
        // one picked lead was already deleted by someone else meanwhile
        await prisma.lead.delete({ where: { id: leads[0].id } });
        const job = await bulkJob(org, user.id, leads.map((lead) => lead.id));

        await runBulkJob(job.id);

        expect(await prisma.lead.count({ where: org })).toBe(0);
        expect(await prisma.bulkJob.findUniqueOrThrow({ where: { id: job.id } })).toMatchObject({ status: "DONE", processed: 1200, affected: 1199 });
    });

    it("only deletes what the person may touch, and carries on from where a stopped job got to", async () => {
        const { org, user, colleague, make } = await setUp(["lead:read", "lead:delete"]);
        const mine = await make(3, {});
        const theirs = await make(2, { assignedToId: colleague.id });
        // as if the job had already got past the first id when the server stopped
        const job = await bulkJob(org, user.id, [...mine, ...theirs].map((lead) => lead.id), { processed: 1, status: "RUNNING" });

        await runBulkJob(job.id);

        // it carried on from the second id, so the first is untouched
        expect(await prisma.lead.findUnique({ where: { id: mine[0].id } })).not.toBeNull();
        // without lead:all, a colleague's leads are out of reach
        expect(await prisma.lead.count({ where: { ...org, assignedToId: colleague.id } })).toBe(2);
        expect(await prisma.bulkJob.findUniqueOrThrow({ where: { id: job.id } })).toMatchObject({ status: "DONE", processed: 5, affected: 2 });
    });

    it("stops if the person can no longer delete", async () => {
        const { org, user, make } = await setUp(["lead:read"]);
        const job = await bulkJob(org, user.id, (await make(2, {})).map((lead) => lead.id));

        await expect(runBulkJob(job.id)).rejects.toThrow("You can no longer delete leads");
        expect(await prisma.lead.count({ where: org })).toBe(2);
    });

    it("gives every match's id for 'select all', and queues the job", async () => {
        const { lost, make } = await setUp();
        const open = await make(3, {});
        await make(2, { stageId: lost.id });

        const res = await listLeads(new NextRequest(`http://localhost/api/leads?format=ids&stageIds=${open[0].stageId}`));
        const ids: number[] = (await res.json()).data;
        expect(ids.sort()).toEqual(open.map((lead) => lead.id).sort());

        const start = await startBulkJob(
            new NextRequest("http://localhost/api/bulk-jobs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ entity: "lead", action: "delete", ids }) }),
        );
        expect(start.status).toBe(201);
        const job = (await start.json()).data;
        expect(job).toMatchObject({ status: "QUEUED", total: 3 });
        expect(added).toEqual([["delete", { bulkJobId: job.id }, { jobId: `bulk-${job.id}` }]]);
    });

    it("needs the right to delete that kind of record", async () => {
        await setUp(["lead:read", "lead:delete"]);
        const res = await startBulkJob(
            new NextRequest("http://localhost/api/bulk-jobs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ entity: "deal", action: "delete", ids: [1] }) }),
        );
        expect(res.status).toBe(403);
    });

    it("moves thousands to a stage in the background, the same way a small bulk move does", async () => {
        const { org, user, colleague, lost, make } = await setUp(["lead:read", "lead:update"]);
        const mine = await make(3, {});
        const theirs = await make(1, { assignedToId: colleague.id });
        const job = await prisma.bulkJob.create({
            data: { ...org, userId: user.id, entity: "lead", action: "stage", params: { stageId: lost.id, lostReason: "No budget" }, ids: [...mine, ...theirs].map((lead) => lead.id), total: 4 },
        });

        await runBulkJob(job.id);

        const moved = await prisma.lead.findMany({ where: { id: { in: mine.map((lead) => lead.id) } }, include: { timeline: true } });
        expect(moved.map((lead) => [lead.stageId, lead.lostReason])).toEqual(mine.map(() => [lost.id, "No budget"]));
        expect(moved[0].timeline[0].message).toBe("Lead stage changed from New to Lost (No budget)");
        // a colleague's lead is out of reach without lead:all
        expect((await prisma.lead.findUniqueOrThrow({ where: { id: theirs[0].id } })).stageId).not.toBe(lost.id);
        expect(await prisma.bulkJob.findUniqueOrThrow({ where: { id: job.id } })).toMatchObject({ status: "DONE", affected: 3 });
    });

    it("assigns thousands in the background, with one notification for the whole job", async () => {
        const { org, user, colleague, make } = await setUp(["lead:read", "lead:update", "lead:all"]);
        const leads = await make(600, {});
        const job = await prisma.bulkJob.create({
            data: { ...org, userId: user.id, entity: "lead", action: "assign", params: { assignedToId: colleague.id }, ids: leads.map((lead) => lead.id), total: 600 },
        });

        await runBulkJob(job.id);

        expect(await prisma.lead.count({ where: { ...org, assignedToId: colleague.id } })).toBe(600);
        expect(await prisma.leadTimeline.count({ where: { lead: org, type: "REASSIGNED" } })).toBe(600);
        // two batches of 500 and 100, but one notification
        expect(await prisma.notification.findMany({ where: { userId: colleague.id } })).toMatchObject([{ title: expect.stringContaining("assigned you 600 leads") }]);
    });

    it("checks the stage, the teammate and the right to reassign before queueing", async () => {
        const { user, make } = await setUp(["lead:read", "lead:update"]);
        const [lead] = await make(1, {});
        const send = (body: object) =>
            startBulkJob(new NextRequest("http://localhost/api/bulk-jobs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ entity: "lead", ids: [lead.id], ...body }) }));

        expect((await send({ action: "stage", stageId: 999999 })).status).toBe(400);
        // assigning needs lead:all, like the single assign
        expect((await send({ action: "assign", assignedToId: user.id })).status).toBe(403);
        expect(added).toHaveLength(0);
    });
});
