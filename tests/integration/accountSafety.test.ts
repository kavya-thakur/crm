import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { prisma } from "@/lib/db/prisma";
import { createToken } from "@/lib/auth/jwt";
import { hashPassword } from "@/lib/auth/password";
import { createOrgWithUser, cleanupOrg } from "../helpers";

// the browser's cookies: who's signed in is read for real (getCurrentUser), not mocked
const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
    cookies: async () => ({
        get: (name: string) => (jar.has(name) ? { value: jar.get(name) } : undefined),
        set: (name: string, value: string) => jar.set(name, value),
        delete: (name: string) => jar.delete(name),
    }),
}));

import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { POST as addMember } from "@/app/api/agents/route";
import { PATCH as editMember, DELETE as removeMember } from "@/app/api/agents/[id]/route";
import { PATCH as changePassword } from "@/app/api/me/password/route";

const send = (method: string, body?: object) =>
    new NextRequest("http://localhost", { method, headers: { "content-type": "application/json" }, ...(body && { body: JSON.stringify(body) }) });
const params = (id: number) => ({ params: Promise.resolve({ id: String(id) }) });
const signIn = (user: { id: number; organizationId: number }, actingAs?: number) => jar.set("access_token", createToken({ userId: user.id, organizationId: user.organizationId, ...(actingAs && { actingAs }) }));

/*
 * Actions that are fine on an ordinary teammate but would do damage on the owner, a site admin,
 * or a session that should have ended: each one is refused or ends it.
 */
describe("account safety", () => {
    let organizationId = 0;
    afterEach(async () => {
        jar.clear();
        vi.unstubAllEnvs();
        if (organizationId) await cleanupOrg(organizationId);
        organizationId = 0;
    });

    // an owner, and an admin with exactly the owner's permissions
    async function team() {
        const { organization, user } = await createOrgWithUser(["user:read", "user:create", "user:update", "user:delete"]);
        organizationId = organization.id;
        const owner = await prisma.user.update({ where: { id: user.id }, data: { isOwner: true, passwordHash: await hashPassword("old-password") } });
        const admin = await prisma.user.create({
            data: { organizationId, roleId: owner.roleId, name: "Admin", email: `admin-${organizationId}@example.com`, passwordHash: "x" },
        });
        return { owner, admin };
    }

    it("keeps the owner's account the owner's: an admin can't change its email or role, or delete it", async () => {
        const { owner, admin } = await team();
        signIn(admin);

        expect((await editMember(send("PATCH", { email: `taken-${organizationId}@example.com` }), params(owner.id))).status).toBe(403);
        expect((await editMember(send("PATCH", { name: "Not the owner" }), params(owner.id))).status).toBe(403);
        expect((await removeMember(send("DELETE"), params(owner.id))).status).toBe(403);
        expect(await prisma.user.findUniqueOrThrow({ where: { id: owner.id } })).toMatchObject({ email: owner.email, isOwner: true });

        // the owner logged in as the admin can't delete the owner either
        signIn(admin, owner.id);
        expect((await removeMember(send("DELETE"), params(owner.id))).status).toBe(403);

        // the owner can still edit their own account
        signIn(owner);
        expect((await editMember(send("PATCH", { name: "Owner Renamed" }), params(owner.id))).status).toBe(200);
    });

    it("never gives out a site admin's email, or changes a site admin's email for them", async () => {
        const { owner, admin } = await team();
        const rootEmail = `root-${organizationId}@example.com`;
        vi.stubEnv("SITE_ADMIN_EMAILS", rootEmail);
        signIn(owner);

        const add = await addMember(send("POST", { name: "Sneaky", email: rootEmail, password: "password123", roleId: owner.roleId }));
        expect(add.status).toBe(403);
        expect((await editMember(send("PATCH", { email: rootEmail }), params(admin.id))).status).toBe(403);

        await prisma.user.update({ where: { id: admin.id }, data: { isSiteAdmin: true } });
        expect((await editMember(send("PATCH", { email: `mine-${organizationId}@example.com` }), params(admin.id))).status).toBe(403);
        expect((await prisma.user.findUniqueOrThrow({ where: { id: admin.id } })).email).toBe(admin.email);
    });

    it("ends a 'log in as' session as soon as the right to it is taken away", async () => {
        const { owner, admin } = await team();
        const rep = await prisma.user.create({ data: { organizationId, roleId: owner.roleId, name: "Rep", email: `rep-${organizationId}@example.com`, passwordHash: "x" } });
        await prisma.user.update({ where: { id: admin.id }, data: { canLogInAs: true } });

        signIn(rep, admin.id);
        expect((await getCurrentUser())?.id).toBe(rep.id);

        await prisma.user.update({ where: { id: admin.id }, data: { canLogInAs: false } });
        expect(await getCurrentUser()).toBeNull();

        // the owner's own right comes with being the owner
        signIn(rep, owner.id);
        expect((await getCurrentUser())?.id).toBe(rep.id);
    });

    it("signs out every other session when the password changes, and keeps this one", async () => {
        const { owner } = await team();
        signIn(owner);
        const elsewhere = jar.get("access_token")!;
        // a token signed a moment ago, so the change comes after it
        await new Promise((resolve) => setTimeout(resolve, 1100));

        const changed = await changePassword(send("PATCH", { currentPassword: "old-password", newPassword: "new-password-1" }));
        expect(changed.status).toBe(200);
        const fresh = changed.headers.get("set-cookie")!.match(/access_token=([^;]+)/)![1];

        jar.set("access_token", elsewhere);
        expect(await getCurrentUser()).toBeNull();
        jar.set("access_token", fresh);
        expect((await getCurrentUser())?.id).toBe(owner.id);
    });
});
