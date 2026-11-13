import { afterEach, describe, expect, it, vi, type Mock } from "vitest";
import { NextRequest } from "next/server";

import { prisma } from "@/lib/db/prisma";
import { createOrgWithUser, createLeadStage, cleanupOrg, createPipelineStage } from "../helpers";

vi.mock("@/lib/auth/getCurrentUser", () => ({ getCurrentUser: vi.fn() }));
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { PATCH as bulkLeads } from "@/app/api/leads/bulkUpdate/route";
import { PATCH as bulkDeals } from "@/app/api/deals/bulkUpdate/route";
import { PUT as updateLead } from "@/app/api/leads/[id]/route";
import { PUT as updateDeal } from "@/app/api/deals/[id]/route";

function request(body: object) {
    return new NextRequest("http://localhost/api", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
    });
}

const params = (id: number) => ({ params: Promise.resolve({ id: String(id) }) });

describe("editing many records at once, and one field at a time", () => {
    let organizationId = 0;

    afterEach(async () => {
        if (organizationId) await cleanupOrg(organizationId);
        organizationId = 0;
    });

    async function setUp() {
        const { organization, user } = await createOrgWithUser(["lead:read", "lead:update", "lead:all", "deal:read", "deal:update", "deal:all"]);
        organizationId = organization.id;
        (getCurrentUser as Mock).mockResolvedValue(user);
        const org = { organizationId };

        // two custom fields on leads; "Region" is required
        await prisma.customFieldDefinition.createMany({
            data: [
                { ...org, entity: "lead", key: "budget", label: "Budget", type: "TEXT" },
                { ...org, entity: "lead", key: "region", label: "Region", type: "SELECT", options: ["North", "South"], required: true },
            ],
        });
        const stage = await createLeadStage(organizationId);
        const source = await prisma.leadSource.create({ data: { ...org, name: "Referral" } });
        const lead = (name: string) =>
            prisma.lead.create({ data: { ...org, name, stageId: stage.id, customFields: { budget: "10k", region: "North" } } });
        const leads = await Promise.all([lead("Acme"), lead("Globex")]);
        return { org, source, leads };
    }

    it("sets a source and a custom field on every selected lead, keeping their other custom fields", async () => {
        const { source, leads } = await setUp();
        const leadIds = leads.map((lead) => lead.id);

        const first = await bulkLeads(request({ action: "update", leadIds, changes: { sourceId: source.id } }));
        const second = await bulkLeads(request({ action: "update", leadIds, changes: { customFields: { budget: "50k" } } }));

        expect(first.status).toBe(200);
        expect(second.status).toBe(200);
        const saved = await prisma.lead.findMany({ where: { id: { in: leadIds } } });
        for (const lead of saved) {
            expect(lead.sourceId).toBe(source.id);
            expect(lead.customFields).toEqual({ budget: "50k", region: "North" });
        }
    });

    it("refuses a value a custom field doesn't allow, and changes nothing", async () => {
        const { leads } = await setUp();

        const res = await bulkLeads(request({ action: "update", leadIds: [leads[0].id], changes: { customFields: { region: "Mars" } } }));

        expect(res.status).toBe(400);
        expect((await prisma.lead.findUniqueOrThrow({ where: { id: leads[0].id } })).customFields).toEqual({ budget: "10k", region: "North" });
    });

    it("edits one custom field without tripping over another required one, and can clear it", async () => {
        const { leads } = await setUp();
        // a lead that's missing the required Region (made before Region existed, say)
        const old = await prisma.lead.update({ where: { id: leads[0].id }, data: { customFields: { budget: "10k" } } });
        const edit = (customFields: object) =>
            updateLead(new NextRequest("http://localhost/api", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ customFields }) }), params(old.id));

        expect((await edit({ budget: "20k" })).status).toBe(200);
        expect((await edit({ budget: "" })).status).toBe(200);
        expect((await prisma.lead.findUniqueOrThrow({ where: { id: old.id } })).customFields).toEqual({ budget: null });
    });

    it("sets amount and probability on many deals, and renaming one deal keeps its amount", async () => {
        const { org } = await setUp();
        const stage = await createPipelineStage(org.organizationId, { name: "Open" });
        const deals = await Promise.all(
            ["One", "Two"].map((title) => prisma.deal.create({ data: { ...org, title, amount: 1000, probability: 10, pipelineStageId: stage.id } })),
        );

        const res = await bulkDeals(request({ action: "update", dealIds: deals.map((deal) => deal.id), changes: { probability: 75 } }));
        expect(res.status).toBe(200);

        await updateDeal(
            new NextRequest("http://localhost/api", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: "Renamed" }) }),
            params(deals[0].id),
        );

        const renamed = await prisma.deal.findUniqueOrThrow({ where: { id: deals[0].id } });
        expect(renamed.title).toBe("Renamed");
        expect(Number(renamed.amount)).toBe(1000);
        expect(renamed.probability).toBe(75);
    });
});
