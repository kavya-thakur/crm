import Link from "next/link";

import { Pill } from "@/components/Pill";
import { PRO_PLANS, type BillingCycle } from "@/lib/billing/plans";
import { paidAmount, receiptDate } from "@/lib/billing/receipts";

interface Payment {
    id: number;
    createdAt: Date;
    cycle: string;
    amount: number;
    method: string;
}

// Every payment the workspace has made, newest first, each with its receipt (the owner's view;
// a free month or year has none)
export function PaymentHistory({ payments }: { payments: Payment[] }) {
    return (
        <section className="mx-auto max-w-3xl px-4 pb-10 sm:px-6">
            <h2 className="text-[17px] leading-6 font-semibold tracking-[-0.01em]">Payments</h2>
            {payments.length === 0 ? (
                <p className="mt-2 text-muted">No payments yet. Once you pay for Pro, your receipts show up here.</p>
            ) : (
                <ul className="mt-3 divide-y divide-line-light rounded-xl border border-line">
                    {payments.map((payment) => (
                        <li key={payment.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5">
                            <span className="w-24 shrink-0 text-muted">{receiptDate(payment.createdAt)}</span>
                            <span className="min-w-0 flex-1">Pro, {PRO_PLANS[payment.cycle as BillingCycle]?.label.toLowerCase() ?? payment.cycle}</span>
                            <span className="font-medium tabular-nums">{paidAmount(payment.amount)}</span>
                            {payment.method === "RAZORPAY" ? <Pill tone="green">Online</Pill> : <Pill tone="blue">Manual</Pill>}
                            {payment.amount > 0 ? (
                                <Link href={`/receipts/${payment.id}`} className="w-16 text-right font-medium text-accent hover:underline">
                                    Receipt
                                </Link>
                            ) : (
                                <span className="w-16 text-right text-faint">Free</span>
                            )}
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}
