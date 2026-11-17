import { afterEach, describe, expect, it, vi, type Mock } from "vitest";
import { NextRequest } from "next/server";

import { prisma } from "@/lib/db/prisma";
import { createOrgWithUser, createPipelineStage, createLeadStage, cleanupOrg } from "../helpers";

vi.mock("@/lib/auth/getCurrentUser", () => ({ getCurrentUser: vi.fn() }));
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { POST as convertLead } from "@/app/api/leads/[id]/convert/route";

function convertRequest(body: object) {
    return new NextRequest("http://localhost/api/leads/convert", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
    });
}

describe("POST /api/leads/:id/convert", () => {
    let organizationId: number;

    afterEach(async () => {
        if (organizationId) await cleanupOrg(organizationId);
    });

    it("creates a deal, flips the lead to CONVERTED, and logs the activity", async () => {
        const { organization, user } = await createOrgWithUser([
            "lead:read", "lead:update", "deal:create", "deal:read",
        ]);
        organizationId = organization.id;
        (getCurrentUser as Mock).mockResolvedValue(user);

        const stage = await createPipelineStage(organization.id);
        const newStage = await createLeadStage(organization.id, { name: "New" });
        const convertedStage = await createLeadStage(organization.id, { name: "Converted", order: 1, isConverted: true });
        const lead = await prisma.lead.create({
            data: { organizationId: organization.id, assignedToId: user.id, name: "Rahul Mehta", stageId: newStage.id },
        });

        const res = await convertLead(
            convertRequest({ title: "Rahul Mehta deal", pipelineStageId: stage.id, amount: 1000, probability: 10 }),
            { params: Promise.resolve({ id: String(lead.id) }) },
        );
        const json = await res.json();

        expect(res.status).toBe(201);
        expect(json.ok).toBe(true);
        expect(json.data.leadId).toBe(lead.id);
        expect(json.data.pipelineStageId).toBe(stage.id);
        expect(json.data.assignedToId).toBe(user.id);

        const updatedLead = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
        expect(updatedLead.stageId).toBe(convertedStage.id);

        const activity = await prisma.leadTimeline.findFirst({ where: { leadId: lead.id, type: "CONVERTED" } });
        // it links to the deal the lead became
        expect(activity?.metadata).toEqual({ dealId: json.data.id });
    });

    it("rejects converting a lead twice", async () => {
        const { organization, user } = await createOrgWithUser([
            "lead:read", "lead:update", "deal:create", "deal:read",
        ]);
        organizationId = organization.id;
        (getCurrentUser as Mock).mockResolvedValue(user);

        const stage = await createPipelineStage(organization.id);
        const convertedStage = await createLeadStage(organization.id, { name: "Converted", isConverted: true });
        const lead = await prisma.lead.create({
            data: { organizationId: organization.id, assignedToId: user.id, name: "Already Converted", stageId: convertedStage.id },
        });

        const res = await convertLead(
            convertRequest({ title: "Should not be created", pipelineStageId: stage.id }),
            { params: Promise.resolve({ id: String(lead.id) }) },
        );

        expect(res.status).toBe(409);
        const dealCount = await prisma.deal.count({ where: { leadId: lead.id } });
        expect(dealCount).toBe(0);
    });

    it("refuses without deal:create, and leaves the lead untouched", async () => {
        const { organization, user } = await createOrgWithUser(["lead:read", "lead:update"]);
        organizationId = organization.id;
        (getCurrentUser as Mock).mockResolvedValue(user);

        const stage = await createPipelineStage(organization.id);
        const newStage = await createLeadStage(organization.id, { name: "New" });
        const lead = await prisma.lead.create({
            data: { organizationId: organization.id, assignedToId: user.id, name: "No Deal Permission", stageId: newStage.id },
        });

        const res = await convertLead(
            convertRequest({ title: "Should not be created", pipelineStageId: stage.id }),
            { params: Promise.resolve({ id: String(lead.id) }) },
        );

        expect(res.status).toBe(403);

        const untouchedLead = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
        expect(untouchedLead.stageId).toBe(newStage.id);
        const dealCount = await prisma.deal.count({ where: { leadId: lead.id } });
        expect(dealCount).toBe(0);
    });
});
