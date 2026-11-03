import { afterEach, describe, expect, it, vi, type Mock } from "vitest";
import { NextRequest } from "next/server";

import { prisma } from "@/lib/db/prisma";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { createOrgWithUser, cleanupOrg } from "../helpers";

vi.mock("@/lib/auth/getCurrentUser", () => ({ getCurrentUser: vi.fn() }));
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { PATCH as updateProfile } from "@/app/api/me/route";
import { PATCH as changePassword } from "@/app/api/me/password/route";

function patchRequest(body: object) {
    return new NextRequest("http://localhost/api/me", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
    });
}

describe("the profile endpoints", () => {
    let organizationId: number;

    afterEach(async () => {
        if (organizationId) await cleanupOrg(organizationId);
        organizationId = 0;
    });

    // a user with no permissions at all: editing yourself needs none
    async function setUp() {
        const { organization, user } = await createOrgWithUser([]);
        organizationId = organization.id;
        const withPassword = { ...user, passwordHash: await hashPassword("old-password") };
        await prisma.user.update({ where: { id: user.id }, data: { passwordHash: withPassword.passwordHash } });
        (getCurrentUser as Mock).mockResolvedValue(withPassword);
        return withPassword;
    }

    it("renames you", async () => {
        const user = await setUp();

        const res = await updateProfile(patchRequest({ name: "  Kavya  " }));

        expect(res.status).toBe(200);
        expect((await res.json()).data).toEqual({ id: user.id, name: "Kavya", email: user.email });
    });

    it("rejects an empty name", async () => {
        await setUp();

        const res = await updateProfile(patchRequest({ name: "   " }));

        expect(res.status).toBe(400);
    });

    it("changes the password when the current one is right", async () => {
        const user = await setUp();

        const res = await changePassword(patchRequest({ currentPassword: "old-password", newPassword: "new-password" }));

        expect(res.status).toBe(200);
        const saved = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
        expect(await verifyPassword("new-password", saved.passwordHash)).toBe(true);
    });

    it("keeps the old password when the current one is wrong", async () => {
        const user = await setUp();

        const res = await changePassword(patchRequest({ currentPassword: "wrong-guess", newPassword: "new-password" }));

        expect(res.status).toBe(400);
        const saved = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
        expect(await verifyPassword("old-password", saved.passwordHash)).toBe(true);
    });

    it("needs you to be signed in", async () => {
        (getCurrentUser as Mock).mockResolvedValue(null);

        expect((await updateProfile(patchRequest({ name: "Someone" }))).status).toBe(401);
        expect((await changePassword(patchRequest({ currentPassword: "x", newPassword: "long-enough" }))).status).toBe(401);
    });
});
