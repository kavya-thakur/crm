import { afterEach, describe, expect, it, vi, type Mock } from "vitest";
import { NextRequest } from "next/server";

import { prisma } from "@/lib/db/prisma";
import { createOrgWithUser, createLeadStage, cleanupOrg, createPipelineStage } from "../helpers";

vi.mock("@/lib/auth/getCurrentUser", () => ({ getCurrentUser: vi.fn() }));

import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { PUT as updateLead } from "@/app/api/leads/[id]/route";
import { PATCH as bulkLeads } from "@/app/api/leads/bulkUpdate/route";
import { PUT as updateDeal } from "@/app/api/deals/[id]/route";
import { PUT as updateContact } from "@/app/api/contacts/[id]/route";

const send = (method: string, body: object) => new NextRequest("http://localhost", { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const params = (id: number) => ({ params: Promise.resolve({ id: String(id) }) });

describe("activity history", () => {
    let organizationId = 0;
    afterEach(async () => {
        if (organizationId) await cleanupOrg(organizationId);
        organizationId = 0;
    });

    async function setUp() {
        const { organization, user } = await createOrgWithUser(["lead:read", "lead:update", "lead:all", "deal:read", "deal:update", "deal:all", "contact:read", "contact:update", "contact:all"]);
        organizationId = organization.id;
        (getCurrentUser as Mock).mockResolvedValue(user);
        const org = { organizationId };
        const stage = await createLeadStage(organizationId, { name: "New", order: 0 });
        return { user, org, stage };
    }

    it("puts each changed field of a lead on its timeline, with who did it, and nothing for an unchanged one", async () => {
        const { user, org, stage } = await setUp();
        await prisma.customFieldDefinition.create({ data: { ...org, entity: "lead", key: "budget", label: "Budget", type: "TEXT" } });
        const lead = await prisma.lead.create({ data: { ...org, name: "Rahul", email: "rahul@acme.example", stageId: stage.id } });

        await updateLead(send("PUT", { email: "rahul@globex.example", companyName: "Globex", name: "Rahul" }), params(lead.id));
        await updateLead(send("PUT", { customFields: { budget: "5L" } }), params(lead.id));
        await updateLead(send("PUT", { email: null }), params(lead.id));

        const entries = await prisma.leadTimeline.findMany({ where: { leadId: lead.id, type: "UPDATED" }, orderBy: { id: "asc" } });
        expect(entries.map((entry) => entry.message)).toEqual([
            "changed Email from rahul@acme.example to rahul@globex.example",
            "set Company to Globex",
            "set Budget to 5L",
            "cleared Email (was rahul@globex.example)",
        ]);
        expect(entries.every((entry) => entry.userId === user.id)).toBe(true);
        expect(entries[0].metadata).toEqual({ field: "email", from: "rahul@acme.example", to: "rahul@globex.example" });
    });

    it("shows a deal's money in the workspace's currency, and a contact's company by name", async () => {
        const { org } = await setUp();
        const pipeline = await createPipelineStage(org.organizationId, { name: "Proposal" });
        const deal = await prisma.deal.create({ data: { ...org, title: "Licence", amount: 100000, probability: 20, pipelineStageId: pipeline.id } });
        await updateDeal(send("PUT", { amount: 80000, probability: 60 }), params(deal.id));
        expect((await prisma.dealTimeline.findMany({ where: { dealId: deal.id, type: "UPDATED" }, orderBy: { id: "asc" } })).map((entry) => entry.message)).toEqual([
            "changed Amount from ₹1,00,000 to ₹80,000",
            "changed Probability from 20% to 60%",
        ]);

        const contact = await prisma.contact.create({ data: { ...org, name: "Asha", phone: "+91 98000 70001" } });
        await updateContact(send("PUT", { companyName: "Initech", jobTitle: "CTO" }), params(contact.id));
        expect((await prisma.contactTimeline.findMany({ where: { contactId: contact.id, type: "UPDATED" }, orderBy: { id: "asc" } })).map((entry) => entry.message)).toEqual([
            "set Job title to CTO",
            "set Company to Initech",
        ]);
    });

    it("notes a bulk edit on every lead it changed", async () => {
        const { org, stage } = await setUp();
        const [one, two] = await Promise.all([
            prisma.lead.create({ data: { ...org, name: "One", stageId: stage.id } }),
            prisma.lead.create({ data: { ...org, name: "Two", stageId: stage.id } }),
        ]);
        expect((await bulkLeads(send("PATCH", { action: "update", leadIds: [one.id, two.id], changes: { companyName: "Acme" } }))).status).toBe(200);

        const entries = await prisma.leadTimeline.findMany({ where: { leadId: { in: [one.id, two.id] }, type: "UPDATED" } });
        expect(entries.map((entry) => entry.message)).toEqual(["set Company to Acme (bulk edit)", "set Company to Acme (bulk edit)"]);
    });
});
