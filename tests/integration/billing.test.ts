import { afterEach, describe, expect, it, vi, type Mock } from "vitest";
import type { IncomingMessage } from "node:http";
import { NextRequest } from "next/server";

import { prisma } from "@/lib/db/prisma";
import { createToken } from "@/lib/auth/jwt";
import { accessOf, paidUntilAfter } from "@/lib/billing/plans";
import { activatePro, apiLocked, lockedFor } from "@/lib/billing/gate";
import { createOrgWithUser, cleanupOrg } from "../helpers";

vi.mock("@/lib/auth/getCurrentUser", () => ({ getCurrentUser: vi.fn() }));

import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { POST as requestPlan } from "@/app/api/billing/route";
import { PUT as changePlan } from "@/app/api/site-admin/workspaces/[id]/route";

const DAY = 24 * 60 * 60 * 1000;
const send = (body: object) => new NextRequest("http://localhost", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const params = (id: number) => ({ params: Promise.resolve({ id: String(id) }) });
// an API request from this person, the way the custom server sees it
const apiCall = (url: string, user: { id: number; organizationId: number }, actingAs?: number) =>
    ({ url, headers: { cookie: `access_token=${createToken({ userId: user.id, organizationId: user.organizationId, ...(actingAs && { actingAs }) })}` } }) as unknown as IncomingMessage;

describe("plans", () => {
    const now = new Date("2026-11-10T12:00:00Z");
    it("counts the trial's days left, rounded up, and ends it on time", () => {
        expect(accessOf({ plan: "TRIAL", trialEndsAt: new Date(now.getTime() + 2.5 * DAY), paidUntil: null }, now)).toMatchObject({ state: "trial", daysLeft: 3 });
        expect(accessOf({ plan: "TRIAL", trialEndsAt: new Date(now.getTime() - 1000), paidUntil: null }, now)).toMatchObject({ state: "ended", wasPro: false });
        expect(accessOf({ plan: "PRO", trialEndsAt: now, paidUntil: new Date(now.getTime() + 30 * DAY) }, now).state).toBe("pro");
        expect(accessOf({ plan: "PRO", trialEndsAt: now, paidUntil: new Date(now.getTime() - DAY) }, now)).toMatchObject({ state: "ended", wasPro: true });
    });

    it("renews from the end of a period still running, so early payment loses no days", () => {
        const running = new Date(now.getTime() + 10 * DAY);
        expect(paidUntilAfter("MONTHLY", running, now).getTime()).toBe(running.getTime() + 30 * DAY);
        expect(paidUntilAfter("YEARLY", null, now).getTime()).toBe(now.getTime() + 365 * DAY);
    });
});

describe("billing lock", () => {
    const organizationIds: number[] = [];
    afterEach(async () => {
        vi.unstubAllEnvs();
        for (const id of organizationIds.splice(0)) await cleanupOrg(id);
    });

    async function workspace() {
        const { organization, user } = await createOrgWithUser(["lead:read"]);
        organizationIds.push(organization.id);
        const owner = await prisma.user.update({ where: { id: user.id }, data: { isOwner: true }, include: { organization: true, role: { include: { permissions: { include: { permission: true } } } } } });
        return { organization, owner };
    }
    const endTrial = (id: number) => prisma.organization.update({ where: { id }, data: { trialEndsAt: new Date(Date.now() - 1000) } });

    it("starts every new workspace on a 7-day trial, open", async () => {
        const { organization, owner } = await workspace();
        expect(Math.round((organization.trialEndsAt.getTime() - Date.now()) / DAY)).toBe(7);
        expect(await apiLocked(apiCall("/api/leads", owner))).toBe(false);
    });

    it("locks the API and the pages when the trial ends, but keeps Billing, sign-in and web forms open", async () => {
        const { organization, owner } = await workspace();
        await endTrial(organization.id);

        expect(await apiLocked(apiCall("/api/leads?page=1", owner))).toBe(true);
        expect(await apiLocked(apiCall("/api/billing", owner))).toBe(false);
        expect(await apiLocked(apiCall("/api/auth/logout", owner))).toBe(false);
        expect(await apiLocked(apiCall("/api/public/forms/abc", owner))).toBe(false);

        const fresh = await prisma.user.findUniqueOrThrow({ where: { id: owner.id }, include: { organization: true } });
        expect(await lockedFor({ ...fresh, actingAsId: null })).toBe(true);
    });

    it("never locks out a site admin, even logged in as a locked customer", async () => {
        const { organization, owner } = await workspace();
        const admin = await workspace();
        vi.stubEnv("SITE_ADMIN_EMAILS", admin.owner.email);
        await endTrial(organization.id);

        expect(await apiLocked(apiCall("/api/leads", owner, admin.owner.id))).toBe(false);
        expect(await apiLocked(apiCall("/api/leads", owner))).toBe(true);
    });

    it("lets the owner ask for Pro, and a site admin switch it on, which unlocks at once", async () => {
        const { organization, owner } = await workspace();
        const admin = await workspace();
        vi.stubEnv("SITE_ADMIN_EMAILS", admin.owner.email);
        await endTrial(organization.id);

        // only the owner asks
        const teammate = await prisma.user.create({
            data: { organizationId: organization.id, roleId: owner.roleId, name: "Rep", email: `rep-${organization.id}@example.com`, passwordHash: "x" },
            include: { organization: true, role: { include: { permissions: { include: { permission: true } } } } },
        });
        (getCurrentUser as Mock).mockResolvedValue({ ...teammate, actingAsId: null });
        expect((await requestPlan(send({ cycle: "YEARLY" }))).status).toBe(403);

        (getCurrentUser as Mock).mockResolvedValue({ ...owner, actingAsId: null });
        expect((await requestPlan(send({ cycle: "YEARLY" }))).status).toBe(200);
        expect((await prisma.organization.findUniqueOrThrow({ where: { id: organization.id } })).planRequest).toBe("YEARLY");

        // a customer can't switch it on themselves
        expect((await changePlan(send({ action: "activate", cycle: "YEARLY" }), params(organization.id))).status).toBe(403);

        (getCurrentUser as Mock).mockResolvedValue({ ...admin.owner, actingAsId: null });
        expect((await changePlan(send({ action: "activate", cycle: "YEARLY" }), params(organization.id))).status).toBe(200);
        const paid = await prisma.organization.findUniqueOrThrow({ where: { id: organization.id } });
        expect(paid).toMatchObject({ plan: "PRO", billingCycle: "YEARLY", planRequest: null });
        expect(Math.round((paid.paidUntil!.getTime() - Date.now()) / DAY)).toBe(365);
        expect(await apiLocked(apiCall("/api/leads", owner))).toBe(false);
    });

    it("starts a plan bought during the trial when the trial ends, so no trial day is lost", async () => {
        const { organization } = await workspace();
        const trialEndsAt = new Date(Date.now() + 5 * DAY);
        await prisma.organization.update({ where: { id: organization.id }, data: { trialEndsAt } });

        const paidUntil = await activatePro(organization.id, "MONTHLY");
        expect(paidUntil.getTime()).toBe(trialEndsAt.getTime() + 30 * DAY);
    });

    it("lets a site admin give a trial 7 more days", async () => {
        const { organization } = await workspace();
        const admin = await workspace();
        vi.stubEnv("SITE_ADMIN_EMAILS", admin.owner.email);
        await endTrial(organization.id);

        (getCurrentUser as Mock).mockResolvedValue({ ...admin.owner, actingAsId: null });
        expect((await changePlan(send({ action: "extendTrial" }), params(organization.id))).status).toBe(200);
        const extended = await prisma.organization.findUniqueOrThrow({ where: { id: organization.id } });
        expect(accessOf(extended)).toMatchObject({ state: "trial", daysLeft: 7 });
    });
});
