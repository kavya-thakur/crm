import { afterEach, describe, expect, it, vi, type Mock } from "vitest";
import type { IncomingMessage } from "node:http";
import { NextRequest } from "next/server";

import { prisma } from "@/lib/db/prisma";
import { createToken } from "@/lib/auth/jwt";
import { accessOf, paidUntilAfter } from "@/lib/billing/plans";
import { activatePro, apiLocked, lockedFor } from "@/lib/billing/gate";
import { createOrgWithUser, cleanupOrg } from "../helpers";

vi.mock("@/lib/auth/getCurrentUser", () => ({ getCurrentUser: vi.fn() }));
// Flash's own emails (the receipt) are recorded, not sent
vi.mock("@/lib/emails/system", async (original) => ({ ...(await original<object>()), sendSystemEmail: vi.fn(async () => true) }));

import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { sendSystemEmail } from "@/lib/emails/system";
import { POST as requestPlan } from "@/app/api/billing/route";
import { GET as workspaceDetail, PUT as changePlan } from "@/app/api/site-admin/workspaces/[id]/route";
import { GET as overview } from "@/app/api/site-admin/overview/route";
import { GET as payments } from "@/app/api/site-admin/payments/route";
import { GET as workspaceList } from "@/app/api/site-admin/workspaces/route";
import { GET as userList } from "@/app/api/site-admin/users/route";

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

    it("never turns a workspace on Pro back into a trial", async () => {
        const { organization } = await workspace();
        const admin = await workspace();
        vi.stubEnv("SITE_ADMIN_EMAILS", admin.owner.email);
        const paidUntil = await activatePro(organization.id, "YEARLY");

        (getCurrentUser as Mock).mockResolvedValue({ ...admin.owner, actingAsId: null });
        expect((await changePlan(send({ action: "extendTrial" }), params(organization.id))).status).toBe(409);
        const still = await prisma.organization.findUniqueOrThrow({ where: { id: organization.id } });
        expect(still).toMatchObject({ plan: "PRO", paidUntil });
        expect(accessOf(still).state).toBe("pro");
    });

    it("records Pro switched on by hand as a payment, shown in the company, the payments list and the overview", async () => {
        const { organization } = await workspace();
        const admin = await workspace();
        vi.stubEnv("SITE_ADMIN_EMAILS", admin.owner.email);
        (getCurrentUser as Mock).mockResolvedValue({ ...admin.owner, actingAsId: null });
        const before = (await (await overview()).json()).data;
        (sendSystemEmail as Mock).mockClear();

        // the plan's price unless said otherwise; 0 is still recorded
        expect((await changePlan(send({ action: "activate", cycle: "MONTHLY", note: "UPI 4521" }), params(organization.id))).status).toBe(200);
        expect((await changePlan(send({ action: "activate", cycle: "YEARLY", amount: 0 }), params(organization.id))).status).toBe(200);

        const recorded = await prisma.payment.findMany({ where: { organizationId: organization.id }, orderBy: { id: "asc" } });
        expect(recorded).toMatchObject([
            { method: "MANUAL", cycle: "MONTHLY", amount: 149_900, note: "UPI 4521", recordedBy: admin.owner.email, razorpayPaymentId: null },
            { method: "MANUAL", cycle: "YEARLY", amount: 0, note: null },
        ]);
        // the year starts after the month
        expect(Math.round((recorded[1].paidUntil.getTime() - recorded[0].paidUntil.getTime()) / DAY)).toBe(365);
        // the owner gets a receipt for what was paid, not for the free year
        expect(sendSystemEmail).toHaveBeenCalledTimes(1);
        const owner = await prisma.user.findFirstOrThrow({ where: { organizationId: organization.id, isOwner: true } });
        expect((sendSystemEmail as Mock).mock.calls[0][0]).toMatchObject({ to: owner.email });
        expect((sendSystemEmail as Mock).mock.calls[0][0].text).toContain(`/receipts/${recorded[0].id}`);

        const detail = (await (await workspaceDetail(send({}), params(organization.id))).json()).data;
        expect(detail).toMatchObject({ access: { state: "pro" }, paidTotal: 1499, counts: { users: 1 } });
        expect(detail.payments).toHaveLength(2);

        const list = await (await payments(new NextRequest(`http://localhost/api/site-admin/payments?method=MANUAL&search=${encodeURIComponent(organization.name)}`))).json();
        expect(list).toMatchObject({ total: 2, sum: 1499 });
        expect(list.data[0].organization.id).toBe(organization.id);
        const online = await (await payments(new NextRequest(`http://localhost/api/site-admin/payments?method=RAZORPAY&search=${encodeURIComponent(organization.name)}`))).json();
        expect(online.total).toBe(0);

        const after = (await (await overview()).json()).data;
        expect(after.revenue.allTime - before.revenue.allTime).toBe(1499);
        expect(after.revenue.allTimePayments - before.revenue.allTimePayments).toBe(2);
        expect(after.payingCustomers - before.payingCustomers).toBe(1);
        expect(after.workspaces.pro - before.workspaces.pro).toBe(1);
    });

    it("keeps the business numbers to site admins", async () => {
        const { owner } = await workspace();
        (getCurrentUser as Mock).mockResolvedValue({ ...owner, actingAsId: null });
        expect((await overview()).status).toBe(403);
        expect((await payments(new NextRequest("http://localhost/api/site-admin/payments"))).status).toBe(403);
    });

    it("filters companies by plan and finds them by owner email, users by owners or site admins, payments by month", async () => {
        const { organization, owner } = await workspace();
        const admin = await workspace();
        vi.stubEnv("SITE_ADMIN_EMAILS", admin.owner.email);
        (getCurrentUser as Mock).mockResolvedValue({ ...admin.owner, actingAsId: null });
        const get = async (handler: (req: NextRequest) => Promise<Response>, query: string) => (await handler(new NextRequest(`http://localhost/api?${query}`))).json();
        const ids = (list: { data: { id: number }[] }) => list.data.map((row) => row.id);
        const search = encodeURIComponent(owner.email);

        // on trial: found by its owner's email under Trial, not Pro or Ended
        expect(ids(await get(workspaceList, `search=${search}&plan=trial`))).toEqual([organization.id]);
        expect(ids(await get(workspaceList, `search=${search}&plan=pro`))).toEqual([]);
        await endTrial(organization.id);
        expect(ids(await get(workspaceList, `search=${search}&plan=ended`))).toEqual([organization.id]);
        await changePlan(send({ action: "activate", cycle: "MONTHLY" }), params(organization.id));
        expect(ids(await get(workspaceList, `search=${search}&plan=pro`))).toEqual([organization.id]);
        expect((await workspaceList(new NextRequest("http://localhost/api?plan=gold"))).status).toBe(400);

        // the root admin (by email) shows under Site admins; an owner under Owners
        const people = encodeURIComponent(String(organization.id));
        expect(ids(await get(userList, `organizationId=${people}&type=owners`))).toEqual([owner.id]);
        expect(ids(await get(userList, `organizationId=${people}&type=agents`))).toEqual([]);
        expect(ids(await get(userList, `organizationId=${people}&type=admins`))).toEqual([]);
        expect(ids(await get(userList, `search=${encodeURIComponent(admin.owner.email)}&type=admins`))).toEqual([admin.owner.id]);

        // this month's payment, not last month's
        const name = encodeURIComponent(organization.name);
        expect((await get(payments, `search=${name}&period=thisMonth`)).total).toBe(1);
        expect((await get(payments, `search=${name}&period=lastMonth`)).total).toBe(0);
    });
});
