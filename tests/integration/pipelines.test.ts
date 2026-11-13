import { afterEach, describe, expect, it, vi, type Mock } from "vitest";
import { NextRequest } from "next/server";

import { prisma } from "@/lib/db/prisma";
import { createOrgWithUser, createPipelineStage, cleanupOrg } from "../helpers";

vi.mock("@/lib/auth/getCurrentUser", () => ({ getCurrentUser: vi.fn() }));
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { GET as listPipelines, POST as createPipelineRoute } from "@/app/api/pipelines/route";
import { PATCH as renamePipeline, DELETE as deletePipeline } from "@/app/api/pipelines/[id]/route";
import { GET as listStages, PUT as saveStages } from "@/app/api/pipeline-stages/route";
import { GET as listDeals } from "@/app/api/deals/route";
import { PUT as editDeal } from "@/app/api/deals/[id]/route";
import { GET as getDashboard } from "@/app/api/dashboard/route";

const send = (url: string, method = "GET", body?: object) =>
    new NextRequest(`http://localhost${url}`, { method, headers: { "content-type": "application/json" }, ...(body && { body: JSON.stringify(body) }) });
const params = (id: number) => ({ params: Promise.resolve({ id: String(id) }) });

// Several deal boards in one workspace, each with its own stages
describe("pipelines", () => {
    let organizationId = 0;
    afterEach(async () => {
        if (organizationId) await cleanupOrg(organizationId);
        organizationId = 0;
    });

    // "Sales pipeline" (Proposal, Won) as every workspace has, and an admin who manages and sees deals
    async function setUp() {
        const { organization, user } = await createOrgWithUser(["pipeline:manage", "deal:read", "deal:update", "deal:all"]);
        organizationId = organization.id;
        (getCurrentUser as Mock).mockResolvedValue(user);
        const proposal = await createPipelineStage(organizationId, { name: "Proposal", order: 0 });
        const won = await createPipelineStage(organizationId, { name: "Won", order: 1, isWon: true });
        return { user, proposal, won, sales: proposal.pipelineId };
    }

    const addPipeline = async (name: string) => (await createPipelineRoute(send("/api/pipelines", "POST", { name }))).json();

    it("adds a pipeline with stages to start from, and keeps names unique", async () => {
        await setUp();
        const created = await createPipelineRoute(send("/api/pipelines", "POST", { name: "Renewals" }));
        expect(created.status).toBe(201);
        const { data: renewals } = await created.json();
        expect(renewals.stages.map((stage: { name: string }) => stage.name)).toEqual(["New", "Qualified", "Won", "Lost"]);

        // the same name in other letters, on adding or renaming
        expect((await createPipelineRoute(send("/api/pipelines", "POST", { name: "renewals" }))).status).toBe(409);
        expect((await createPipelineRoute(send("/api/pipelines", "POST", { name: " " }))).status).toBe(400);
        const { data: partners } = await addPipeline("Partners");
        expect((await renamePipeline(send("", "PATCH", { name: "RENEWALS" }), params(partners.id))).status).toBe(409);
        expect((await renamePipeline(send("", "PATCH", { name: "Partnerships" }), params(partners.id))).status).toBe(200);

        const { data } = await (await listPipelines()).json();
        expect(data.map((pipeline: { name: string }) => pipeline.name)).toEqual(["Sales pipeline", "Renewals", "Partnerships"]);
    });

    it("deletes a pipeline only once it's empty, and never the last one", async () => {
        const { proposal, sales } = await setUp();
        const { data: renewals } = await addPipeline("Renewals");
        const deal = await prisma.deal.create({ data: { organizationId, title: "Acme renewal", pipelineStageId: renewals.stages[0].id } });

        const busy = await deletePipeline(send("", "DELETE"), params(renewals.id));
        expect(busy.status).toBe(409);
        expect((await busy.json()).message).toBe("Move or delete the 1 deal in Renewals first");

        await prisma.deal.update({ where: { id: deal.id }, data: { pipelineStageId: proposal.id } });
        expect((await deletePipeline(send("", "DELETE"), params(renewals.id))).status).toBe(200);
        // its stages went with it
        expect(await prisma.pipelineStage.count({ where: { pipelineId: renewals.id } })).toBe(0);

        const last = await deletePipeline(send("", "DELETE"), params(sales));
        expect(last.status).toBe(409);
        expect((await last.json()).message).toBe("A workspace needs at least one pipeline");
    });

    it("edits one pipeline's stages at a time, and can't touch another's", async () => {
        const { proposal, won, sales } = await setUp();
        const { data: renewals } = await addPipeline("Renewals");

        // "Won" again is fine: names are unique within a pipeline
        expect(renewals.stages.some((stage: { name: string }) => stage.name === "Won")).toBe(true);

        const onlySales = await (await listStages(send(`/api/pipeline-stages?pipelineId=${sales}`))).json();
        expect(onlySales.data.map((stage: { id: number }) => stage.id)).toEqual([proposal.id, won.id]);

        // saving Renewals' list with a Sales stage in it: refused, nothing changed
        const options = [{ id: proposal.id, name: "Hijacked", color: "#3a5bc7" }];
        expect((await saveStages(send(`/api/pipeline-stages?pipelineId=${renewals.id}`, "PUT", { options }))).status).toBe(400);
        expect((await prisma.pipelineStage.findUniqueOrThrow({ where: { id: proposal.id } })).name).toBe("Proposal");
        // and a list with no pipeline at all
        expect((await saveStages(send("/api/pipeline-stages", "PUT", { options }))).status).toBe(400);
    });

    it("lists one pipeline's deals, moves a deal across, and counts the dashboard per pipeline", async () => {
        const { proposal, won } = await setUp();
        const { data: renewals } = await addPipeline("Renewals");
        const [renewalNew, , renewalWon] = renewals.stages;
        await prisma.deal.create({ data: { organizationId, title: "New sale", amount: 1000, pipelineStageId: won.id, closedAt: new Date() } });
        await prisma.deal.create({ data: { organizationId, title: "Renewal", amount: 300, pipelineStageId: renewalWon.id, closedAt: new Date() } });
        const open = await prisma.deal.create({ data: { organizationId, title: "Open sale", pipelineStageId: proposal.id } });

        const titles = async (pipelineId: number) =>
            (await (await listDeals(send(`/api/deals?pipelineId=${pipelineId}`))).json()).data.map((deal: { title: string }) => deal.title).sort();
        expect(await titles(won.pipelineId)).toEqual(["New sale", "Open sale"]);
        expect(await titles(renewals.id)).toEqual(["Renewal"]);
        // each pipeline's card in Settings says how many deals it has
        const { data: cards } = await (await listPipelines()).json();
        expect(cards.map((pipeline: { dealCount: number }) => pipeline.dealCount)).toEqual([2, 1]);

        const wonValue = async (query: string) => (await (await getDashboard(send(`/api/dashboard?range=30d${query}`))).json()).data.deals.won.value;
        expect(await wonValue("")).toBe(1300);
        expect(await wonValue(`&pipelineId=${renewals.id}`)).toBe(300);

        // into another pipeline: one of its stages, said plainly on the timeline
        const moved = await editDeal(send("", "PUT", { pipelineStageId: renewalNew.id }), params(open.id));
        expect(moved.status).toBe(200);
        expect(await titles(renewals.id)).toEqual(["Open sale", "Renewal"]);
        const [entry] = await prisma.dealTimeline.findMany({ where: { dealId: open.id, type: "STAGE_CHANGED" } });
        expect(entry.message).toBe("Deal moved to the Renewals pipeline");
    });
});
