import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { dealScope, hasPermission } from "@/lib/auth/requirePermission";
import { idParamSchema } from "@/lib/validations/common";
import { lineAmounts, quoteTotals } from "@/lib/deals/quote";
import { formatMoneyExact } from "@/lib/utils/format";
import { PrintButton } from "./PrintButton";

type Props = { params: Promise<{ id: string }> };

// the browser names the saved PDF after the title
export async function generateMetadata({ params }: Props): Promise<Metadata> {
    return { title: `Quote Q-${(await params).id}` };
}

const VALID_DAYS = 30;
const day = (date: Date) => date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

/**
 * A deal's quote as a page of its own, outside the app's sidebar, made to be printed or saved as a
 * PDF and sent to the customer: who it's for, what they're buying, and the total with tax.
 */
export default async function QuotePage({ params }: Props) {
    const user = await getCurrentUser();
    if (!user) redirect("/login");

    const id = idParamSchema.safeParse((await params).id);
    if (!id.success || !hasPermission(user, "deal:read")) notFound();

    const deal = await prisma.deal.findFirst({
        where: { id: id.data, ...dealScope(user) },
        select: {
            id: true,
            title: true,
            lead: { select: { name: true, email: true, phone: true, companyName: true } },
            products: { orderBy: { id: "asc" } },
        },
    });
    if (!deal) notFound();

    const currency = user.organization.currency;
    const money = (value: number) => formatMoneyExact(value, currency);
    const lines = deal.products.map((line) => ({ ...line, price: Number(line.price) }));
    const totals = quoteTotals(lines);
    const today = new Date();
    const validUntil = new Date(today.getTime() + VALID_DAYS * 24 * 60 * 60 * 1000);

    return (
        <div className="min-h-dvh bg-app py-8 print:bg-white print:py-0">
            <div className="mx-auto mb-4 flex max-w-3xl items-center gap-2 px-4 print:hidden">
                <Link href={`/deals?open=${deal.id}`} className="font-medium text-muted hover:text-ink">
                    ← Back to the deal
                </Link>
                <div className="ml-auto">
                    <PrintButton />
                </div>
            </div>

            <article className="mx-auto max-w-3xl bg-surface px-6 py-10 shadow-[0_1px_2px_rgb(0_0_0/0.04),0_8px_28px_-10px_rgb(0_0_0/0.14)] sm:px-12 print:max-w-none print:px-0 print:py-0 print:shadow-none">
                <header className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                        <p className="text-xl font-semibold">{user.organization.name}</p>
                        <p className="mt-1 text-muted">{user.name}</p>
                        <p className="text-muted">{user.email}</p>
                    </div>
                    <div className="sm:text-right">
                        <h1 className="text-3xl font-semibold tracking-tight">Quote</h1>
                        <dl className="mt-2 grid grid-cols-[auto_auto] gap-x-4 text-muted sm:justify-end">
                            <dt>Number</dt>
                            <dd className="text-ink">Q-{deal.id}</dd>
                            <dt>Date</dt>
                            <dd className="text-ink">{day(today)}</dd>
                            <dt>Valid until</dt>
                            <dd className="text-ink">{day(validUntil)}</dd>
                        </dl>
                    </div>
                </header>

                <section className="mt-10 grid gap-6 sm:grid-cols-2">
                    <div>
                        <p className="text-sm font-medium tracking-wide text-faint uppercase">For</p>
                        {deal.lead ? (
                            <>
                                <p className="mt-1 font-medium">{deal.lead.name}</p>
                                {deal.lead.companyName && <p className="text-muted">{deal.lead.companyName}</p>}
                                {deal.lead.email && <p className="text-muted">{deal.lead.email}</p>}
                                {deal.lead.phone && <p className="text-muted">{deal.lead.phone}</p>}
                            </>
                        ) : (
                            <p className="mt-1 text-faint">No lead linked to this deal</p>
                        )}
                    </div>
                    <div>
                        <p className="text-sm font-medium tracking-wide text-faint uppercase">Regarding</p>
                        <p className="mt-1 font-medium">{deal.title}</p>
                    </div>
                </section>

                {lines.length === 0 ? (
                    <p className="mt-10 rounded-xl border border-dashed border-line-strong px-4 py-10 text-center text-faint">
                        This deal has no products yet. Add them on the deal&apos;s Products tab.
                    </p>
                ) : (
                    <>
                        <div className="mt-10 overflow-x-auto">
                            <table className="w-full min-w-[520px] text-left">
                                <thead className="text-sm text-faint">
                                    <tr className="border-b border-line">
                                        <th className="py-2 pr-2 font-medium">Item</th>
                                        <th className="px-2 py-2 text-right font-medium">Qty</th>
                                        <th className="px-2 py-2 text-right font-medium">Price</th>
                                        <th className="px-2 py-2 text-right font-medium">Discount</th>
                                        <th className="px-2 py-2 text-right font-medium">Tax</th>
                                        <th className="py-2 pl-2 text-right font-medium">Amount</th>
                                    </tr>
                                </thead>
                                <tbody className="tabular-nums">
                                    {lines.map((line) => {
                                        const amounts = lineAmounts(line);
                                        return (
                                            <tr key={line.id} className="border-b border-line-light">
                                                <td className="py-2.5 pr-2">{line.name}</td>
                                                <td className="px-2 py-2.5 text-right">{line.quantity}</td>
                                                <td className="px-2 py-2.5 text-right">{money(line.price)}</td>
                                                <td className="px-2 py-2.5 text-right">{line.discountPercent ? `${line.discountPercent}%` : "—"}</td>
                                                <td className="px-2 py-2.5 text-right">{line.taxPercent ? `${line.taxPercent}%` : "—"}</td>
                                                <td className="py-2.5 pl-2 text-right">{money(amounts.total)}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        <dl className="mt-6 ml-auto grid max-w-xs grid-cols-[1fr_auto] gap-x-6 gap-y-1.5 tabular-nums">
                            <dt className="text-muted">Subtotal</dt>
                            <dd className="text-right">{money(totals.gross)}</dd>
                            {totals.discount > 0 && (
                                <>
                                    <dt className="text-muted">Discount</dt>
                                    <dd className="text-right">−{money(totals.discount)}</dd>
                                </>
                            )}
                            <dt className="text-muted">Tax</dt>
                            <dd className="text-right">{money(totals.tax)}</dd>
                            <dt className="border-t border-line pt-2 text-lg font-semibold">Total</dt>
                            <dd className="border-t border-line pt-2 text-right text-lg font-semibold">{money(totals.total)}</dd>
                        </dl>
                    </>
                )}

                <p className="mt-12 text-sm text-faint">
                    This quote is valid for {VALID_DAYS} days. Questions? Reply to {user.email}.
                </p>
            </article>
        </div>
    );
}
