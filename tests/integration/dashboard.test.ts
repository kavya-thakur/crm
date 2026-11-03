import { afterEach, describe, expect, it, vi, type Mock } from "vitest";
import { NextRequest } from "next/server";

import { prisma } from "@/lib/db/prisma";
import { dashboardPeriod, bucketIndex } from "@/lib/dashboard/periods";
import { createOrgWithUser, cleanupOrg } from "../helpers";

vi.mock("@/lib/auth/getCurrentUser", () => ({ getCurrentUser: vi.fn() }));
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { GET as getDashboard } from "@/app/api/dashboard/route";
import { PUT as updateDeal } from "@/app/api/deals/[id]/route";
import { PUT as updateLead } from "@/app/api/leads/[id]/route";
import { PATCH as bulkUpdateLeads } from "@/app/api/leads/bulkUpdate/route";

const DAY = 24 * 60 * 60 * 1000;

function daysAgo(days: number) {
    return new Date(Date.now() - days * DAY);
}

describe("dashboardPeriod", () => {
    const today = new Date("2026-11-01T00:00:00.000Z");

    it("covers 30 days ending today, one slice a day, and the 30 days before", () => {
        const { start, end, previousStart, buckets } = dashboardPeriod("30d", today);

        expect(buckets).toHaveLength(30);
        expect(start.toISOString()).toBe("2026-10-03T00:00:00.000Z");
        expect(end.toISOString()).toBe("2026-11-02T00:00:00.000Z");
        expect(previousStart.toISOString()).toBe("2026-09-03T00:00:00.000Z");
        expect(bucketIndex(buckets, new Date("2026-11-01T15:00:00.000Z"))).toBe(29);
    });

    it("uses months for a year, starting 11 months back", () => {
        const { buckets } = dashboardPeriod("12m", today);

        expect(buckets).toHaveLength(12);
        expect(buckets[0].toISOString()).toBe("2025-12-01T00:00:00.000Z");
        expect(buckets[11].toISOString()).toBe("2026-11-01T00:00:00.000Z");
    });
});

