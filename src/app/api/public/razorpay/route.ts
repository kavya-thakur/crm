import { NextRequest, NextResponse } from "next/server";

import { RazorpayProblem, webhookSignatureValid } from "@/lib/billing/razorpay";
import { PaymentProblem, settlePayment } from "@/lib/billing/payments";

/**
 * Razorpay's webhook: Razorpay tells the server about a payment directly, so Pro still switches on
 * when the payer's browser closed (or lost its connection) before the Billing page could. Set it up
 * in Razorpay's dashboard (Account & Settings > Webhooks): this address, the events
 * payment.captured and order.paid, and a secret, which goes in RAZORPAY_WEBHOOK_SECRET.
 *
 * Signed with that secret over the exact body, so nothing else can pretend to be Razorpay. Answers
 * 200 for anything it has dealt with or doesn't need, so Razorpay stops sending it; an error makes
 * Razorpay send it again later.
 */
export async function POST(req: NextRequest) {
    const body = await req.text();
    if (!webhookSignatureValid(body, req.headers.get("x-razorpay-signature") ?? "")) {
        return NextResponse.json({ ok: false, message: "Bad signature" }, { status: 400 });
    }

    const event = JSON.parse(body) as { event: string; payload?: { payment?: { entity?: { id: string; order_id: string | null } } } };
    const payment = event.payload?.payment?.entity;
    if (!["payment.captured", "order.paid"].includes(event.event) || !payment?.order_id) return NextResponse.json({ ok: true, ignored: event.event });

    try {
        const result = await settlePayment(payment.order_id, payment.id);
        return NextResponse.json({ ok: true, alreadyCounted: result.alreadyCounted });
    } catch (error) {
        // not one of ours (another app on the same Razorpay account), or not complete: nothing to retry
        if (error instanceof PaymentProblem) return NextResponse.json({ ok: true, ignored: error.message });
        // Razorpay unreachable for a moment: a 500 makes it send the webhook again
        if (error instanceof RazorpayProblem) console.error("Razorpay webhook:", error.message);
        else console.error("Razorpay webhook:", error);
        return NextResponse.json({ ok: false }, { status: 500 });
    }
}
