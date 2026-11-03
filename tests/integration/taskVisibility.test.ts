import { afterEach, describe, expect, it, vi, type Mock } from "vitest";
import { NextRequest } from "next/server";

import { prisma } from "@/lib/db/prisma";
import { createOrgWithUser, createLeadStage, cleanupOrg } from "../helpers";

vi.mock("@/lib/auth/getCurrentUser", () => ({ getCurrentUser: vi.fn() }));
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { GET as listTasks, POST as createTask } from "@/app/api/tasks/route";
import { DELETE as deleteTask, PUT as updateTask } from "@/app/api/tasks/[id]/route";
import { GET as listActivities } from "@/app/api/activities/route";
import { GET as getActivity } from "@/app/api/activities/[id]/route";

function request(method: string, body?: object) {
    return new NextRequest("http://localhost/api/tasks", {
        method,
        headers: { "content-type": "application/json" },
        ...(body && { body: JSON.stringify(body) }),
    });
}

const params = (id: number) => ({ params: Promise.resolve({ id: String(id) }) });
const titles = async (res: Response) => ((await res.json()).data as { title: string }[]).map((item) => item.title).sort();

// An agent (sees only their own leads) and a colleague in the same organization,
// each with one lead and one task, plus a call booked by the colleague with the agent tagged
describe("who sees whose tasks and calls", () => {
    let organizationId = 0;

    afterEach(async () => {
        if (organizationId) await cleanupOrg(organizationId);
        organizationId = 0;
    });

    async function setUp(extraPermissions: string[] = []) {
        const { organization, user: agent } = await createOrgWithUser(["lead:read", ...extraPermissions]);
        organizationId = organization.id;
        const org = { organizationId };
        const colleague = await prisma.user.create({
            data: { ...org, roleId: agent.roleId, name: "Colleague", email: `colleague-${organizationId}@example.com`, passwordHash: "x" },
        });

        const stage = await createLeadStage(organizationId);
        const [myLead, theirLead] = await Promise.all([
            prisma.lead.create({ data: { ...org, name: "Mine", stageId: stage.id, assignedToId: agent.id } }),
            prisma.lead.create({ data: { ...org, name: "Theirs", stageId: stage.id, assignedToId: colleague.id } }),
        ]);

        const task = (title: string, assignedToId: number, extra = {}) =>
            prisma.task.create({ data: { ...org, title, dueDate: new Date("2030-01-01"), assignedToId, createdById: colleague.id, ...extra } });
        const [, , theirTask] = await Promise.all([
            task("Mine", agent.id),
            task("Theirs, on my lead", colleague.id, { leadId: myLead.id }),
            task("Theirs", colleague.id, { leadId: theirLead.id }),
        ]);

        const call = (title: string, extra = {}) =>
            prisma.scheduledActivity.create({
                data: { ...org, title, type: "CALL", scheduledAt: new Date("2030-01-01T10:00:00Z"), assignedToId: colleague.id, createdById: colleague.id, ...extra },
            });
        const [, theirCall] = await Promise.all([call("Tagged me", { attendees: { connect: [{ id: agent.id }] } }), call("Their call")]);

        (getCurrentUser as Mock).mockResolvedValue(agent);
        return { agent, theirLead, theirTask, theirCall };
    }

    it("shows an agent their own tasks and the ones on their records, not a colleague's", async () => {
        await setUp();

        expect(await titles(await listTasks(new NextRequest("http://localhost/api/tasks?scope=all")))).toEqual(["Mine", "Theirs, on my lead"]);
    });

    it("won't let an agent change or delete a colleague's task", async () => {
        const { theirTask } = await setUp();

        expect((await updateTask(request("PUT", { title: "Hijacked" }), params(theirTask.id))).status).toBe(404);
        expect((await deleteTask(request("DELETE"), params(theirTask.id))).status).toBe(404);
        expect((await prisma.task.findUniqueOrThrow({ where: { id: theirTask.id } })).title).toBe("Theirs");
    });

    it("won't let an agent attach a task to a lead they can't open", async () => {
        const { theirLead } = await setUp();

        expect((await createTask(request("POST", { title: "Sneaky", dueDate: "2030-01-15", leadId: theirLead.id }))).status).toBe(400);
    });

    it("shows everyone's tasks with task:all", async () => {
        await setUp(["task:all"]);

        expect(await titles(await listTasks(new NextRequest("http://localhost/api/tasks?scope=all")))).toEqual(["Mine", "Theirs", "Theirs, on my lead"]);
    });

    it("shows an agent the calls they're tagged on, not a colleague's own", async () => {
        const { theirCall } = await setUp();

        expect(await titles(await listActivities(new NextRequest("http://localhost/api/activities?scope=all")))).toEqual(["Tagged me"]);
        expect((await getActivity(request("GET"), params(theirCall.id))).status).toBe(404);
    });
});
