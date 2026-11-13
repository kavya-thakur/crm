import { afterEach, describe, expect, it, vi, type Mock } from "vitest";
import { NextRequest } from "next/server";

import { prisma } from "@/lib/db/prisma";
import { createOrgWithUser, createLeadStage, cleanupOrg } from "../helpers";

vi.mock("@/lib/auth/getCurrentUser", () => ({ getCurrentUser: vi.fn() }));
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { PATCH as bulkUpdateLeads } from "@/app/api/leads/bulkUpdate/route";

function bulkRequest(body: object) {
    return new NextRequest("http://localhost/api/leads/bulkUpdate", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
    });
}

describe("PATCH /api/leads/bulkUpdate", () => {
    let organizationId: number;

    afterEach(async () => {
        if (organizationId) await cleanupOrg(organizationId);
    });

    it("without lead:all, refuses to delete a lead outside the caller's scope and deletes nothing", async () => {
        const { organization, user: agent } = await createOrgWithUser(["lead:read", "lead:delete"]);
        organizationId = organization.id;

        const otherAgent = await prisma.user.create({
            data: {
                organizationId: organization.id,
                roleId: agent.roleId,
                name: "Other Agent",
                email: `other-${Date.now()}@example.com`,
                passwordHash: "x",
            },
        });

        const stage = await createLeadStage(organization.id);
        const ownLead = await prisma.lead.create({
            data: { organizationId: organization.id, assignedToId: agent.id, name: "Mine", stageId: stage.id },
        });
        const othersLead = await prisma.lead.create({
            data: { organizationId: organization.id, assignedToId: otherAgent.id, name: "Not mine", stageId: stage.id },
        });

        (getCurrentUser as Mock).mockResolvedValue(agent);

        const res = await bulkUpdateLeads(
            bulkRequest({ action: "delete", leadIds: [ownLead.id, othersLead.id] }),
        );
        const json = await res.json();

        expect(res.status).toBe(404);
        expect(json.notFoundIds).toEqual([othersLead.id]);

        // all-or-nothing: the in-scope lead wasn't deleted either
        const remaining = await prisma.lead.count({ where: { id: { in: [ownLead.id, othersLead.id] } } });
        expect(remaining).toBe(2);
    });

    it("deletes leads that are fully within the caller's scope", async () => {
        const { organization, user: agent } = await createOrgWithUser(["lead:read", "lead:delete"]);
        organizationId = organization.id;
        (getCurrentUser as Mock).mockResolvedValue(agent);

        const stage = await createLeadStage(organization.id);
        const lead = await prisma.lead.create({
            data: { organizationId: organization.id, assignedToId: agent.id, name: "Mine", stageId: stage.id },
        });

        const res = await bulkUpdateLeads(bulkRequest({ action: "delete", leadIds: [lead.id] }));
        const json = await res.json();

        expect(res.status).toBe(200);
        expect(json.affected).toBe(1);
        const remaining = await prisma.lead.count({ where: { id: lead.id } });
        expect(remaining).toBe(0);
    });
    it("won't reopen a lost lead as a second open lead for the same person", async () => {
        const { organization, user } = await createOrgWithUser(["lead:read", "lead:update", "lead:all"]);
        organizationId = organization.id;
        (getCurrentUser as Mock).mockResolvedValue(user);

        const open = await createLeadStage(organization.id, { name: "New", order: 0 });
        const lost = await createLeadStage(organization.id, { name: "Lost", order: 1, isLost: true });
        const lead = (name: string, stageId: number, contact: { phone?: string; email?: string }) =>
            prisma.lead.create({ data: { organizationId: organization.id, name, stageId, ...contact } });

        await lead("Rahul (open)", open.id, { phone: "98765 43210" });
        const rahulLost = await lead("Rahul (lost)", lost.id, { phone: "+91 98765-43210" });
        // the same person lost twice: only the first one comes back
        const ashaFirst = await lead("Asha", lost.id, { email: "asha@example.com" });
        const ashaAgain = await lead("Asha again", lost.id, { email: "ASHA@example.com" });
        const someoneNew = await lead("Someone new", lost.id, { phone: "90000 11111" });

        const res = await bulkUpdateLeads(bulkRequest({ action: "stage", stageId: open.id, leadIds: [rahulLost.id, ashaFirst.id, ashaAgain.id, someoneNew.id] }));
        expect(await res.json()).toMatchObject({ ok: true, affected: 2, skipped: 2 });

        const stages = await prisma.lead.findMany({ where: { id: { in: [rahulLost.id, ashaFirst.id, ashaAgain.id, someoneNew.id] } }, select: { id: true, stageId: true } });
        expect(Object.fromEntries(stages.map((row) => [row.id, row.stageId]))).toEqual({
            [rahulLost.id]: lost.id,
            [ashaFirst.id]: open.id,
            [ashaAgain.id]: lost.id,
            [someoneNew.id]: open.id,
        });
    });
});
