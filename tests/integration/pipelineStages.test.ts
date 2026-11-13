import { afterEach, describe, expect, it, vi, type Mock } from "vitest";
import { NextRequest } from "next/server";

import { prisma } from "@/lib/db/prisma";
import { createOrgWithUser, createPipelineStage, cleanupOrg } from "../helpers";

vi.mock("@/lib/auth/getCurrentUser", () => ({ getCurrentUser: vi.fn() }));
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { DELETE as deleteStage, PATCH as patchStage } from "@/app/api/pipeline-stages/[id]/route";

function patchRequest(body: object) {
    return new NextRequest("http://localhost/api/pipeline-stages/patch", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
    });
}

describe("DELETE /api/pipeline-stages/:id", () => {
    let organizationId: number;

    afterEach(async () => {
        if (organizationId) await cleanupOrg(organizationId);
    });

    it("refuses to delete a stage that still has deals in it", async () => {
        const { organization, user } = await createOrgWithUser(["pipeline:manage"]);
        organizationId = organization.id;
        (getCurrentUser as Mock).mockResolvedValue(user);

        const stage = await createPipelineStage(organization.id);
        // a pipeline keeps at least one stage: another one, so this one may go
        await createPipelineStage(organization.id, { name: "Other", order: 1 });
        await prisma.deal.create({
            data: { organizationId: organization.id, pipelineStageId: stage.id, title: "Blocking deal" },
        });

        const res = await deleteStage(
            new NextRequest("http://localhost/api/pipeline-stages/1", { method: "DELETE" }),
            { params: Promise.resolve({ id: String(stage.id) }) },
        );
        const json = await res.json();

        expect(res.status).toBe(409);
        expect(json.message).toContain("1 deal");

        const stillThere = await prisma.pipelineStage.findUnique({ where: { id: stage.id } });
        expect(stillThere).not.toBeNull();
    });

    it("deletes a stage with no deals in it", async () => {
        const { organization, user } = await createOrgWithUser(["pipeline:manage"]);
        organizationId = organization.id;
        (getCurrentUser as Mock).mockResolvedValue(user);

        const stage = await createPipelineStage(organization.id);
        await createPipelineStage(organization.id, { name: "Other", order: 1 });

        const res = await deleteStage(
            new NextRequest("http://localhost/api/pipeline-stages/1", { method: "DELETE" }),
            { params: Promise.resolve({ id: String(stage.id) }) },
        );

        expect(res.status).toBe(200);
        const gone = await prisma.pipelineStage.findUnique({ where: { id: stage.id } });
        expect(gone).toBeNull();
    });
});

describe("PATCH /api/pipeline-stages/:id", () => {
    let organizationId: number;

    afterEach(async () => {
        if (organizationId) await cleanupOrg(organizationId);
    });

    it("renames a stage", async () => {
        const { organization, user } = await createOrgWithUser(["pipeline:manage"]);
        organizationId = organization.id;
        (getCurrentUser as Mock).mockResolvedValue(user);

        const stage = await createPipelineStage(organization.id, { name: "Qualification" });

        const res = await patchStage(patchRequest({ name: "Discovery" }), {
            params: Promise.resolve({ id: String(stage.id) }),
        });
        const json = await res.json();

        expect(res.status).toBe(200);
        expect(json.data.name).toBe("Discovery");
    });

    it("rejects a stage that would be both won and lost", async () => {
        const { organization, user } = await createOrgWithUser(["pipeline:manage"]);
        organizationId = organization.id;
        (getCurrentUser as Mock).mockResolvedValue(user);

        const stage = await createPipelineStage(organization.id, { name: "Won", isWon: true });

        const res = await patchStage(patchRequest({ isLost: true }), {
            params: Promise.resolve({ id: String(stage.id) }),
        });

        expect(res.status).toBe(400);

        const unchanged = await prisma.pipelineStage.findUniqueOrThrow({ where: { id: stage.id } });
        expect(unchanged.isLost).toBe(false);
    });
});
