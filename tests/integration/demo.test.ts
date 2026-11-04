import { afterEach, describe, expect, it, vi, type Mock } from "vitest";
import { NextRequest } from "next/server";

import { prisma } from "@/lib/db/prisma";
import { verifyToken } from "@/lib/auth/jwt";
import { buildDemoWorkspace, DEMO_EMAIL, DEMO_SLUG } from "@/lib/demo/workspace";
import { createOrgWithUser, cleanupOrg } from "../helpers";

vi.mock("@/lib/auth/getCurrentUser", () => ({ getCurrentUser: vi.fn() }));
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { GET as exploreDemo } from "@/app/api/auth/demo/route";
import { PATCH as changePassword } from "@/app/api/me/password/route";

const explore = () => exploreDemo(new NextRequest("http://localhost/api/auth/demo"));
const demoOrg = () => prisma.organization.findUnique({ where: { slug: DEMO_SLUG } });

describe("the demo workspace", () => {
    const orgs: number[] = [];

    afterEach(async () => {
        for (const id of orgs.splice(0)) await cleanupOrg(id);
        const demo = await demoOrg();
        if (demo) await cleanupOrg(demo.id);
    });

    it("signs a visitor in with one click, as John Doe the manager", async () => {
        // nothing to explore yet: back to the login page, which says so
        const none = await explore();
        expect(none.headers.get("location")).toBe("http://localhost/login?demo=unavailable");

        const { organization, user } = await createOrgWithUser(["lead:read"]);
        orgs.push(organization.id);
        await prisma.organization.update({ where: { id: organization.id }, data: { slug: DEMO_SLUG } });
        await prisma.user.update({ where: { id: user.id }, data: { email: DEMO_EMAIL } });
        const res = await explore();
        expect(res.status).toBe(303);
        expect(res.headers.get("location")).toBe("http://localhost/dashboard");
        const token = res.headers.get("set-cookie")?.match(/access_token=([^;]+)/)?.[1];
        expect(verifyToken(token!)).toMatchObject({ userId: user.id, organizationId: organization.id });
    });

    it("keeps passwords, members and roles as they are, but only in the demo", async () => {
        const { organization, user } = await createOrgWithUser([]);
        orgs.push(organization.id);
        const send = () =>
            changePassword(new NextRequest("http://localhost/api/me/password", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ currentPassword: "x", newPassword: "longer-password-1" }) }));

        // a real workspace: it gets as far as checking the password
        (getCurrentUser as Mock).mockResolvedValue(user);
        expect((await send()).status).not.toBe(403);

        (getCurrentUser as Mock).mockResolvedValue({ ...user, organization: { ...user.organization, slug: DEMO_SLUG } });
        const res = await send();
        expect(res.status).toBe(403);
        expect((await res.json()).message).toContain("demo workspace");
    });

    it("rebuilds itself, undoing whatever visitors changed", async () => {
        // the permissions the demo's roles are made from
        const { organization } = await createOrgWithUser([]);
        orgs.push(organization.id);

        await buildDemoWorkspace();
        const first = (await demoOrg())!;
        const leads = await prisma.lead.count({ where: { organizationId: first.id } });
        expect(leads).toBeGreaterThan(100);

        // a visitor adds a web form and deletes some leads
        await prisma.leadForm.create({ data: { organizationId: first.id, name: "Visitor's form", key: `visitor-${Date.now()}` } });
        await prisma.lead.deleteMany({ where: { organizationId: first.id, stage: { isLost: true } } });

        await buildDemoWorkspace();
        const second = (await demoOrg())!;
        expect(await prisma.lead.count({ where: { organizationId: second.id } })).toBe(leads);
        expect(await prisma.leadForm.count({ where: { organizationId: second.id } })).toBe(0);
        expect(await prisma.user.findUnique({ where: { email: DEMO_EMAIL } })).not.toBeNull();
    }, 60_000);
});
