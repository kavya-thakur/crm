import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/generated/prisma/client";
import { broadcastChange } from "@/lib/realtime/notify";
import { activatePro } from "./gate";
import { BILLING_CYCLES, type BillingCycle } from "./plans";
import { capturePayment, fetchOrder, fetchPayment } from "./razorpay";

/*
 * Turning a Razorpay payment into Pro. Called two ways, for the same payment: by the Billing page
 * after Razorpay's window succeeds (/api/billing/verify), and by Razorpay itself (the webhook,
 * /api/public/razorpay), which still arrives if the payer's browser closed first. Whichever comes
 * first switches Pro on; the other finds the payment already counted.
 */

export class PaymentProblem extends Error {}

/**
 * Checks the payment with Razorpay itself, never trusting what the browser says: it's for this
 * order, of the order's amount, in rupees, and the money is taken (an authorised one is captured
 * now; left uncaptured, Razorpay would give it back while the workspace kept Pro). Then records it
 * and switches Pro on, once. `forWorkspace`: the verify route's own workspace, which the order
 * must be for.
 */
export async function settlePayment(orderId: string, paymentId: string, forWorkspace?: number) {
    const [order, found] = await Promise.all([fetchOrder(orderId), fetchPayment(paymentId)]);

    const organizationId = Number(order.notes?.organizationId);
    const cycle = order.notes?.cycle as BillingCycle;
    if (!organizationId || !BILLING_CYCLES.includes(cycle)) throw new PaymentProblem("This order isn't for a Flash plan");
    if (forWorkspace !== undefined && organizationId !== forWorkspace) throw new PaymentProblem("This payment is for another workspace");
    if (found.order_id !== order.id || found.amount !== order.amount || found.currency !== "INR") throw new PaymentProblem("The payment doesn't match its order");

    // captured at the same moment by the other way in (the browser and the webhook together): look again
    const payment = found.status === "authorized" ? await capturePayment(found).catch(() => fetchPayment(found.id)) : found;
    if (payment.status !== "captured") throw new PaymentProblem(`The payment wasn't completed (${payment.status})`);

    try {
        const paidUntil = await prisma.$transaction(async (tx) => {
            // first: the payment id is unique, so a second arrival stops here, before adding more time
            const record = await tx.payment.create({
                data: { organizationId, paidBy: payment.email ?? "", razorpayOrderId: order.id, razorpayPaymentId: payment.id, cycle, amount: payment.amount, paidUntil: new Date() },
            });
            const until = await activatePro(organizationId, cycle, tx);
            await tx.payment.update({ where: { id: record.id }, data: { paidUntil: until } });
            return until;
        });
        // every open page in the workspace re-renders, so a locked app opens up straight away
        broadcastChange(organizationId, "billing");
        return { organizationId, paidUntil, alreadyCounted: false };
    } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return { organizationId, paidUntil: null, alreadyCounted: true };
        throw error;
    }
}
