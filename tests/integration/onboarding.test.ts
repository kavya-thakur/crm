import { afterEach, describe, expect, it, vi, type Mock } from "vitest";
import { NextRequest } from "next/server";

import { prisma } from "@/lib/db/prisma";
import { createOrgWithUser, cleanupOrg } from "../helpers";

vi.mock("@/lib/auth/getCurrentUser", () => ({ getCurrentUser: vi.fn() }));
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { POST as finishOnboarding } from "@/app/api/onboarding/route";

function postRequest(body: object) {
    return new NextRequest("http://localhost/api/onboarding", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
    });
}

describe("finishing onboarding", () => {
    let organizationId: number;

    afterEach(async () => {
        if (organizationId) await cleanupOrg(organizationId);
        organizationId = 0;
    });

    // someone who just signed up: no names yet, setup still to do
    async function setUp(needsOnboarding = true) {
        const { organization, user } = await createOrgWithUser([]);
        organizationId = organization.id;
        await prisma.user.update({ where: { id: user.id }, data: { needsOnboarding } });
        (getCurrentUser as Mock).mockResolvedValue({ ...user, needsOnboarding, actingAsId: null });
        return user;
    }

    it("names the workspace and you, sets the currency, and marks setup done", async () => {
        const user = await setUp();

        const res = await finishOnboarding(postRequest({ workspaceName: "  Acme Inc.  ", name: "Kavya", currency: "USD" }));

        expect(res.status).toBe(200);
        const org = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId } });
        expect(org).toMatchObject({ name: "Acme Inc.", currency: "USD" });
        const saved = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
        expect(saved).toMatchObject({ name: "Kavya", needsOnboarding: false });
    });

    it("can't be used again to rename the workspace once setup is done", async () => {
        await setUp(false);

        const res = await finishOnboarding(postRequest({ workspaceName: "Renamed", name: "Kavya", currency: "USD" }));

        expect(res.status).toBe(403);
    });

    it("rejects a currency that isn't on the list", async () => {
        await setUp();

        const res = await finishOnboarding(postRequest({ workspaceName: "Acme", name: "Kavya", currency: "XYZ" }));

        expect(res.status).toBe(400);
    });
});
