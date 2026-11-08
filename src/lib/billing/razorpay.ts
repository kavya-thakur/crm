import { createHmac, timingSafeEqual } from "node:crypto";

/*
 * Razorpay Standard Checkout, for paying for Pro on the Billing page:
 *  1. the server creates an order for the plan's price (createOrder), noting which workspace and plan
 *  2. the page opens Razorpay's payment window with it
 *  3. Razorpay hands the page a payment id and a signature; the server checks the signature with
 *     the secret (signatureValid) and reads the order back from Razorpay (fetchOrder), so the price
 *     and plan come from Razorpay, never from the browser, and only then switches Pro on.
 * Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET (test keys start rzp_test_). The secret never
 * leaves the server; the key id is public and goes to the page with each order.
 */

const API = "https://api.razorpay.com/v1";

export function razorpayConfigured() {
    return Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
}

export class RazorpayProblem extends Error {}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
    const auth = Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString("base64");
    const res = await fetch(`${API}${path}`, { ...init, headers: { authorization: `Basic ${auth}`, "content-type": "application/json" }, signal: AbortSignal.timeout(15_000) });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
        // 401: the keys are wrong; anything else: Razorpay's own reason
        throw new RazorpayProblem(res.status === 401 ? "Razorpay didn't accept the keys (RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET)" : (data?.error?.description ?? `Razorpay answered ${res.status}`));
    }
    return data as T;
}

export interface RazorpayOrder {
    id: string;
    amount: number;
    currency: string;
    status: string;
    notes: Record<string, string>;
}

// An order for this amount in paise (at least 100), noting what it's for
export function createOrder(amount: number, receipt: string, notes: Record<string, string>) {
    if (!Number.isInteger(amount) || amount < 100) throw new RazorpayProblem("An order has to be at least ₹1");
    return call<RazorpayOrder>("/orders", { method: "POST", body: JSON.stringify({ amount, currency: "INR", receipt: receipt.slice(0, 40), notes }) });
}

export function fetchOrder(orderId: string) {
    return call<RazorpayOrder>(`/orders/${encodeURIComponent(orderId)}`);
}

export interface RazorpayPayment {
    id: string;
    order_id: string | null;
    amount: number;
    currency: string;
    // "authorized" (the bank said yes, money not taken yet), "captured" (taken), "failed", "refunded"
    status: string;
    email?: string;
}

export function fetchPayment(paymentId: string) {
    return call<RazorpayPayment>(`/payments/${encodeURIComponent(paymentId)}`);
}

// Takes the money of an authorised payment; one that's never captured goes back to the payer in a few days
export function capturePayment(payment: RazorpayPayment) {
    return call<RazorpayPayment>(`/payments/${encodeURIComponent(payment.id)}/capture`, {
        method: "POST",
        body: JSON.stringify({ amount: payment.amount, currency: payment.currency }),
    });
}

// A webhook from Razorpay is signed with the webhook secret (set in Razorpay's dashboard), over its exact body
export function webhookSignatureValid(body: string, signature: string) {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!secret) return false;
    const expected = createHmac("sha256", secret).update(body).digest("hex");
    const given = Buffer.from(signature);
    return given.length === expected.length && timingSafeEqual(given, Buffer.from(expected));
}

// Razorpay signs order_id|payment_id with the secret; anything else (a made-up payment) doesn't match
export function signatureValid(orderId: string, paymentId: string, signature: string) {
    const expected = createHmac("sha256", process.env.RAZORPAY_KEY_SECRET ?? "").update(`${orderId}|${paymentId}`).digest("hex");
    const given = Buffer.from(signature);
    return given.length === expected.length && timingSafeEqual(given, Buffer.from(expected));
}
