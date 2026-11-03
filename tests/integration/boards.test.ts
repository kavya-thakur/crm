import { afterEach, describe, expect, it, vi, type Mock } from "vitest";
import { NextRequest } from "next/server";

import { prisma } from "@/lib/db/prisma";
import { createOrgWithUser, createLeadStage, cleanupOrg } from "../helpers";

vi.mock("@/lib/auth/getCurrentUser", () => ({ getCurrentUser: vi.fn() }));
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { GET as listTasks } from "@/app/api/tasks/route";
import { GET as listActivities } from "@/app/api/activities/route";
import { GET as listNotes } from "@/app/api/notes/route";
import { GET as listDeals } from "@/app/api/deals/route";
import { PUT as updateTask } from "@/app/api/tasks/[id]/route";

const titles = async (res: Response) => ((await res.json()).data as { title?: string; body?: string }[]).map((item) => item.title ?? item.body).sort();

// The boards ask for one column at a time: one task status, one activity status, one kind of note
describe("the lists behind the boards", () => {
    let organizationId = 0;

    afterEach(async () => {
        if (organizationId) await cleanupOrg(organizationId);
        organizationId = 0;
    });

    async function setUp() {
        const { organization, user } = await createOrgWithUser(["lead:read", "deal:read", "deal:all"]);
        organizationId = organization.id;
        (getCurrentUser as Mock).mockResolvedValue(user);
        return { org: { organizationId }, user };
    }

    it("splits tasks by status, and still counts in-progress ones as open", async () => {
        const { org, user } = await setUp();
        const task = (title: string, status: "PENDING" | "IN_PROGRESS" | "COMPLETED") =>
            prisma.task.create({ data: { ...org, title, status, dueDate: new Date("2030-01-01"), assignedToId: user.id, createdById: user.id } });
        await Promise.all([task("To do", "PENDING"), task("Doing", "IN_PROGRESS"), task("Done", "COMPLETED")]);

        const list = (query: string) => listTasks(new NextRequest(`http://localhost/api/tasks?${query}`));

        expect(await titles(await list("scope=all&status=IN_PROGRESS"))).toEqual(["Doing"]);
        expect(await titles(await list("scope=open"))).toEqual(["Doing", "To do"]);
    });

    it("splits activities by status", async () => {
        const { org, user } = await setUp();
        const call = (title: string, status: "SCHEDULED" | "COMPLETED" | "CANCELLED") =>
            prisma.scheduledActivity.create({
                data: { ...org, title, status, type: "CALL", scheduledAt: new Date("2030-01-01T10:00:00Z"), assignedToId: user.id, createdById: user.id },
            });
        await Promise.all([call("Booked", "SCHEDULED"), call("Held", "COMPLETED"), call("Dropped", "CANCELLED")]);

        const res = await listActivities(new NextRequest("http://localhost/api/activities?scope=all&status=CANCELLED"));

        expect(await titles(res)).toEqual(["Dropped"]);
    });

    it("lists one kind of record's notes when asked", async () => {
        const { org, user } = await setUp();
        const stage = await createLeadStage(organizationId);
        const pipelineStage = await prisma.pipelineStage.create({ data: { ...org, name: "Open" } });
        const lead = await prisma.lead.create({ data: { ...org, name: "Acme", stageId: stage.id, assignedToId: user.id } });
        const deal = await prisma.deal.create({ data: { ...org, title: "Big deal", pipelineStageId: pipelineStage.id, assignedToId: user.id } });
        await prisma.leadNote.create({ data: { leadId: lead.id, authorId: user.id, body: "On the lead" } });
        await prisma.dealNote.create({ data: { dealId: deal.id, authorId: user.id, body: "On the deal" } });

        const notes = (query: string) => listNotes(new NextRequest(`http://localhost/api/notes?${query}`));

        expect(await titles(await notes("entity=deal"))).toEqual(["On the deal"]);
        expect(await titles(await notes(""))).toEqual(["On the deal", "On the lead"]);
    });

    it("records when a task is ticked off, and forgets it when it's reopened", async () => {
        const { org, user } = await setUp();
        const task = await prisma.task.create({ data: { ...org, title: "Send quote", dueDate: new Date("2030-01-01"), assignedToId: user.id, createdById: user.id } });
        const move = (status: string) =>
            updateTask(
                new NextRequest("http://localhost/api/tasks", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ status }) }),
                { params: Promise.resolve({ id: String(task.id) }) },
            );
        const completedAt = async () => (await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).completedAt;

        await move("COMPLETED");
        expect(await completedAt()).not.toBeNull();

        await move("IN_PROGRESS");
        expect(await completedAt()).toBeNull();
    });

    it("pages a deal column, with the whole column's value on the first page", async () => {
        const { org } = await setUp();
        const stage = await prisma.pipelineStage.create({ data: { ...org, name: "Open" } });
        await prisma.deal.createMany({
            data: Array.from({ length: 30 }, (_, index) => ({ ...org, title: `Deal ${index}`, amount: 100, pipelineStageId: stage.id })),
        });

        const page = async (n: number) =>
            (await listDeals(new NextRequest(`http://localhost/api/deals?pipelineStageId=${stage.id}&page=${n}&limit=25`))).json();
        const [first, second] = [await page(1), await page(2)];

        expect(first.data).toHaveLength(25);
        expect(first.totalAmount).toBe(3000);
        expect(second.data).toHaveLength(5);
        expect(second.totalAmount).toBeUndefined();
    });

    it("pages one kind of note", async () => {
        const { org, user } = await setUp();
        const stage = await createLeadStage(organizationId);
        const lead = await prisma.lead.create({ data: { ...org, name: "Acme", stageId: stage.id, assignedToId: user.id } });
        await prisma.leadNote.createMany({ data: Array.from({ length: 3 }, (_, index) => ({ leadId: lead.id, authorId: user.id, body: `Note ${index}` })) });

        const res = await listNotes(new NextRequest("http://localhost/api/notes?entity=lead&limit=2&page=2"));
        const json = await res.json();

        expect(json.data).toHaveLength(1);
        expect(json.pagination).toMatchObject({ total: 3, totalPages: 2 });
    });
});