describe("GET /api/dashboard", () => {
    let organizationId: number;

    afterEach(async () => {
        if (organizationId) await cleanupOrg(organizationId);
        organizationId = 0;
    });

    async function setUp(permissions: string[]) {
        const { organization, user } = await createOrgWithUser(permissions);
        organizationId = organization.id;
        (getCurrentUser as Mock).mockResolvedValue(user);

        const org = { organizationId: organization.id };
        const [open, won] = await Promise.all([
            prisma.pipelineStage.create({ data: { ...org, name: "Proposal", order: 0 } }),
            prisma.pipelineStage.create({ data: { ...org, name: "Won", order: 1, isWon: true } }),
        ]);
        return { user, org, open, won };
    }

    async function load(query = "range=30d") {
        const res = await getDashboard(new NextRequest(`http://localhost/api/dashboard?${query}`));
        return { status: res.status, data: (await res.json()).data };
    }

    async function addColleague(org: { organizationId: number }, roleId: number) {
        return prisma.user.create({
            data: { ...org, roleId, name: "Colleague", email: `colleague-${org.organizationId}@example.com`, passwordHash: "x" },
        });
    }

    it("adds up won deals for this period and the one before, and open deals by stage", async () => {
        const { user, org, open, won } = await setUp(["deal:read", "deal:all"]);
        const mine = { ...org, assignedToId: user.id };
        await prisma.deal.createMany({
            data: [
                { ...mine, title: "Won now", amount: 5000, pipelineStageId: won.id, closedAt: daysAgo(2) },
                { ...mine, title: "Won last period", amount: 2000, pipelineStageId: won.id, closedAt: daysAgo(40) },
                { ...mine, title: "Still open", amount: 800, pipelineStageId: open.id },
            ],
        });

        const { status, data } = await load();

        expect(status).toBe(200);
        expect(data.scope).toBe("team");
        expect(data.deals.won).toMatchObject({ value: 5000, count: 1, previousValue: 2000 });
        expect(data.deals.won.trend).toHaveLength(30);
        expect(data.deals.open.stages).toEqual([{ id: open.id, name: "Proposal", color: open.color, count: 1, value: 800 }]);
    });

    it("only counts your own deals without deal:all, and leaves out leads without lead:read", async () => {
        const { user, org, won } = await setUp(["deal:read"]);
        const colleague = await addColleague(org, user.roleId);
        await prisma.deal.createMany({
            data: [
                { ...org, assignedToId: user.id, title: "Mine", amount: 100, pipelineStageId: won.id, closedAt: daysAgo(1) },
                { ...org, assignedToId: colleague.id, title: "Theirs", amount: 900, pipelineStageId: won.id, closedAt: daysAgo(1) },
            ],
        });

        const { data } = await load();

        expect(data.scope).toBe("mine");
        expect(data.deals.won.value).toBe(100);
        expect(data.leads).toBeNull();
        expect(data.team).toBeNull();
    });

    it("narrows to one agent for a manager, and ranks everyone in the team table", async () => {
        const { user, org, open, won } = await setUp(["deal:read", "deal:all"]);
        const colleague = await addColleague(org, user.roleId);
        const lostStage = await prisma.pipelineStage.create({ data: { ...org, name: "Lost", order: 2, isLost: true } });
        const theirs = { ...org, assignedToId: colleague.id };
        await prisma.deal.createMany({
            data: [
                { ...org, assignedToId: user.id, title: "Mine", amount: 100, pipelineStageId: won.id, closedAt: daysAgo(1) },
                { ...theirs, title: "Their win", amount: 900, pipelineStageId: won.id, closedAt: daysAgo(1) },
                { ...theirs, title: "Their loss", amount: 50, pipelineStageId: lostStage.id, closedAt: daysAgo(1) },
                { ...theirs, title: "Their open deal", amount: 400, probability: 50, pipelineStageId: open.id },
            ],
        });

        const { status, data } = await load(`range=30d&agentId=${colleague.id}`);

        expect(status).toBe(200);
        expect(data.deals.won.value).toBe(900);
        expect(data.deals.lost.count).toBe(1);
        expect(data.deals.open.weighted).toBe(200);
        // the team table always shows everyone, whoever is picked
        const row = (id: number) => data.team.people.find((person: { id: number }) => person.id === id);
        expect(row(colleague.id)).toMatchObject({ revenue: 900, won: 1, winRate: 50, openValue: 400, leads: null });
        expect(row(user.id)).toMatchObject({ revenue: 100, winRate: 100 });
    });

    it("doesn't let someone who only sees their own work pick an agent", async () => {
        const { user } = await setUp(["deal:read"]);

        expect((await load(`range=30d&agentId=${user.id}`)).status).toBe(403);
    });

    it("shows each source's leads, conversions and revenue won, and why things were lost", async () => {
        const { user, org, won } = await setUp(["deal:read", "deal:all", "lead:read", "lead:all"]);
        const mine = { ...org, assignedToId: user.id };
        const [newStage, customer, lostLead, lostDeal, website, referral] = await Promise.all([
            prisma.leadStage.create({ data: { ...org, name: "New", order: 0 } }),
            prisma.leadStage.create({ data: { ...org, name: "Customer", order: 1, isConverted: true } }),
            prisma.leadStage.create({ data: { ...org, name: "Lost", order: 2, isLost: true } }),
            prisma.pipelineStage.create({ data: { ...org, name: "Lost", order: 2, isLost: true } }),
            prisma.leadSource.create({ data: { ...org, name: "Website" } }),
            prisma.leadSource.create({ data: { ...org, name: "Referral" } }),
        ]);
        const fromWebsite = await prisma.lead.create({ data: { ...mine, name: "Converted", stageId: customer.id, sourceId: website.id, utmCampaign: "diwali-sale" } });
        await prisma.lead.createMany({
            data: [
                { ...mine, name: "Still new", stageId: newStage.id, sourceId: website.id, utmCampaign: "diwali-sale" },
                { ...mine, name: "Gone quiet", stageId: lostLead.id, sourceId: referral.id, lostReason: "No budget" },
            ],
        });
        await prisma.deal.createMany({
            data: [
                { ...mine, title: "From the website", amount: 1000, pipelineStageId: won.id, closedAt: daysAgo(1), leadId: fromWebsite.id },
                { ...mine, title: "Too pricey", amount: 300, pipelineStageId: lostDeal.id, closedAt: daysAgo(1), lostReason: "Price too high" },
                { ...mine, title: "Lost before reasons", amount: 300, pipelineStageId: lostDeal.id, closedAt: daysAgo(1) },
            ],
        });

        const { data } = await load();

        expect(data.leads.sources.find((row: { id: number }) => row.id === website.id)).toMatchObject({ count: 2, converted: 1 });
        expect(data.deals.won.bySource).toEqual([{ sourceId: website.id, value: 1000, count: 1 }]);
        // only leads that came in from a campaign are counted per campaign
        expect(data.leads.campaigns).toEqual([{ campaign: "diwali-sale", count: 2, converted: 1 }]);
        expect(data.deals.won.byCampaign).toEqual([{ campaign: "diwali-sale", value: 1000, count: 1 }]);
        expect(data.deals.lost.reasons).toHaveLength(2);
        expect(data.deals.lost.reasons).toContainEqual({ reason: "Price too high", count: 1 });
        expect(data.deals.lost.reasons).toContainEqual({ reason: "Not recorded", count: 1 });
        expect(data.leads.lostReasons).toEqual([{ reason: "No budget", count: 1 }]);
    });

    it("rejects an unknown range", async () => {
        await setUp([]);

        expect((await load("range=5y")).status).toBe(400);
    });
});

