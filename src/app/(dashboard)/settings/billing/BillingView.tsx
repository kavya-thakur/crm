"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import axios from "axios";
import { useMutation } from "@tanstack/react-query";
import { IconCheck, IconClockHour4, IconLock, IconShieldCheck } from "@tabler/icons-react";

import { api, errorMessage } from "@/lib/api/client";
import { formatDate, formatMoneyIn } from "@/lib/utils/format";
import { BILLING_CYCLES, PRO_FEATURES, PRO_PLANS, type BillingCycle } from "@/lib/billing/plans";
import type { BillingSummary } from "@/lib/billing/gate";
import { Spinner } from "@/components/Loader";
import { toast } from "@/components/Toast";

/**
 * Billing: where the workspace stands (trial days left, Pro until when, or ended) and the Pro
 * plans. The same view is the whole screen when the workspace is locked (`locked`). The owner asks
 * for Pro here; a site admin switches it on once they've paid.
 */
export default function BillingView({ billing, locked = false }: { billing: BillingSummary; locked?: boolean }) {
    const [requested, setRequested] = useState(billing.planRequest as BillingCycle | null);

    const request = useMutation({
        mutationFn: (cycle: BillingCycle) => api.post("/billing", { cycle }),
        onSuccess: (_, cycle) => {
            setRequested(cycle);
            toast.success("Request sent", "We'll be in touch to take the payment, then switch Pro on.");
        },
        onError: (error) => toast.error(errorMessage(error)),
    });

    // Razorpay's payment window: an order from the server, the window, then the server checks the
    // payment's signature and switches Pro on. Resolves "paid", or "closed" if the window was shut.
    const router = useRouter();
    const pay = useMutation({
        mutationFn: async (cycle: BillingCycle) => {
            const [order] = await Promise.all([api.post<{ data: CheckoutOrder }>("/billing/order", { cycle }).then((res) => res.data.data), loadCheckout()]);
            return new Promise<"paid" | "closed">((resolve, reject) => {
                const checkout = new window.Razorpay!({
                    key: order.keyId,
                    order_id: order.orderId,
                    amount: order.amount,
                    currency: order.currency,
                    name: "Flash",
                    description: `${order.description} for ${order.workspace}`,
                    prefill: order.prefill,
                    theme: { color: "#4a38f5" },
                    handler: (response: Record<string, string>) => api.post("/billing/verify", response).then(() => resolve("paid"), reject),
                    modal: { ondismiss: () => resolve("closed") },
                });
                // a card declined, say: the window stays open to try again, so it's only said here
                checkout.on("payment.failed", (response) => toast.error("Payment failed", response.error?.description ?? "Please try another way to pay."));
                checkout.open();
            });
        },
        onSuccess: (result) => {
            if (result === "closed") return toast.info("Payment cancelled", "Nothing was charged.");
            toast.success("Payment received", "Pro is on. Thank you!");
            // the layout re-renders: a locked app opens up, and this shows the new plan
            router.refresh();
        },
        // the API's message, or the script's own ("Couldn't load Razorpay...")
        onError: (error) => toast.error(axios.isAxiosError(error) ? errorMessage(error) : error.message),
    });

    const ended = billing.state === "ended";

    return (
        <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
            {/* where it stands */}
            {ended ? (
                <div className="rounded-xl border border-[#ffd19a] bg-[#fff7ed] p-5">
                    <p className="flex items-center gap-2 text-lg font-semibold text-ink">
                        <IconLock size={20} className="text-[#ef5f00]" />
                        {billing.wasPro ? "Your Pro plan has ended" : "Your free trial has ended"}
                    </p>
                    <p className="mt-2 flex items-start gap-2 text-muted">
                        <IconShieldCheck size={18} className="mt-0.5 shrink-0 text-success" />
                        <span>
                            <span className="font-medium text-ink">Your data is safe.</span> Every lead, deal, contact and note in {billing.workspaceName} is
                            kept exactly as you left it. Choose a plan to pick up where you left off.
                        </span>
                    </p>
                </div>
            ) : (
                <div className="flex flex-col gap-1 rounded-xl border border-line bg-surface p-5 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <p className="text-sm text-faint">Current plan</p>
                        <p className="text-lg font-semibold">
                            {billing.state === "pro" ? `Pro · ${PRO_PLANS[billing.billingCycle as BillingCycle]?.label ?? ""}` : "Free trial"}
                        </p>
                    </div>
                    <p className="flex items-center gap-1.5 text-muted">
                        <IconClockHour4 size={16} className="text-faint" />
                        {billing.state === "pro" ? "Paid until " : `${billing.daysLeft} ${billing.daysLeft === 1 ? "day" : "days"} left · ends `}
                        {billing.endsAt && formatDate(billing.endsAt)}
                    </p>
                </div>
            )}

            {requested && (
                <p className="mt-4 rounded-lg bg-accent-faint px-3 py-2 text-ink ring-1 ring-accent/30 ring-inset">
                    You asked for <span className="font-medium">Pro {PRO_PLANS[requested].label.toLowerCase()}</span>. We&apos;ll contact
                    {billing.owner ? ` ${billing.owner.email}` : " you"} to take the payment, and switch it on straight after.
                </p>
            )}

            {/* the plans */}
            <h2 className="mt-8 text-[17px] font-semibold">{ended ? "Choose a plan to continue" : "Pro"}</h2>
            <p className="mt-0.5 text-muted">Everything in Flash, for your whole team.</p>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {BILLING_CYCLES.map((cycle) => {
                    const plan = PRO_PLANS[cycle];
                    const current = billing.state === "pro" && billing.billingCycle === cycle;
                    return (
                        <div key={cycle} className={`flex flex-col rounded-xl border bg-surface p-5 ${cycle === "YEARLY" ? "border-accent/40 ring-1 ring-accent/20" : "border-line"}`}>
                            <div className="flex items-center gap-2">
                                <p className="font-semibold">Pro {plan.label.toLowerCase()}</p>
                                {plan.note && <span className="rounded-full bg-success-soft px-2 text-sm font-medium text-success">{plan.note}</span>}
                            </div>
                            <p className="mt-2">
                                <span className="text-3xl font-semibold tracking-tight">{formatMoneyIn(plan.price, "INR")}</span>
                                <span className="text-muted"> / {plan.per}</span>
                            </p>
                            <ul className="mt-4 flex flex-1 flex-col gap-1.5 text-muted">
                                {PRO_FEATURES.map((feature) => (
                                    <li key={feature} className="flex items-start gap-2">
                                        <IconCheck size={16} className="mt-0.5 shrink-0 text-success" />
                                        {feature}
                                    </li>
                                ))}
                            </ul>
                            {billing.canChoose ? (
                                <button
                                    type="button"
                                    disabled={request.isPending || pay.isPending || (!billing.payOnline && requested === cycle)}
                                    onClick={() => (billing.payOnline ? pay.mutate(cycle) : request.mutate(cycle))}
                                    className={`mt-5 flex h-9 items-center justify-center gap-1.5 rounded-lg font-medium disabled:opacity-60 ${
                                        cycle === "YEARLY" ? "bg-accent text-on-accent hover:bg-accent-hover" : "border border-line hover:bg-fill"
                                    }`}
                                >
                                    {((request.isPending && request.variables === cycle) || (pay.isPending && pay.variables === cycle)) && <Spinner size={14} />}
                                    {billing.payOnline
                                        ? `${current ? "Renew" : "Pay"} ${formatMoneyIn(plan.price, "INR")}`
                                        : requested === cycle
                                          ? "Requested"
                                          : current
                                            ? "Renew"
                                            : `Choose ${plan.label.toLowerCase()}`}
                                </button>
                            ) : (
                                <p className="mt-5 text-center text-sm text-faint">{current ? "Your current plan" : `Only ${billing.owner?.name ?? "the owner"} can choose a plan`}</p>
                            )}
                            {/* paying early adds on after what's running now (activatePro), so say when */}
                            {billing.canChoose && !ended && billing.endsAt && (
                                <p className="mt-2 text-center text-sm text-faint">
                                    Adds a {plan.per} after your {billing.state === "trial" ? "trial" : "current plan"} ends on {formatDate(billing.endsAt)}
                                </p>
                            )}
                        </div>
                    );
                })}
            </div>

            {locked && !billing.canChoose && (
                <p className="mt-6 text-center text-muted">
                    Ask {billing.owner?.name ?? "your workspace owner"} to choose a plan, and everything opens up again.
                </p>
            )}
        </div>
    );
}

interface CheckoutOrder {
    orderId: string;
    amount: number;
    currency: string;
    keyId: string;
    description: string;
    workspace: string;
    prefill: { name: string; email: string };
}

// Razorpay's checkout script, the window it opens (loaded once, the first time someone pays)
declare global {
    interface Window {
        Razorpay?: new (options: object) => { open: () => void; on: (event: string, listener: (response: { error?: { description?: string } }) => void) => void };
    }
}
let checkoutScript: Promise<void> | undefined;
function loadCheckout() {
    checkoutScript ??= new Promise<void>((resolve, reject) => {
        const script = document.createElement("script");
        script.src = "https://checkout.razorpay.com/v1/checkout.js";
        script.onload = () => resolve();
        script.onerror = () => {
            checkoutScript = undefined;
            reject(new Error("Couldn't load Razorpay. Check your connection and try again."));
        };
        document.body.appendChild(script);
    });
    return checkoutScript;
}

// On the lock screen: whatever page was asked for, the address becomes Billing's
export function BillingAddress() {
    useEffect(() => {
        if (window.location.pathname !== "/settings/billing") window.history.replaceState(null, "", "/settings/billing");
    }, []);
    return null;
}
