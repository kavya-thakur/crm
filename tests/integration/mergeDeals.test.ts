import { afterEach, describe, expect, it, vi, type Mock } from "vitest";
import { NextRequest } from "next/server";

import { prisma } from "@/lib/db/prisma";
import { createOrgWithUser, createLeadStage, cleanupOrg } from "../helpers";

vi.mock("@/lib/auth/getCurrentUser", () => ({ getCurrentUser: vi.fn() }));
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { POST as mergeDeal } from "@/app/api/deals/[id]/merge/route";
import { GET as findDuplicates } from "@/app/api/deals/[id]/duplicates/route";

const params = (id: number) => ({ params: Promise.resolve({ id: String(id) }) });

function merge(keepId: number, body: object) {
    return mergeDeal(
        new NextRequest(`http://localhost/api/deals/${keepId}/merge`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
        params(keepId),
    );
}

describe("merging duplicate deals", () => {
    let organizationId = 0;

    afterEach(async () => {
        if (organizationId) await cleanupOrg(organizationId);
        organizationId = 0;
    });

    async function setUp(permissions = ["deal:read", "deal:update", "deal:delete", "deal:all"]) {
        const { organization, user } = await createOrgWithUser(permissions);
        organizationId = organization.id;
        (getCurrentUser as Mock).mockResolvedValue(user);
        const org = { organizationId };
        const [open, lost] = await Promise.all([
            prisma.pipelineStage.create({ data: { ...org, name: "Proposal", order: 0 } }),
            prisma.pipelineStage.create({ data: { ...org, name: "Lost", order: 1, isLost: true } }),
        ]);
        return { org, user, open, lost };
    }

    it("moves the duplicate's history over, keeps the picked values and fills in blanks", async () => {
        const { org, user, open, lost } = await setUp();
        const kept = await prisma.deal.create({ data: { ...org, title: "Acme CRM", amount: 0, probability: 40, pipelineStageId: open.id, customFields: { seats: 10 } } });
        const duplicate = await prisma.deal.create({
            data: {
                ...org,
                title: "Acme CRM licence",
                amount: 250000,
                probability: 10,
                pipelineStageId: lost.id,
                closedAt: new Date("2026-10-01"),
                lostReason: "Bad timing",
                description: "Wants 20 seats",
                customFields: { seats: 20, region: "West" },
                timeline: { create: { userId: user.id, type: "CREATED", message: "Deal created" } },
                notes: { create: { authorId: user.id, body: "Call on Monday" } },
                tasks: { create: { ...org, title: "Send quote", dueDate: new Date(), assignedToId: user.id, createdById: user.id } },
            },
        });

        // the duplicate's stage (lost, with its reason), everything else stays or fills in
        expect((await merge(kept.id, { duplicateId: duplicate.id, fromDuplicate: ["pipelineStageId"] })).status).toBe(200);

        expect(await prisma.deal.findUnique({ where: { id: duplicate.id } })).toBeNull();
        const merged = await prisma.deal.findUniqueOrThrow({ where: { id: kept.id }, include: { timeline: true, notes: true, tasks: true } });
        expect(merged).toMatchObject({ title: "Acme CRM", probability: 40, description: "Wants 20 seats", pipelineStageId: lost.id, lostReason: "Bad timing" });
        // an amount of 0 counts as not known yet, so the duplicate's fills it in
        expect(Number(merged.amount)).toBe(250000);
        expect(merged.closedAt?.toISOString()).toBe("2026-10-01T00:00:00.000Z");
        expect(merged.customFields).toEqual({ seats: 10, region: "West" });
        expect([merged.notes.length, merged.tasks.length]).toEqual([1, 1]);
        expect(merged.timeline.map((entry) => entry.type).sort()).toEqual(["CREATED", "MERGED"]);
    });

    it("refuses the same deal twice, other people's deals, and anyone who can't delete", async () => {
        const { org, user, open } = await setUp(["deal:read", "deal:update", "deal:delete"]);
        const colleague = await prisma.user.create({
            data: { ...org, roleId: user.roleId, name: "Colleague", email: `deal-merge-${organizationId}@example.com`, passwordHash: "x" },
        });
        const mine = await prisma.deal.create({ data: { ...org, title: "Mine", pipelineStageId: open.id, assignedToId: user.id } });
        const theirs = await prisma.deal.create({ data: { ...org, title: "Theirs", pipelineStageId: open.id, assignedToId: colleague.id } });

        expect((await merge(mine.id, { duplicateId: mine.id })).status).toBe(400);
        expect((await merge(mine.id, { duplicateId: theirs.id })).status).toBe(404);

        const permissions = user.role.permissions.filter(({ permission }) => permission.name !== "deal:delete");
        (getCurrentUser as Mock).mockResolvedValue({ ...user, role: { ...user.role, permissions } });
        expect((await merge(mine.id, { duplicateId: theirs.id })).status).toBe(403);
        expect(await prisma.deal.count({ where: org })).toBe(2);
    });

    it("suggests deals with the same title, or another open deal for the same lead", async () => {
        const { org, open, lost } = await setUp();
        const stage = await createLeadStage(organizationId, { name: "New", order: 0 });
        const lead = await prisma.lead.create({ data: { ...org, name: "Acme", stageId: stage.id } });
        const deal = await prisma.deal.create({ data: { ...org, title: "Acme CRM", pipelineStageId: open.id, leadId: lead.id } });
        await prisma.deal.createMany({
            data: [
                { ...org, title: "ACME crm", pipelineStageId: open.id },
                { ...org, title: "Acme renewal", pipelineStageId: open.id, leadId: lead.id },
                // a closed deal for the same lead is a real earlier deal, not a copy
                { ...org, title: "Acme pilot", pipelineStageId: lost.id, leadId: lead.id, closedAt: new Date() },
                { ...org, title: "Something else", pipelineStageId: open.id },
            ],
        });

        const res = await findDuplicates(new NextRequest(`http://localhost/api/deals/${deal.id}/duplicates`), params(deal.id));
        const matches: { title: string; matchedOn: string }[] = (await res.json()).data;
        expect(matches.map((match) => `${match.title}:${match.matchedOn}`).sort()).toEqual(["ACME crm:title", "Acme renewal:lead"]);
    });
});