describe("Deal.closedAt", () => {
    let organizationId: number;

    afterEach(async () => {
        if (organizationId) await cleanupOrg(organizationId);
        organizationId = 0;
    });

    it("is set when a deal moves into a won stage and cleared when it moves back out", async () => {
        const { organization, user } = await createOrgWithUser(["deal:update", "deal:all"]);
        organizationId = organization.id;
        (getCurrentUser as Mock).mockResolvedValue(user);
        const org = { organizationId: organization.id };
        const open = await prisma.pipelineStage.create({ data: { ...org, name: "Open", order: 0 } });
        const won = await prisma.pipelineStage.create({ data: { ...org, name: "Won", order: 1, isWon: true } });
        const deal = await prisma.deal.create({ data: { ...org, title: "Deal", pipelineStageId: open.id } });

        const move = (pipelineStageId: number) =>
            updateDeal(
                new NextRequest("http://localhost/api/deals", {
                    method: "PUT",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ pipelineStageId }),
                }),
                { params: Promise.resolve({ id: String(deal.id) }) },
            );

        expect((await move(won.id)).status).toBe(200);
        expect((await prisma.deal.findUniqueOrThrow({ where: { id: deal.id } })).closedAt).not.toBeNull();

        expect((await move(open.id)).status).toBe(200);
        expect((await prisma.deal.findUniqueOrThrow({ where: { id: deal.id } })).closedAt).toBeNull();
    });
});

describe("lost reasons", () => {
    let organizationId: number;

    afterEach(async () => {
        if (organizationId) await cleanupOrg(organizationId);
        organizationId = 0;
    });

    function send(method: "PUT" | "PATCH", body: object) {
        return new NextRequest("http://localhost/api", { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    }

    it("keeps a deal's reason while it's lost, and drops it when it's reopened", async () => {
        const { organization, user } = await createOrgWithUser(["deal:update", "deal:all"]);
        organizationId = organization.id;
        (getCurrentUser as Mock).mockResolvedValue(user);
        const org = { organizationId };
        const open = await prisma.pipelineStage.create({ data: { ...org, name: "Open", order: 0 } });
        const lost = await prisma.pipelineStage.create({ data: { ...org, name: "Lost", order: 1, isLost: true } });
        const deal = await prisma.deal.create({ data: { ...org, title: "Deal", pipelineStageId: open.id } });
        const params = { params: Promise.resolve({ id: String(deal.id) }) };

        expect((await updateDeal(send("PUT", { pipelineStageId: lost.id, lostReason: "Chose a competitor" }), params)).status).toBe(200);
        const saved = await prisma.deal.findUniqueOrThrow({ where: { id: deal.id }, include: { timeline: true } });
        expect(saved.lostReason).toBe("Chose a competitor");
        expect(saved.timeline.map((entry) => entry.message)).toContain("Deal lost: Chose a competitor");

        await updateDeal(send("PUT", { pipelineStageId: open.id }), params);
        expect((await prisma.deal.findUniqueOrThrow({ where: { id: deal.id } })).lostReason).toBeNull();
    });

    it("records one reason for a bulk move of leads, and clears it when one moves on", async () => {
        const { organization, user } = await createOrgWithUser(["lead:update", "lead:all"]);
        organizationId = organization.id;
        (getCurrentUser as Mock).mockResolvedValue(user);
        const org = { organizationId };
        const open = await prisma.leadStage.create({ data: { ...org, name: "New", order: 0 } });
        const lost = await prisma.leadStage.create({ data: { ...org, name: "Lost", order: 1, isLost: true } });
        const leads = await prisma.lead.createManyAndReturn({
            data: [
                { ...org, name: "One", stageId: open.id },
                { ...org, name: "Two", stageId: open.id },
            ],
        });

        const res = await bulkUpdateLeads(send("PATCH", { action: "stage", leadIds: leads.map((lead) => lead.id), stageId: lost.id, lostReason: "Stopped responding" }));
        expect(res.status).toBe(200);
        const moved = await prisma.lead.findMany({ where: { organizationId }, include: { timeline: true } });
        expect(moved.map((lead) => lead.lostReason)).toEqual(["Stopped responding", "Stopped responding"]);
        expect(moved[0].timeline[0].message).toBe("Lead stage changed from New to Lost (Stopped responding)");

        await updateLead(send("PUT", { stageId: open.id }), { params: Promise.resolve({ id: String(leads[0].id) }) });
        expect((await prisma.lead.findUniqueOrThrow({ where: { id: leads[0].id } })).lostReason).toBeNull();
    });
});
