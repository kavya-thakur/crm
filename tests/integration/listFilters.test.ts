import { afterEach, describe, expect, it, vi, type Mock } from "vitest";
import { NextRequest } from "next/server";

import { prisma } from "@/lib/db/prisma";
import { createOrgWithUser, createLeadStage, cleanupOrg } from "../helpers";

vi.mock("@/lib/auth/getCurrentUser", () => ({ getCurrentUser: vi.fn() }));
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { GET as listLeads, POST as createLead } from "@/app/api/leads/route";
import { PUT as updateLead } from "@/app/api/leads/[id]/route";
import { PATCH as bulkLeads } from "@/app/api/leads/bulkUpdate/route";

function send(method: string, body: object) {
    return new NextRequest("http://localhost/api/leads", {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
    });
}

const names = async (res: Response) => ((await res.json()).data as { name: string }[]).map((lead) => lead.name).sort();
const list = (query: string) => listLeads(new NextRequest(`http://localhost/api/leads?${query}`));

describe("who created and last changed a lead, and filtering by it", () => {
    let organizationId = 0;

    afterEach(async () => {
        if (organizationId) await cleanupOrg(organizationId);
        organizationId = 0;
    });

    async function setUp() {
        const { organization, user } = await createOrgWithUser(["lead:create", "lead:read", "lead:update", "lead:all"]);
        organizationId = organization.id;
        const org = { organizationId };
        const colleague = await prisma.user.create({
            data: { ...org, roleId: user.roleId, name: "Colleague", email: `colleague-${organizationId}@example.com`, passwordHash: "x" },
        });
        const [fresh, contacted, won] = await Promise.all([
            createLeadStage(organizationId, { name: "New", order: 0 }),
            createLeadStage(organizationId, { name: "Contacted", order: 1 }),
            createLeadStage(organizationId, { name: "Won", order: 2 }),
        ]);
        (getCurrentUser as Mock).mockResolvedValue(user);
        return { org, user, colleague, stages: { fresh, contacted, won } };
    }

    it("records the creator, and whoever edits it last", async () => {
        const { user, colleague, stages } = await setUp();

        const created = await (await createLead(send("POST", { name: "Acme", phone: "9876543210", stageId: stages.fresh.id }))).json();
        let lead = await prisma.lead.findUniqueOrThrow({ where: { id: created.data.id } });
        expect([lead.createdById, lead.updatedById]).toEqual([user.id, user.id]);

        // the colleague edits it one-on-one, then in bulk
        (getCurrentUser as Mock).mockResolvedValue({ ...user, id: colleague.id });
        await updateLead(send("PUT", { companyName: "Acme Ltd" }), { params: Promise.resolve({ id: String(lead.id) }) });
        lead = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
        expect([lead.createdById, lead.updatedById]).toEqual([user.id, colleague.id]);

        (getCurrentUser as Mock).mockResolvedValue(user);
        await bulkLeads(send("PATCH", { action: "stage", leadIds: [lead.id], stageId: stages.contacted.id }));
        lead = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
        expect(lead.updatedById).toBe(user.id);
    });

    it("filters by several stages, by who created or changed it, and by when it changed", async () => {
        const { org, user, colleague, stages } = await setUp();
        const make = (name: string, stageId: number, createdById: number, updatedById: number, updatedAt: string) =>
            prisma.lead.create({ data: { ...org, name, stageId, createdById, updatedById, updatedAt: new Date(updatedAt) } });
        await make("Mine, new", stages.fresh.id, user.id, user.id, "2030-01-10T10:00:00Z");
        await make("Mine, contacted", stages.contacted.id, user.id, colleague.id, "2030-02-10T10:00:00Z");
        await make("Theirs, won", stages.won.id, colleague.id, colleague.id, "2030-03-10T10:00:00Z");

        expect(await names(await list(`stageIds=${stages.fresh.id},${stages.contacted.id}`))).toEqual(["Mine, contacted", "Mine, new"]);
        expect(await names(await list("createdBy=me"))).toEqual(["Mine, contacted", "Mine, new"]);
        expect(await names(await list(`updatedBy=${colleague.id}`))).toEqual(["Mine, contacted", "Theirs, won"]);
        expect(await names(await list("updatedFrom=2030-02-01&updatedTo=2030-02-28"))).toEqual(["Mine, contacted"]);

        const row = (await (await list("createdBy=me&sortBy=name&sortOrder=asc")).json()).data[0];
        expect(row.createdBy).toEqual({ id: user.id, name: user.name });
        expect(row.updatedBy).toEqual({ id: colleague.id, name: "Colleague" });
    });

    it("rejects a malformed stage list", async () => {
        await setUp();

        expect((await list("stageIds=1,,x")).status).toBe(400);
    });
});
