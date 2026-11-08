import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { handleRouteError, parseBody } from "@/lib/api/http";
import { razorpayConfigured, RazorpayProblem, signatureValid } from "@/lib/billing/razorpay";
import { PaymentProblem, settlePayment } from "@/lib/billing/payments";

const verifySchema = z.object({
    razorpay_order_id: z.string().min(1).max(100),
    razorpay_payment_id: z.string().min(1).max(100),
    razorpay_signature: z.string().min(1).max(200),
});

/**
 * Razorpay's payment window succeeded and handed the page these three. The signature (made with
 * the secret, so it can't be invented) must match; then the payment is checked with Razorpay
 * itself and Pro switched on (settlePayment). A payment counts once, however often it's sent.
 */
export async function POST(req: NextRequest) {
    try {
        const user = await getCurrentUser();
        if (!user) throw new Error("UNAUTHORIZED");
        if (!razorpayConfigured()) return NextResponse.json({ ok: false, message: "Online payment isn't set up" }, { status: 503 });

        const body = await parseBody(req, verifySchema);
        if (!body.success) return body.response;
        const { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature } = body.data;

        if (!signatureValid(orderId, paymentId, signature)) {
            return NextResponse.json({ ok: false, message: "We couldn't confirm this payment. If money left your account, contact us and we'll sort it out." }, { status: 400 });
        }

        const { paidUntil } = await settlePayment(orderId, paymentId, user.organizationId);
        return NextResponse.json({ ok: true, message: "Payment received. Pro is on.", data: { paidUntil } });
    } catch (error) {
        if (error instanceof PaymentProblem) return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
        if (error instanceof RazorpayProblem) {
            console.error("Razorpay verify:", error.message);
            return NextResponse.json({ ok: false, message: "We couldn't reach Razorpay to confirm the payment. Please try again in a minute." }, { status: 502 });
        }
        return handleRouteError(error, "Verify payment");
    }
}
