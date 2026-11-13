import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { billingSummary } from "@/lib/billing/gate";
import { SectionIcon } from "@/components/SectionIcon";
import { paymentsOf } from "@/lib/billing/receipts";
import BillingView from "./BillingView";
import { PaymentHistory } from "./PaymentHistory";

export const metadata: Metadata = {
    title: "Billing",
};

// Everyone can see where the workspace stands; only the owner chooses a plan and sees the payments
export default async function BillingPage() {
    const user = await getCurrentUser();

    if (!user) {
        redirect("/login");
    }

    return (
        <div className="flex h-full flex-col">
            <header className="flex h-12 shrink-0 items-center gap-2 border-b border-line bg-paper px-3">
                <SectionIcon section="billing" size="md" />
                <h1 className="font-semibold">Billing</h1>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto">
                <BillingView billing={await billingSummary(user)} />
                {/* what was paid and its receipts: the owner's, like choosing the plan */}
                {user.isOwner && <PaymentHistory payments={await paymentsOf(user.organizationId)} />}
            </div>
        </div>
    );
}
