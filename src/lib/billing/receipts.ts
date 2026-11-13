import { prisma } from "@/lib/db/prisma";
import { isSiteAdmin } from "@/lib/auth/siteAdmin";
import { escapeHtml, sendSystemEmail } from "@/lib/emails/system";
import { PRO_PLANS, type BillingCycle } from "./plans";

/*
 * Receipts for Pro payments: the owner's list in Settings > Billing, the printable page at
 * /receipts/<id> (saved as a PDF from the browser's print window), and the "Payment received"
 * email that links to it. Flash isn't GST-registered, so it's a receipt (a record of what was
 * paid), not a tax invoice. A payment of 0 (Pro given for free) has none.
 */

const DAY = 24 * 60 * 60 * 1000;

// "FL-000123": the payment's own id, so it's unique and never changes
export const receiptNumber = (paymentId: number) => `FL-${String(paymentId).padStart(6, "0")}`;

// What it paid for: the plan's length, ending when Pro then ran until
export function periodOf(payment: { cycle: string; paidUntil: Date }) {
    const days = PRO_PLANS[payment.cycle as BillingCycle]?.days ?? 0;
    return { from: new Date(payment.paidUntil.getTime() - days * DAY), to: payment.paidUntil };
}

// Paid online with Razorpay's test keys: no real money moved, and the receipt says so.
// ponytail: read from today's keys, so switching to live keys drops the label from old test receipts too
export const isTestPayment = (payment: { method: string }) => payment.method === "RAZORPAY" && (process.env.RAZORPAY_KEY_ID ?? "").startsWith("rzp_test_");

// "₹1,499.00" from paise
export const paidAmount = (paise: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(paise / 100);

// "12 Nov 2026"
export const receiptDate = (date: Date) => date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

/**
 * A payment's receipt, for whoever may see it: the workspace's owner (also while a site admin is
 * logged in as them), or a site admin, for any workspace. Null otherwise, or when it's a free one.
 */
export async function receiptFor(paymentId: number, user: { email: string; isSiteAdmin: boolean; isOwner: boolean; organizationId: number }) {
    const payment = await prisma.payment.findUnique({ where: { id: paymentId }, include: { organization: { select: { name: true } } } });
    if (!payment || payment.amount === 0) return null;
    const allowed = isSiteAdmin(user) || (user.isOwner && user.organizationId === payment.organizationId);
    return allowed ? payment : null;
}

// The owner's payments, newest first, for Settings > Billing
export function paymentsOf(organizationId: number) {
    return prisma.payment.findMany({ where: { organizationId }, orderBy: { createdAt: "desc" } });
}

/**
 * "Payment received", to the workspace's owner, with a link to the receipt. Never fails what it's
 * called from (the payment is already saved): a problem goes in the server's log.
 */
export async function emailReceipt(paymentId: number) {
    try {
        // the link needs the site's address: APP_URL in production, this machine while developing
        const site = process.env.APP_URL?.replace(/\/$/, "") ?? (process.env.NODE_ENV !== "production" ? "http://localhost:3000" : null);
        const payment = await prisma.payment.findUnique({
            where: { id: paymentId },
            include: { organization: { select: { name: true, users: { where: { isOwner: true }, select: { name: true, email: true }, take: 1 } } } },
        });
        const owner = payment?.organization.users[0];
        if (!site || !payment || !owner || payment.amount === 0) return;

        const link = `${site}/receipts/${payment.id}`;
        const plan = `Flash Pro (${PRO_PLANS[payment.cycle as BillingCycle]?.label.toLowerCase() ?? payment.cycle})`;
        const firstName = owner.name.split(" ")[0];
        const until = receiptDate(payment.paidUntil);
        const test = isTestPayment(payment) ? " This was a test payment: no money was charged." : "";

        await sendSystemEmail({
            to: owner.email,
            subject: `Payment received: ${plan}`,
            text: `Hi ${firstName},\n\nWe received ${paidAmount(payment.amount)} for ${plan} for ${payment.organization.name}. Pro is on until ${until}.${test}\n\nYour receipt: ${link}\n\nFlash`,
            html: `<p>Hi ${escapeHtml(firstName)},</p>
<p>We received <strong>${paidAmount(payment.amount)}</strong> for ${plan} for ${escapeHtml(payment.organization.name)}. Pro is on until ${until}.${test}</p>
<p><a href="${link}" style="display:inline-block;padding:10px 18px;border-radius:999px;background:#1c1c1c;color:#ffffff;text-decoration:none;font-weight:600">View your receipt</a></p>
<p style="color:#666">Receipt ${receiptNumber(payment.id)}</p>`,
        });
    } catch (error) {
        console.error("Receipt email:", error);
    }
}
