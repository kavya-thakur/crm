/*
 * Plans and what a workspace may do on each. Every workspace starts on a 7-day free trial; Pro has
 * everything and is paid monthly or yearly. When the trial (or a paid period) ends, the app locks
 * until Pro is switched on: every page shows Billing, and the API refuses (src/lib/billing/gate.ts).
 * Nothing is deleted. Until online payments are added, the owner asks for Pro on the Billing page
 * and a site admin switches it on once they've paid (Settings > Site admin > Workspaces).
 *
 * Prices are in rupees, whatever currency the workspace shows its own amounts in. Change them here.
 */

export const TRIAL_DAYS = 7;

export const PRO_PLANS = {
    MONTHLY: { label: "Monthly", price: 1499, per: "month", days: 30, note: null },
    YEARLY: { label: "Yearly", price: 14990, per: "year", days: 365, note: "2 months free" },
} as const;

export type BillingCycle = keyof typeof PRO_PLANS;
export const BILLING_CYCLES = Object.keys(PRO_PLANS) as BillingCycle[];

// What Pro includes, for the plan cards
export const PRO_FEATURES = [
    "Unlimited users, leads, deals and contacts",
    "Automations, email and WhatsApp",
    "Web forms and lead integrations",
    "Products, quotes and the dashboard",
    "Recycle bin, imports and exports",
];

const DAY = 24 * 60 * 60 * 1000;

interface Billing {
    plan: string;
    trialEndsAt: Date;
    paidUntil: Date | null;
}

/**
 * Where a workspace stands: on its trial, on Pro, or ended (locked). `endsAt` is when the current
 * one ends (or ended), `daysLeft` rounded up, so the last few hours still say "1 day left".
 */
export function accessOf(billing: Billing, now = new Date()) {
    const state =
        billing.plan === "PRO" && billing.paidUntil && billing.paidUntil > now
            ? ("pro" as const)
            : billing.plan !== "PRO" && billing.trialEndsAt > now
              ? ("trial" as const)
              : ("ended" as const);
    const endsAt = billing.plan === "PRO" ? billing.paidUntil : billing.trialEndsAt;
    return {
        state,
        endsAt,
        daysLeft: endsAt ? Math.max(0, Math.ceil((endsAt.getTime() - now.getTime()) / DAY)) : 0,
        // ended after paying (as opposed to a trial that ran out): the lock screen says so
        wasPro: billing.plan === "PRO",
    };
}

export type Access = ReturnType<typeof accessOf>;

// Pro switched on (or renewed) for a period: from when the current one ends if it's still running,
// otherwise from now, so renewing early never loses paid days
export function paidUntilAfter(cycle: BillingCycle, current: Date | null, now = new Date()) {
    const from = current && current > now ? current : now;
    return new Date(from.getTime() + PRO_PLANS[cycle].days * DAY);
}
