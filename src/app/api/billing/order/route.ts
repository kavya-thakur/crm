import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { handleRouteError, parseBody } from "@/lib/api/http";
import { tooManyAttempts } from "@/lib/api/rateLimit";
import { assertNotDemo } from "@/lib/demo/workspace";
import { BILLING_CYCLES, PRO_PLANS, type BillingCycle } from "@/lib/billing/plans";
import { createOrder, razorpayConfigured, RazorpayProblem } from "@/lib/billing/razorpay";

const orderSchema = z.object({ cycle: z.enum(BILLING_CYCLES as [string, ...string[]]) });

/**
 * Step 1 of paying for Pro: a Razorpay order for the plan's price, which the Billing page opens
 * Razorpay's payment window with. The workspace and plan go in the order's notes, where the
 * verify step reads them back from Razorpay. Open while the workspace is locked.
 */
export async function POST(req: NextRequest) {
    try {
        const user = await getCurrentUser();
        if (!user) throw new Error("UNAUTHORIZED");
        assertNotDemo(user);
        if (!user.isOwner || user.actingAsId) {
            return NextResponse.json({ ok: false, message: "Only the workspace owner can pay for a plan" }, { status: 403 });
        }
        if (!razorpayConfigured()) {
            return NextResponse.json({ ok: false, message: "Online payment isn't set up yet. Choose a plan and we'll get in touch." }, { status: 503 });
        }

        const body = await parseBody(req, orderSchema);
        if (!body.success) return body.response;
        const cycle = body.data.cycle as BillingCycle;

        if (await tooManyAttempts(`pay:${user.id}`, 20, 60 * 60 * 1000)) {
            return NextResponse.json({ ok: false, message: "Too many payment attempts. Please wait a little and try again." }, { status: 429 });
        }

        const order = await createOrder(PRO_PLANS[cycle].price * 100, `ws${user.organizationId}-${Date.now()}`, {
            organizationId: String(user.organizationId),
            cycle,
        });

        return NextResponse.json({
            ok: true,
            data: {
                orderId: order.id,
                amount: order.amount,
                currency: order.currency,
                // the public half of the keys, for the payment window; the secret stays here
                keyId: process.env.RAZORPAY_KEY_ID,
                description: `Flash Pro, ${PRO_PLANS[cycle].label.toLowerCase()}`,
                workspace: user.organization.name,
                prefill: { name: user.name, email: user.email },
            },
        });
    } catch (error) {
        if (error instanceof RazorpayProblem) {
            console.error("Razorpay order:", error.message);
            return NextResponse.json({ ok: false, message: "Couldn't start the payment. Please try again in a minute." }, { status: 502 });
        }
        return handleRouteError(error, "Create payment order");
    }
}
