import { afterEach, describe, expect, it, vi, type Mock } from "vitest";
import { NextRequest } from "next/server";

import { prisma } from "@/lib/db/prisma";
import { createOrgWithUser, createLeadStage, cleanupOrg } from "../helpers";

vi.mock("@/lib/auth/getCurrentUser", () => ({ getCurrentUser: vi.fn() }));
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { GET as listTasks, POST as createTask } from "@/app/api/tasks/route";
import { PUT as updateTask } from "@/app/api/tasks/[id]/route";

function jsonRequest(method: string, body: object) {
    return new NextRequest("http://localhost/api/tasks", {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
    });
}

function dayFromToday(days: number) {
    const day = new Date();
    day.setUTCHours(0, 0, 0, 0);
    day.setUTCDate(day.getUTCDate() + days);
    return day;
}

describe("tasks", () => {
    const organizationIds: number[] = [];

    afterEach(async () => {
        for (const organizationId of organizationIds.splice(0)) await cleanupOrg(organizationId);
    });

    async function setUpOrg() {
        const { organization, user } = await createOrgWithUser([]);
        organizationIds.push(organization.id);
        return { organization, user };
    }

    it("puts a task on the timeline of the lead it's linked to", async () => {
        const { organization, user } = await setUpOrg();
        (getCurrentUser as Mock).mockResolvedValue(user);

        const stage = await createLeadStage(organization.id);
        const lead = await prisma.lead.create({
            data: { organizationId: organization.id, assignedToId: user.id, name: "Acme", stageId: stage.id },
        });

        const res = await createTask(jsonRequest("POST", { title: "Send proposal", dueDate: "2030-01-15", leadId: lead.id }));
        const json = await res.json();

        expect(res.status).toBe(201);

        const entries = await prisma.leadTimeline.findMany({ where: { leadId: lead.id } });
        expect(entries).toHaveLength(1);
        expect(entries[0].type).toBe("TASK_CREATED");
        expect(entries[0].metadata).toEqual({ taskId: json.data.id });
    });

    it("refuses to link a task to a lead from another organization", async () => {
        const { user } = await setUpOrg();
        const { organization: otherOrg } = await setUpOrg();
        (getCurrentUser as Mock).mockResolvedValue(user);

        const stage = await createLeadStage(otherOrg.id);
        const othersLead = await prisma.lead.create({
            data: { organizationId: otherOrg.id, name: "Not yours", stageId: stage.id },
        });

        const res = await createTask(jsonRequest("POST", { title: "Sneaky", dueDate: "2030-01-15", leadId: othersLead.id }));

        expect(res.status).toBe(400);
        expect(await prisma.task.count({ where: { title: "Sneaky" } })).toBe(0);
    });

    it("logs completing a task once, not on every later save", async () => {
        const { organization, user } = await setUpOrg();
        (getCurrentUser as Mock).mockResolvedValue(user);

        const stage = await createLeadStage(organization.id);
        const lead = await prisma.lead.create({
            data: { organizationId: organization.id, assignedToId: user.id, name: "Acme", stageId: stage.id },
        });
        const task = await prisma.task.create({
            data: {
                organizationId: organization.id,
                title: "Call back",
                dueDate: dayFromToday(1),
                assignedToId: user.id,
                createdById: user.id,
                leadId: lead.id,
            },
        });
        const params = { params: Promise.resolve({ id: String(task.id) }) };

        await updateTask(jsonRequest("PUT", { status: "COMPLETED" }), params);
        await updateTask(jsonRequest("PUT", { status: "COMPLETED", title: "Call back (done)" }), params);

        const completed = await prisma.leadTimeline.count({ where: { leadId: lead.id, type: "TASK_COMPLETED" } });
        expect(completed).toBe(1);
    });

    it("defaults a task to medium priority and lets it be changed", async () => {
        const { user } = await setUpOrg();
        (getCurrentUser as Mock).mockResolvedValue(user);

        const created = await (await createTask(jsonRequest("POST", { title: "Prep demo", dueDate: "2030-01-15" }))).json();
        expect(created.data.priority).toBe("MEDIUM");

        const params = { params: Promise.resolve({ id: String(created.data.id) }) };
        const updated = await (await updateTask(jsonRequest("PUT", { priority: "HIGH" }), params)).json();
        expect(updated.data.priority).toBe("HIGH");

        const invalid = await updateTask(jsonRequest("PUT", { priority: "URGENT" }), params);
        expect(invalid.status).toBe(400);
    });

    it("filters the list by priority", async () => {
        const { organization, user } = await setUpOrg();
        (getCurrentUser as Mock).mockResolvedValue(user);

        const base = { organizationId: organization.id, assignedToId: user.id, createdById: user.id, dueDate: dayFromToday(1) };
        await prisma.task.createMany({
            data: [
                { ...base, title: "Important", priority: "HIGH" },
                { ...base, title: "Whenever", priority: "LOW" },
            ],
        });

        const res = await listTasks(new NextRequest("http://localhost/api/tasks?priority=HIGH"));
        const json = await res.json();

        expect(json.data.map((task: { title: string }) => task.title)).toEqual(["Important"]);
    });

    it("lists only open tasks that are past their day under the overdue scope", async () => {
        const { organization, user } = await setUpOrg();
        (getCurrentUser as Mock).mockResolvedValue(user);

        const base = { organizationId: organization.id, assignedToId: user.id, createdById: user.id };
        await prisma.task.createMany({
            data: [
                { ...base, title: "Late", dueDate: dayFromToday(-2) },
                { ...base, title: "Later", dueDate: dayFromToday(3) },
                { ...base, title: "Late but done", dueDate: dayFromToday(-2), status: "COMPLETED" },
            ],
        });

        const res = await listTasks(new NextRequest("http://localhost/api/tasks?scope=overdue"));
        const json = await res.json();

        expect(json.data.map((task: { title: string }) => task.title)).toEqual(["Late"]);
    });
});
