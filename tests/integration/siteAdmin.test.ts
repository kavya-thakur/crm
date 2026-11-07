import { afterEach, describe, expect, it, vi, type Mock } from "vitest";
import { NextRequest } from "next/server";

import { prisma } from "@/lib/db/prisma";
import { createToken, verifyToken } from "@/lib/auth/jwt";
import { createOrgWithUser, cleanupOrg } from "../helpers";

vi.mock("@/lib/auth/getCurrentUser", () => ({ getCurrentUser: vi.fn() }));
const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
    cookies: async () => ({
        get: (name: string) => (jar.has(name) ? { value: jar.get(name) } : undefined),
        set: (name: string, value: string) => jar.set(name, value),
        delete: (name: string) => jar.delete(name),
    }),
}));

import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { GET as listUsers } from "@/app/api/site-admin/users/route";
import { POST as logInAs, PUT as setSiteAdmin } from "@/app/api/site-admin/users/[id]/route";
import { GET as listWorkspaces } from "@/app/api/site-admin/workspaces/route";
import { POST as back } from "@/app/api/auth/back/route";

const send = (method: string, body?: object) =>
    new NextRequest("http://localhost", { method, headers: { "content-type": "application/json" }, ...(body && { body: JSON.stringify(body) }) });
const params = (id: number) => ({ params: Promise.resolve({ id: String(id) }) });
const signIn = (user: object, actingAsId: number | null = null) => (getCurrentUser as Mock).mockResolvedValue({ ...user, actingAsId });
const users = async (query = "") => (await (await listUsers(new NextRequest(`http://localhost/api/site-admin/users${query}`))).json()) as { data: { id: number; email: string }[]; total: number };

describe("site admin", () => {
    const organizationIds: number[] = [];
    afterEach(async () => {
        jar.clear();
        vi.unstubAllEnvs();
        for (const id of organizationIds.splice(0)) await cleanupOrg(id);
    });

    async function twoCompanies() {
        const mine = await createOrgWithUser([]);
        const theirs = await createOrgWithUser([]);
        organizationIds.push(mine.organization.id, theirs.organization.id);
        // the root admin is set by email; a customer in another company
        vi.stubEnv("SITE_ADMIN_EMAILS", `someone@else.com, ${mine.user.email.toUpperCase()}`);
        return { root: mine.user, customer: theirs.user, customerOrg: theirs.organization };
    }

    it("is closed to everyone who isn't one", async () => {
        const { customer } = await twoCompanies();
        signIn(customer);
        expect((await listUsers(new NextRequest("http://localhost/api/site-admin/users"))).status).toBe(403);
        expect((await logInAs(send("POST"), params(customer.id))).status).toBe(403);
    });

    it("shows a root admin everyone in every company, and lets them into any account, then back", async () => {
        const { root, customer, customerOrg } = await twoCompanies();
        signIn(root);

        const found = await users(`?search=${encodeURIComponent(customer.email)}`);
        expect(found.data.map((user) => user.id)).toEqual([customer.id]);
        expect((await users(`?organizationId=${customerOrg.id}`)).total).toBe(1);
        const companies = (await (await listWorkspaces(new NextRequest(`http://localhost/api/site-admin/workspaces?search=${encodeURIComponent(customerOrg.name)}`))).json()).data;
        expect(companies[0]).toMatchObject({ id: customerOrg.id, counts: { users: 1 } });

        const ownToken = createToken({ userId: root.id, organizationId: root.organizationId });
        jar.set("access_token", ownToken);
        expect((await logInAs(send("POST"), params(customer.id))).status).toBe(200);
        // into the other company, as them; nobody notified
        expect(verifyToken(jar.get("access_token")!)).toMatchObject({ userId: customer.id, organizationId: customerOrg.id, actingAs: root.id });
        expect(await prisma.notification.count({ where: { userId: customer.id } })).toBe(0);

        signIn(customer, root.id);
        expect(await (await back()).json()).toMatchObject({ signedOut: false, goTo: "/settings/site-admin" });
        expect(jar.get("access_token")).toBe(ownToken);
    });

    it("lets a root make site admins in the database, who can't open other admins' accounts or make more", async () => {
        const { root, customer } = await twoCompanies();
        const helper = await createOrgWithUser([]);
        organizationIds.push(helper.organization.id);
        jar.set("access_token", "x");

        signIn(root);
        expect((await setSiteAdmin(send("PUT", { siteAdmin: true }), params(helper.user.id))).status).toBe(200);
        // a root is set by email, not here
        expect((await setSiteAdmin(send("PUT", { siteAdmin: false }), params(root.id))).status).toBe(400);

        const dbAdmin = await prisma.user.findUniqueOrThrow({ where: { id: helper.user.id } });
        expect(dbAdmin.isSiteAdmin).toBe(true);
        signIn({ ...helper.user, isSiteAdmin: true });
        expect((await users()).total).toBeGreaterThanOrEqual(3);
        expect((await logInAs(send("POST"), params(root.id))).status).toBe(403);
        expect((await setSiteAdmin(send("PUT", { siteAdmin: true }), params(customer.id))).status).toBe(403);
        expect((await logInAs(send("POST"), params(customer.id))).status).toBe(200);

        // while logged in as someone, the admin pages are closed
        signIn(customer, root.id);
        expect((await listUsers(new NextRequest("http://localhost/api/site-admin/users"))).status).toBe(403);
    });
});
