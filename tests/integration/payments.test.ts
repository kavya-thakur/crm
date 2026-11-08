import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { createHmac } from "node:crypto";
import { NextRequest } from "next/server";

import { prisma } from "@/lib/db/prisma";
import { createOrgWithUser, cleanupOrg } from "../helpers";

vi.mock("@/lib/auth/getCurrentUser", () => ({ getCurrentUser: vi.fn() }));

import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { POST as createOrder } from "@/app/api/billing/order/route";
import { POST as verify } from "@/app/api/billing/verify/route";
import { POST as webhook } from "@/app/api/public/razorpay/route";

const DAY = 24 * 60 * 60 * 1000;
const SECRET = "test-secret";
const WEBHOOK_SECRET = "webhook-secret";
const post = (body: object) => new NextRequest("http://localhost", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
// what Razorpay's window hands the page after a payment
const fromWindow = (orderId: string, paymentId: string) => ({
    razorpay_order_id: orderId,
    razorpay_payment_id: paymentId,
    razorpay_signature: createHmac("sha256", SECRET).update(`${orderId}|${paymentId}`).digest("hex"),
});
// what Razorpay's webhook sends, signed over its exact body
const fromRazorpay = (event: string, payment: { id: string; order_id: string }, secret = WEBHOOK_SECRET) => {
    const body = JSON.stringify({ event, payload: { payment: { entity: payment } } });
    return new NextRequest("http://localhost", { method: "POST", headers: { "x-razorpay-signature": createHmac("sha256", secret).update(body).digest("hex") }, body });
};

describe("paying for Pro with Razorpay", () => {
    let organizationId = 0;
    // Razorpay's API, standing in: its orders and payments
    const orders = new Map<string, { id: string; amount: number; currency: string; status: string; notes: Record<string, string> }>();
    const payments = new Map<string, { id: string; order_id: string; amount: number; currency: string; status: string; email: string }>();

    beforeEach(() => {
        vi.stubEnv("RAZORPAY_KEY_ID", "rzp_test_key");
        vi.stubEnv("RAZORPAY_KEY_SECRET", SECRET);
        vi.stubEnv("RAZORPAY_WEBHOOK_SECRET", WEBHOOK_SECRET);
        vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
            const path = decodeURIComponent(String(url).replace("https://api.razorpay.com/v1", ""));
            if (path === "/orders" && init?.method === "POST") {
                const body = JSON.parse(String(init.body));
                const order = { id: `order_${orders.size + 1}`, amount: body.amount, currency: body.currency, status: "created", notes: body.notes };
                orders.set(order.id, order);
                return Response.json(order);
            }
            const capture = path.match(/^\/payments\/(.+)\/capture$/);
            if (capture) {
                const payment = payments.get(capture[1])!;
                payment.status = "captured";
                return Response.json(payment);
            }
            const found = path.startsWith("/orders/") ? orders.get(path.slice(8)) : payments.get(path.slice(10));
            return found ? Response.json(found) : Response.json({ error: { description: "not found" } }, { status: 404 });
        });
    });
    afterEach(async () => {
        vi.unstubAllEnvs();
        vi.restoreAllMocks();
        orders.clear();
        payments.clear();
        if (organizationId) await cleanupOrg(organizationId);
        organizationId = 0;
    });

    async function owner() {
        const { organization, user } = await createOrgWithUser([]);
        organizationId = organization.id;
        const me = await prisma.user.update({ where: { id: user.id }, data: { isOwner: true }, include: { organization: true, role: { include: { permissions: { include: { permission: true } } } } } });
        (getCurrentUser as Mock).mockResolvedValue({ ...me, actingAsId: null });
        // the trial has ended: paying is what opens it up
        await prisma.organization.update({ where: { id: organization.id }, data: { trialEndsAt: new Date(Date.now() - 1000) } });
        return me;
    }
    // an order for the yearly plan, and a payment of it in the state given
    async function paidYearly(id: string, status = "authorized", amount?: number) {
        const { data } = await (await createOrder(post({ cycle: "YEARLY" }))).json();
        payments.set(id, { id, order_id: data.orderId, amount: amount ?? data.amount, currency: "INR", status, email: "owner@example.com" });
        return data.orderId as string;
    }
    const workspace = () => prisma.organization.findUniqueOrThrow({ where: { id: organizationId } });

    it("makes an order for the plan's price in paise, and only for the owner", async () => {
        const me = await owner();
        const { data } = await (await createOrder(post({ cycle: "YEARLY" }))).json();
        expect(data).toMatchObject({ amount: 1499000, currency: "INR", keyId: "rzp_test_key" });
        // the secret never goes to the page
        expect(JSON.stringify(data)).not.toContain(SECRET);
        expect(orders.get(data.orderId)!.notes).toEqual({ organizationId: String(me.organizationId), cycle: "YEARLY" });

        (getCurrentUser as Mock).mockResolvedValue({ ...me, isOwner: false, actingAsId: null });
        expect((await createOrder(post({ cycle: "YEARLY" }))).status).toBe(403);
    });

    it("takes the money and switches Pro on for a genuine payment, once, and refuses a made-up one", async () => {
        await owner();
        const orderId = await paidYearly("pay_1");

        const forged = { ...fromWindow(orderId, "pay_1"), razorpay_signature: "0".repeat(64) };
        expect((await verify(post(forged))).status).toBe(400);
        expect((await workspace()).plan).toBe("TRIAL");

        expect((await verify(post(fromWindow(orderId, "pay_1")))).status).toBe(200);
        // an authorised payment is captured, so the money is really taken
        expect(payments.get("pay_1")!.status).toBe("captured");
        const first = await workspace();
        expect(first).toMatchObject({ plan: "PRO", billingCycle: "YEARLY" });
        expect(Math.round((first.paidUntil!.getTime() - Date.now()) / DAY)).toBe(365);

        // sent again (a retry), and by the webhook too: still one payment, no extra year
        expect((await verify(post(fromWindow(orderId, "pay_1")))).status).toBe(200);
        expect(await (await webhook(fromRazorpay("payment.captured", { id: "pay_1", order_id: orderId }))).json()).toMatchObject({ alreadyCounted: true });
        expect((await workspace()).paidUntil).toEqual(first.paidUntil);
        expect(await prisma.payment.count({ where: { organizationId } })).toBe(1);
    });

    it("won't switch Pro on for a failed payment, a smaller amount, or another workspace's order", async () => {
        await owner();
        expect((await verify(post(fromWindow(await paidYearly("pay_failed", "failed"), "pay_failed")))).status).toBe(400);
        expect((await verify(post(fromWindow(await paidYearly("pay_cheap", "captured", 100), "pay_cheap")))).status).toBe(400);

        orders.set("order_other", { id: "order_other", amount: 149900, currency: "INR", status: "paid", notes: { organizationId: "999999", cycle: "MONTHLY" } });
        payments.set("pay_other", { id: "pay_other", order_id: "order_other", amount: 149900, currency: "INR", status: "captured", email: "x@example.com" });
        expect((await verify(post(fromWindow("order_other", "pay_other")))).status).toBe(400);

        expect((await workspace()).plan).toBe("TRIAL");
    });

    it("switches Pro on from Razorpay's webhook when the browser never came back, and ignores a forged one", async () => {
        await owner();
        const orderId = await paidYearly("pay_2", "captured");

        expect((await webhook(fromRazorpay("payment.captured", { id: "pay_2", order_id: orderId }, "wrong-secret"))).status).toBe(400);
        expect((await workspace()).plan).toBe("TRIAL");

        expect((await webhook(fromRazorpay("payment.captured", { id: "pay_2", order_id: orderId }))).status).toBe(200);
        expect(await workspace()).toMatchObject({ plan: "PRO", billingCycle: "YEARLY" });
    });
});
