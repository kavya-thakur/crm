import { afterEach, describe, expect, it, vi, type Mock } from "vitest";
import { NextRequest } from "next/server";
import Papa from "papaparse";

import { prisma } from "@/lib/db/prisma";
import { createOrgWithUser, createLeadStage, cleanupOrg } from "../helpers";

vi.mock("@/lib/auth/getCurrentUser", () => ({ getCurrentUser: vi.fn() }));

import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { GET as listLeads } from "@/app/api/leads/route";
import { GET as listDeals } from "@/app/api/deals/route";
import { GET as listContacts } from "@/app/api/contacts/route";

// the downloaded file, as rows keyed by column name
const csv = async (res: Response) => Papa.parse<Record<string, string>>((await res.text()).replace(/^﻿/, ""), { header: true, skipEmptyLines: true }).data;

describe("exports", () => {
    let organizationId = 0;
    afterEach(async () => {
        if (organizationId) await cleanupOrg(organizationId);
        organizationId = 0;
    });

    it("puts every field in the file, custom fields included, with readable values", async () => {
        const { organization, user } = await createOrgWithUser(["lead:read", "lead:all", "deal:read", "deal:all", "contact:read", "contact:all"]);
        organizationId = organization.id;
        (getCurrentUser as Mock).mockResolvedValue(user);
        const org = { organizationId };
        const by = { createdById: user.id, updatedById: user.id, assignedToId: user.id };

        // one custom field of each kind on every record type
        for (const entity of ["lead", "deal", "contact"]) {
            await prisma.customFieldDefinition.createMany({
                data: [
                    { ...org, entity, key: "budget", label: "Budget", type: "TEXT" },
                    { ...org, entity, key: "vip", label: "VIP", type: "BOOLEAN" },
                    { ...org, entity, key: "renewal", label: "Renewal", type: "DATE" },
                    { ...org, entity, key: "helper", label: "Helper", type: "AGENT" },
                ],
            });
        }
        const custom = { budget: "10L+", vip: true, renewal: "2027-01-15", helper: user.id };
        const customOut = { Budget: "10L+", VIP: "Yes", Renewal: "2027-01-15", Helper: user.name };

        const stage = await createLeadStage(organizationId, { name: "New", order: 0 });
        const source = await prisma.leadSource.create({ data: { ...org, name: "Website" } });
        const company = await prisma.company.create({ data: { ...org, name: "Acme" } });
        const contact = await prisma.contact.create({
            data: { ...org, ...by, name: "Rahul Mehta", phone: "+91 98000 80001", email: "rahul@acme.example", jobTitle: "CTO", description: "Met at the expo", companyId: company.id, customFields: custom },
        });
        await prisma.lead.create({
            data: { ...org, ...by, name: "Rahul Mehta", phone: "+91 98000 80001", email: "rahul@acme.example", companyName: "Acme", stageId: stage.id, sourceId: source.id, contactId: contact.id, utmSource: "google", utmMedium: "cpc", utmCampaign: "diwali", customFields: custom },
        });
        const lead = await prisma.lead.findFirstOrThrow({ where: org });
        const pipeline = await prisma.pipelineStage.create({ data: { ...org, name: "Proposal" } });
        const deal = await prisma.deal.create({
            data: { ...org, ...by, title: "Acme licence", amount: 250000, probability: 60, description: "Annual plan", pipelineStageId: pipeline.id, leadId: lead.id, customFields: custom },
        });
        await prisma.dealProduct.createMany({ data: [{ dealId: deal.id, name: "Licence", price: 1000, quantity: 2 }, { dealId: deal.id, name: "Setup", price: 500 }] });

        const [leadRow] = await csv(await listLeads(new NextRequest("http://localhost/api/leads?format=csv")));
        expect(leadRow).toMatchObject({
            Name: "Rahul Mehta", Email: "rahul@acme.example", Phone: "+91 98000 80001", Company: "Acme", Stage: "New", Source: "Website",
            Campaign: "diwali", "UTM source": "google", "UTM medium": "cpc", "Assigned to": user.name, "Created by": user.name, "Last modified by": user.name,
            ...customOut,
        });

        const [dealRow] = await csv(await listDeals(new NextRequest("http://localhost/api/deals?format=csv")));
        expect(dealRow).toMatchObject({
            Title: "Acme licence", Amount: "250000", "Probability %": "60", Stage: "Proposal", Lead: "Rahul Mehta", Company: "Acme",
            Description: "Annual plan", Products: "2 × Licence; 1 × Setup", "Created by": user.name, "Last modified by": user.name,
            ...customOut,
        });

        const [contactRow] = await csv(await listContacts(new NextRequest("http://localhost/api/contacts?format=csv")));
        expect(contactRow).toMatchObject({
            Name: "Rahul Mehta", Company: "Acme", "Job title": "CTO", Description: "Met at the expo", "Created by": user.name, "Last modified by": user.name,
            ...customOut,
        });
        // nothing left empty that the record has
        for (const row of [leadRow, dealRow, contactRow]) {
            expect(Object.entries(row).filter(([column, value]) => value === "" && !["Lost reason", "Closed", "Expected close"].includes(column))).toEqual([]);
        }
    });
});
