import { afterEach, describe, expect, it, vi, type Mock } from "vitest";
import { NextRequest } from "next/server";

import { prisma } from "@/lib/db/prisma";
import { createToken, verifyToken } from "@/lib/auth/jwt";
import { createOrgWithUser, cleanupOrg } from "../helpers";

vi.mock("@/lib/auth/getCurrentUser", () => ({ getCurrentUser: vi.fn() }));
// the browser's cookies, for the routes that read and set them
const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
    cookies: async () => ({
        get: (name: string) => (jar.has(name) ? { value: jar.get(name) } : undefined),
        set: (name: string, value: string) => jar.set(name, value),
        delete: (name: string) => jar.delete(name),
    }),
}));

import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { POST as logInAs, PUT as allow } from "@/app/api/agents/[id]/log-in-as/route";
import { POST as back } from "@/app/api/auth/back/route";

const send = (method: string, body?: object) =>
    new NextRequest("http://localhost", { method, headers: { "content-type": "application/json" }, ...(body && { body: JSON.stringify(body) }) });
const params = (id: number) => ({ params: Promise.resolve({ id: String(id) }) });
const signIn = (user: object, actingAsId: number | null = null) => (getCurrentUser as Mock).mockResolvedValue({ ...user, actingAsId });

describe("log in as a teammate", () => {
    let organizationId = 0;
    afterEach(async () => {
        jar.clear();
        if (organizationId) await cleanupOrg(organizationId);
        organizationId = 0;
    });

    async function team() {
        const { organization, user } = await createOrgWithUser(["user:read", "lead:read"]);
        organizationId = organization.id;
        const owner = await prisma.user.update({ where: { id: user.id }, data: { isOwner: true }, include: { organization: true, role: { include: { permissions: { include: { permission: true } } } } } });
        const org = { organizationId };
        // a rep with less, and a manager with more than the rep
        const weak = await prisma.role.create({ data: { ...org, name: "Rep" } });
        const person = (name: string, roleId: number) =>
            prisma.user.create({
                data: { ...org, roleId, name, email: `${name.toLowerCase()}-${organizationId}@example.com`, passwordHash: "x" },
                include: { organization: true, role: { include: { permissions: { include: { permission: true } } } } },
            });
        const [rep, manager] = [await person("Rep", weak.id), await person("Manager", owner.roleId)];
        return { owner, rep, manager };
    }

    it("lets the owner open a teammate's account, tells them, and goes back to the owner's own", async () => {
        const { owner, rep } = await team();
        const ownToken = createToken({ userId: owner.id, organizationId });
        jar.set("access_token", ownToken);
        signIn(owner);

        expect((await logInAs(send("POST"), params(rep.id))).status).toBe(200);
        const session = verifyToken(jar.get("access_token")!) as { userId: number; actingAs: number; exp: number; iat: number };
        expect(session).toMatchObject({ userId: rep.id, actingAs: owner.id });
        expect(session.exp - session.iat).toBe(60 * 60);
        expect(jar.get("own_access_token")).toBe(ownToken);
        expect(await prisma.notification.findFirst({ where: { userId: rep.id, type: "LOGGED_IN_AS" } })).not.toBeNull();

        // while in their account: no hopping on to someone else
        signIn(rep, owner.id);
        expect((await logInAs(send("POST"), params(owner.id))).status).toBe(403);

        expect(await (await back()).json()).toMatchObject({ signedOut: false });
        expect(jar.get("access_token")).toBe(ownToken);
        expect(jar.has("own_access_token")).toBe(false);
    });

    it("only lets people the owner allowed, only into accounts that can't do more than theirs, never the owner's", async () => {
        const { owner, rep, manager } = await team();
        jar.set("access_token", "manager's own");

        signIn(manager);
        expect((await logInAs(send("POST"), params(rep.id))).status).toBe(403);
        // and only the owner can allow it
        expect((await allow(send("PUT", { allowed: true }), params(rep.id))).status).toBe(403);

        signIn(owner);
        expect((await allow(send("PUT", { allowed: true }), params(manager.id))).status).toBe(200);

        signIn({ ...manager, canLogInAs: true });
        expect((await logInAs(send("POST"), params(owner.id))).status).toBe(403);
        expect((await logInAs(send("POST"), params(rep.id))).status).toBe(200);

        // the rep, allowed too, still can't open the manager's stronger account
        signIn({ ...rep, canLogInAs: true });
        const refused = await logInAs(send("POST"), params(manager.id));
        expect(refused.status).toBe(403);
        expect((await refused.json()).message).toContain("can do things you can't");
    });
});
