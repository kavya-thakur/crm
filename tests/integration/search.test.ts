import { afterEach, describe, expect, it, vi, type Mock } from "vitest";
import { NextRequest } from "next/server";

import { prisma } from "@/lib/db/prisma";
import { createOrgWithUser, createLeadStage, cleanupOrg } from "../helpers";

vi.mock("@/lib/auth/getCurrentUser", () => ({ getCurrentUser: vi.fn() }));
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { GET as search } from "@/app/api/search/route";

async function find(q: string) {
    const res = await search(new NextRequest(`http://localhost/api/search?q=${encodeURIComponent(q)}`));
    return { status: res.status, data: (await res.json()).data };
}

describe("GET /api/search", () => {
    let organizationId = 0;

    afterEach(async () => {
        if (organizationId) await cleanupOrg(organizationId);
        organizationId = 0;
    });

    // An agent who sees only their own leads, and a colleague with leads of their own
    async function setUp() {
        const { organization, user } = await createOrgWithUser(["lead:read", "deal:read"]);
        organizationId = organization.id;
        const org = { organizationId };
        const colleague = await prisma.user.create({
            data: { ...org, roleId: user.roleId, name: "Colleague", email: `colleague-${organizationId}@example.com`, passwordHash: "x" },
        });
        const stage = await createLeadStage(organizationId);
        const lead = (name: string, assignedToId: number, extra = {}) => prisma.lead.create({ data: { ...org, name, stageId: stage.id, assignedToId, ...extra } });
        await Promise.all([
            lead("The Acme Co", user.id),
            lead("Acme", user.id),
            lead("Northwind", user.id, { companyName: "Acme Holdings" }),
            lead("Acme (theirs)", colleague.id),
            lead("100% Organic", user.id),
        ]);
        await prisma.task.create({ data: { ...org, title: "Call Acme back", dueDate: new Date("2030-01-01"), assignedToId: user.id, createdById: user.id } });
        (getCurrentUser as Mock).mockResolvedValue(user);
    }

    it("finds matches by name or company, best matches first, and only what you can see", async () => {
        await setUp();

        const { status, data } = await find("acme");

        expect(status).toBe(200);
        expect(data.leads.map((lead: { name: string }) => lead.name)).toEqual(["Acme", "The Acme Co", "Northwind"]);
        expect(data.tasks.map((task: { title: string }) => task.title)).toEqual(["Call Acme back"]);
        expect(data.contacts).toEqual([]);
    });

    it("narrows to one kind when the filter is set", async () => {
        await setUp();

        const res = await search(new NextRequest("http://localhost/api/search?q=acme&type=task"));
        const { data } = await res.json();

        expect(data.tasks.map((task: { title: string }) => task.title)).toEqual(["Call Acme back"]);
        expect(data.leads).toEqual([]);
    });

    it("treats % literally instead of matching everything", async () => {
        await setUp();

        expect((await find("%")).data.leads.map((lead: { name: string }) => lead.name)).toEqual(["100% Organic"]);
    });

    it("needs something to search for", async () => {
        await setUp();

        expect((await find("   ")).status).toBe(400);
    });
});
