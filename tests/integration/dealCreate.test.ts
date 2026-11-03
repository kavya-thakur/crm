import { afterEach, describe, expect, it, vi, type Mock } from "vitest";
import { NextRequest } from "next/server";

import { prisma } from "@/lib/db/prisma";
import { createOrgWithUser, createLeadStage, cleanupOrg } from "../helpers";

vi.mock("@/lib/auth/getCurrentUser", () => ({ getCurrentUser: vi.fn() }));
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { GET as listDeals, POST as createDeal } from "@/app/api/deals/route";

const post = (body: object) =>
    createDeal(new NextRequest("http://localhost/api/deals", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));

describe("creating a deal", () => {
    let organizationId = 0;

    afterEach(async () => {
        if (organizationId) await cleanupOrg(organizationId);
        organizationId = 0;
    });

    async function setUp(permissions: string[]) {
        const { organization, user } = await createOrgWithUser(permissions);
        organizationId = organization.id;
        (getCurrentUser as Mock).mockResolvedValue(user);
        const stage = await prisma.pipelineStage.create({ data: { organizationId, name: "Proposal", order: 0 } });
        const colleague = await prisma.user.create({
            data: { organizationId, roleId: user.roleId, name: "Colleague", email: `deal-owner-${organizationId}@example.com`, passwordHash: "x" },
        });
        return { user, stage, colleague };
    }

    it("is the agent's own deal, so they can still see it, and only theirs", async () => {
        const { user, stage, colleague } = await setUp(["deal:create", "deal:read"]);

        const res = await post({ title: "Acme CRM", pipelineStageId: stage.id });
        expect(res.status).toBe(201);
        expect((await res.json()).data.assignedToId).toBe(user.id);

        expect((await post({ title: "For someone else", pipelineStageId: stage.id, assignedToId: colleague.id })).status).toBe(403);
        expect((await post({ title: "For nobody", pipelineStageId: stage.id, assignedToId: null })).status).toBe(403);
    });

    it("can be given to anyone, or nobody, by someone with deal:all", async () => {
        const { stage, colleague } = await setUp(["deal:create", "deal:read", "deal:all"]);

        expect((await (await post({ title: "Theirs", pipelineStageId: stage.id, assignedToId: colleague.id })).json()).data.assignedToId).toBe(colleague.id);
        expect((await (await post({ title: "Unassigned", pipelineStageId: stage.id, assignedToId: null })).json()).data.assignedToId).toBeNull();
    });

    it("comes with its lead's phone and email, so the person can be reached", async () => {
        const { stage } = await setUp(["deal:create", "deal:read"]);
        const leadStage = await createLeadStage(organizationId, { name: "New", order: 0 });
        const lead = await prisma.lead.create({ data: { organizationId, name: "Rahul", phone: "+91 98765 43210", email: "rahul@acme.example", stageId: leadStage.id } });

        await post({ title: "Acme CRM", pipelineStageId: stage.id, leadId: lead.id });
        const [deal] = (await (await listDeals(new NextRequest("http://localhost/api/deals"))).json()).data;
        expect(deal.lead).toEqual({ id: lead.id, name: "Rahul", phone: "+91 98765 43210", email: "rahul@acme.example" });
    });
});
