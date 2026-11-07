import { afterEach, describe, expect, it, vi, type Mock } from "vitest";
import { NextRequest } from "next/server";

import { prisma } from "@/lib/db/prisma";
import { startOfToday } from "@/lib/work/tasks";
import { createOrgWithUser, createLeadStage, cleanupOrg } from "../helpers";

vi.mock("@/lib/auth/getCurrentUser", () => ({ getCurrentUser: vi.fn() }));

import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { GET as myDay } from "@/app/api/my-day/route";

const DAY = 24 * 60 * 60 * 1000;

describe("my day", () => {
    let organizationId = 0;

    afterEach(async () => {
        if (organizationId) await cleanupOrg(organizationId);
        organizationId = 0;
    });

    it("shows only my own work: overdue and today's tasks, today's and missed calls, uncontacted leads, deals closing this week", async () => {
        const { organization, user } = await createOrgWithUser(["lead:read", "deal:read"]);
        organizationId = organization.id;
        (getCurrentUser as Mock).mockResolvedValue(user);
        const org = { organizationId };
        const other = await prisma.user.create({ data: { ...org, roleId: user.roleId, name: "Rohan Iyer", email: `rohan-${organizationId}@example.com`, passwordHash: "x" } });

        const today = startOfToday();
        const daysFromNow = (days: number) => new Date(today.getTime() + days * DAY);
        const task = (title: string, dueDate: Date, extra: object = {}) =>
            prisma.task.create({ data: { ...org, title, dueDate, assignedToId: user.id, createdById: user.id, ...extra } });
        await Promise.all([
            task("Send the quote", daysFromNow(-2)),
            task("Call back Rahul", today),
            task("Already done", today, { status: "COMPLETED" }),
            task("Rohan's task", today, { assignedToId: other.id }),
            task("Next week", daysFromNow(7)),
        ]);
        // a pile of overdue ones: the card shows 5, the urgent one first, and counts the rest
        for (let i = 1; i <= 6; i++) await task(`Old chore ${i}`, daysFromNow(-10 - i), { priority: "LOW" });
        await task("Urgent and late", daysFromNow(-1), { priority: "HIGH" });

        const activity = (title: string, scheduledAt: Date, extra: object = {}) =>
            prisma.scheduledActivity.create({ data: { ...org, title, type: "CALL", scheduledAt, assignedToId: user.id, createdById: user.id, ...extra } });
        await Promise.all([
            activity("Demo call", new Date(today.getTime() + 10 * 60 * 60 * 1000)),
            activity("Missed call", daysFromNow(-1)),
            activity("Long ago", daysFromNow(-10)),
            activity("Done call", today, { status: "COMPLETED" }),
            activity("Tomorrow's call", daysFromNow(1.5)),
            // Rohan's, but I'm invited
            activity("Team meeting", new Date(today.getTime() + 15 * 60 * 60 * 1000), { assignedToId: other.id, attendees: { connect: { id: user.id } } }),
        ]);

        const [fresh, qualified] = await Promise.all([createLeadStage(organizationId, { name: "New", order: 0 }), createLeadStage(organizationId, { name: "Qualified", order: 1 })]);
        const lead = (name: string, stageId: number, assignedToId: number, minutesAgo = 0) =>
            prisma.lead.create({ data: { ...org, name, stageId, assignedToId, createdAt: new Date(Date.now() - minutesAgo * 60_000) } });
        await Promise.all([lead("Asha Rao", fresh.id, user.id), lead("Vikram Das", qualified.id, user.id), lead("Rohan's lead", fresh.id, other.id)]);
        // bulk-assigned: 7 more new ones, older than Asha
        for (let i = 1; i <= 7; i++) await lead(`Bulk lead ${i}`, fresh.id, user.id, i * 10);
        // new, but already planned: a call booked, or an open task
        const [booked, tasked] = await Promise.all([lead("Booked call", fresh.id, user.id), lead("Has a task", fresh.id, user.id)]);
        await activity("Intro call", daysFromNow(2), { leadId: booked.id });
        await task("Email the brochure", daysFromNow(3), { leadId: tasked.id });

        const [open, won] = await Promise.all([
            prisma.pipelineStage.create({ data: { ...org, name: "Proposal", order: 0 } }),
            prisma.pipelineStage.create({ data: { ...org, name: "Won", order: 1, isWon: true } }),
        ]);
        const deal = (title: string, expectedCloseDate: Date, extra: object = {}) =>
            prisma.deal.create({ data: { ...org, title, amount: 50000, pipelineStageId: open.id, assignedToId: user.id, expectedCloseDate, ...extra } });
        await Promise.all([
            deal("Late deal", daysFromNow(-3)),
            deal("This week", daysFromNow(4)),
            deal("Next month", daysFromNow(30)),
            deal("Already won", today, { pipelineStageId: won.id, closedAt: new Date() }),
        ]);

        const res = await myDay(new NextRequest(`http://localhost/api/my-day?dayStart=${today.toISOString()}`));
        expect(res.status).toBe(200);
        const { data } = await res.json();

        const titles = (list: { items: { title: string }[] }) => list.items.map((item) => item.title);
        expect(data.overdueTasks.total).toBe(8);
        expect(titles(data.overdueTasks)).toEqual(["Urgent and late", "Send the quote", "Old chore 6", "Old chore 5", "Old chore 4"]);
        expect(data.todayTasks).toMatchObject({ total: 1, items: [{ title: "Call back Rahul" }] });
        // today's (mine, and one I'm invited to); earlier ones never marked done are a count
        expect(titles(data.activities)).toEqual(["Demo call", "Team meeting"]);
        expect(data.activities).toMatchObject({ total: 2, missed: 2 });
        // only unplanned ones, the freshest 5, and how many in all
        expect(data.newLeads.stage).toEqual({ id: fresh.id, name: "New" });
        expect(data.newLeads.total).toBe(8);
        expect(data.newLeads.items.map((item: { name: string }) => item.name)).toEqual(["Asha Rao", "Bulk lead 1", "Bulk lead 2", "Bulk lead 3", "Bulk lead 4"]);
        expect(data.closingDeals.total).toBe(2);
        expect(data.closingDeals.items.map((item: { title: string; amount: number }) => [item.title, item.amount])).toEqual([
            ["Late deal", 50000],
            ["This week", 50000],
        ]);

        // without lead and deal access, those parts are left out rather than empty
        const agent = await createOrgWithUser([]);
        (getCurrentUser as Mock).mockResolvedValue(agent.user);
        const bare = (await (await myDay(new NextRequest("http://localhost/api/my-day"))).json()).data;
        await cleanupOrg(agent.organization.id);
        expect(bare).toMatchObject({ newLeads: null, closingDeals: null, todayTasks: { total: 0, items: [] } });
    });
});
