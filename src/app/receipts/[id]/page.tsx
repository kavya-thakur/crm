import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { PRO_PLANS, type BillingCycle } from "@/lib/billing/plans";
import { isTestPayment, paidAmount, periodOf, receiptDate, receiptFor, receiptNumber } from "@/lib/billing/receipts";
import { idParamSchema } from "@/lib/validations/common";
import { PrintButton } from "./PrintButton";

export const metadata: Metadata = {
    title: "Receipt",
};

/*
 * One payment's receipt, as a page to print or save as a PDF (the browser's own "Save as PDF").
 * Outside the app's layout, so it prints as just the receipt. See src/lib/billing/receipts.ts.
 */
export default async function ReceiptPage({ params }: PageProps<"/receipts/[id]">) {
    const user = await getCurrentUser();
    if (!user) redirect("/login");

    const id = idParamSchema.safeParse((await params).id);
    // someone else's, a free one, or no such payment: all just "not found", so ids can't be probed
    const payment = id.success ? await receiptFor(id.data, user) : null;
    if (!payment) notFound();

    const { from, to } = periodOf(payment);
    const plan = PRO_PLANS[payment.cycle as BillingCycle]?.label.toLowerCase() ?? payment.cycle;
    const site = process.env.APP_URL?.replace(/^https?:\/\//, "").replace(/\/$/, "");
    const contact = process.env.SMTP_FROM || process.env.SMTP_USER;

    return (
        <main className="min-h-full bg-app px-4 py-10 print:bg-white print:p-0">
            <div className="mx-auto max-w-2xl">
                <div className="mb-4 flex items-center justify-between print:hidden">
                    <Link href="/settings/billing" className="text-sm text-muted hover:text-ink">
                        ← Billing
                    </Link>
                    <PrintButton />
                </div>

                <article className="rounded-2xl border border-line bg-surface p-8 shadow-sm sm:p-10 print:rounded-none print:border-0 print:shadow-none">
                    <header className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                            <p className="font-display text-2xl font-semibold tracking-[-0.02em]">Flash</p>
                            {site && <p className="text-sm text-muted">{site}</p>}
                            {contact && <p className="text-sm text-muted">{contact}</p>}
                        </div>
                        <div className="text-right">
                            <p className="text-lg font-semibold">Receipt</p>
                            <p className="text-sm text-muted tabular-nums">{receiptNumber(payment.id)}</p>
                            <p className="text-sm text-muted">Paid {receiptDate(payment.createdAt)}</p>
                        </div>
                    </header>

                    {isTestPayment(payment) && (
                        <p className="mt-6 rounded-lg bg-[#fff7ed] px-3 py-2 text-sm font-medium text-[#ab4400]">Test payment: no money was charged.</p>
                    )}

                    <section className="mt-8">
                        <p className="text-xs font-medium tracking-wide text-faint uppercase">Billed to</p>
                        <p className="mt-1 font-medium">{payment.organization.name}</p>
                        {payment.paidBy && <p className="text-sm text-muted">{payment.paidBy}</p>}
                    </section>

                    <table className="mt-8 w-full text-sm">
                        <thead>
                            <tr className="border-b border-line text-left text-xs tracking-wide text-faint uppercase">
                                <th className="pb-2 font-medium">Description</th>
                                <th className="pb-2 text-right font-medium">Amount</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr className="border-b border-line-light">
                                <td className="py-3">
                                    <p className="font-medium">Flash Pro ({plan})</p>
                                    <p className="text-muted">
                                        {receiptDate(from)} – {receiptDate(to)}
                                    </p>
                                </td>
                                <td className="py-3 text-right tabular-nums">{paidAmount(payment.amount)}</td>
                            </tr>
                        </tbody>
                        <tfoot>
                            <tr>
                                <td className="pt-3 font-semibold">Total paid</td>
                                <td className="pt-3 text-right font-semibold tabular-nums">{paidAmount(payment.amount)}</td>
                            </tr>
                        </tfoot>
                    </table>

                    <p className="mt-8 text-sm text-muted">
                        {payment.method === "RAZORPAY"
                            ? `Paid online with Razorpay${payment.razorpayPaymentId ? ` · ${payment.razorpayPaymentId}` : ""}`
                            : `Paid by bank transfer or UPI${payment.note ? ` · ${payment.note}` : ""}`}
                    </p>
                    <p className="mt-1 text-sm text-faint">No tax has been charged on this payment.</p>
                </article>
            </div>
        </main>
    );
}
