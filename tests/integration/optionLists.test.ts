import { afterEach, describe, expect, it, vi, type Mock } from "vitest";
import { NextRequest } from "next/server";

import { prisma } from "@/lib/db/prisma";
import { createOrgWithUser, createPipelineStage, cleanupOrg } from "../helpers";

vi.mock("@/lib/auth/getCurrentUser", () => ({ getCurrentUser: vi.fn() }));
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { PUT as savePipelineStages } from "@/app/api/pipeline-stages/route";
import { PUT as saveLeadSources } from "@/app/api/lead-sources/route";

function putRequest(body: object) {
    return new NextRequest("http://localhost/api/pipeline-stages", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
    });
}

const RED = "#ce2c31";
const BLUE = "#3a5bc7";

describe("PUT /api/pipeline-stages (save the whole list)", () => {
    let organizationId: number;

    afterEach(async () => {
        if (organizationId) await cleanupOrg(organizationId);
    });

    async function setUp() {
        const { organization, user } = await createOrgWithUser(["pipeline:manage"]);
        organizationId = organization.id;
        (getCurrentUser as Mock).mockResolvedValue(user);
        const open = await createPipelineStage(organization.id, { name: "Open", order: 0 });
        const closed = await createPipelineStage(organization.id, { name: "Closed", order: 1 });
        return { organization, open, closed };
    }

    it("swaps two names without tripping the unique-name rule", async () => {
        const { open, closed } = await setUp();

        const res = await savePipelineStages(
            putRequest({
                options: [
                    { id: open.id, name: "Closed", color: RED },
                    { id: closed.id, name: "Open", color: BLUE },
                ],
            }),
        );

        expect(res.status).toBe(200);
        const names = (await res.json()).data.map((stage: { id: number; name: string }) => [stage.id, stage.name]);
        expect(names).toEqual([
            [open.id, "Closed"],
            [closed.id, "Open"],
        ]);
    });

    it("reorders, adds and removes in one save", async () => {
        const { open, closed } = await setUp();

        const res = await savePipelineStages(
            putRequest({
                options: [
                    { name: "Negotiation", color: BLUE },
                    { id: closed.id, name: "Closed", color: RED, isWon: true },
                ],
            }),
        );
        const json = await res.json();

        expect(res.status).toBe(200);
        expect(json.data.map((stage: { name: string }) => stage.name)).toEqual(["Negotiation", "Closed"]);
        expect(json.data[1].isWon).toBe(true);
        expect(await prisma.pipelineStage.count({ where: { id: open.id } })).toBe(0);
    });

    it("refuses to remove a stage that still has deals, and changes nothing", async () => {
        const { organization, open, closed } = await setUp();
        await prisma.deal.create({ data: { organizationId: organization.id, pipelineStageId: open.id, title: "Blocking deal" } });

        const res = await savePipelineStages(putRequest({ options: [{ id: closed.id, name: "Renamed", color: RED }] }));

        expect(res.status).toBe(409);
        expect((await res.json()).message).toContain("Open");
        const stillThere = await prisma.pipelineStage.findMany({ where: { organizationId: organization.id }, orderBy: { order: "asc" } });
        expect(stillThere.map((stage) => stage.name)).toEqual(["Open", "Closed"]);
    });

    it("rejects the same name twice, and a stage that's both won and lost", async () => {
        const { open, closed } = await setUp();

        const duplicate = await savePipelineStages(
            putRequest({
                options: [
                    { id: open.id, name: "Same", color: RED },
                    { id: closed.id, name: "same ", color: BLUE },
                ],
            }),
        );
        expect(duplicate.status).toBe(400);

        const both = await savePipelineStages(putRequest({ options: [{ id: open.id, name: "Open", color: RED, isWon: true, isLost: true }] }));
        expect(both.status).toBe(400);
    });
});

describe("PUT /api/lead-sources (save the whole list)", () => {
    let organizationId: number;

    afterEach(async () => {
        if (organizationId) await cleanupOrg(organizationId);
    });

    it("removes a source that leads use, leaving those leads without one", async () => {
        const { organization, user } = await createOrgWithUser(["lead-sources:manage"]);
        organizationId = organization.id;
        (getCurrentUser as Mock).mockResolvedValue(user);

        const source = await prisma.leadSource.create({ data: { organizationId: organization.id, name: "Website", order: 0 } });
        const stage = await prisma.leadStage.create({ data: { organizationId: organization.id, name: "New", order: 0 } });
        const lead = await prisma.lead.create({
            data: { organizationId: organization.id, name: "Acme", stageId: stage.id, sourceId: source.id },
        });

        const res = await saveLeadSources(putRequest({ options: [{ name: "Referral", color: RED }] }));

        expect(res.status).toBe(200);
        expect((await res.json()).data.map((item: { name: string }) => item.name)).toEqual(["Referral"]);
        expect((await prisma.lead.findUnique({ where: { id: lead.id } }))?.sourceId).toBeNull();
    });
});
