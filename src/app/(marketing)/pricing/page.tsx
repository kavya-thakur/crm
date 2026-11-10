import { IconCheck, IconMinus } from "@tabler/icons-react";

import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { Nav } from "../components/Nav";
import { PricingSection } from "../components/PricingSection";
import { FaqSection } from "../components/FaqSection";
import { Footer } from "../components/Footer";
import { CONTAINER, Eyebrow } from "../components/Eyebrow";
import { pageMetadata } from "../metadata";
import { PRO_PLANS, TRIAL_DAYS } from "@/lib/billing/plans";

export const metadata = pageMetadata(
    "/pricing",
    "Pricing",
    `Try Flash free for ${TRIAL_DAYS} days. Pro is ₹${PRO_PLANS.MONTHLY.price.toLocaleString("en-IN")} a month or ₹${PRO_PLANS.YEARLY.price.toLocaleString("en-IN")} a year for your whole team, with unlimited users.`,
);

const price = (amount: number) => `₹${amount.toLocaleString("en-IN")}`;

// Each row: what it is, then Free trial / Pro / Business. true = included, false = not, text = what it is.
// The trial has everything Pro has; Business adds help getting set up.
const GROUPS: { title: string; rows: [string, ...(boolean | string)[]][] }[] = [
    {
        title: "Plan",
        rows: [
            ["Price", "Free", `${price(PRO_PLANS.MONTHLY.price)} / month or ${price(PRO_PLANS.YEARLY.price)} / year`, "Custom"],
            ["How long", `${TRIAL_DAYS} days`, "Monthly or yearly", "Yearly"],
            ["Users", "Unlimited", "Unlimited", "Unlimited"],
        ],
    },
    {
        title: "Workspace",
        rows: [
            ["Leads, deals, contacts and companies", true, true, true],
            ["Kanban boards, tables and a calendar", true, true, true],
            ["Imports and exports", true, true, true],
            ["Global search (⌘K)", true, true, true],
        ],
    },
    {
        title: "Selling together",
        rows: [
            ["Tasks, calls and meetings", true, true, true],
            ["Automations", true, true, true],
            ["Team email and WhatsApp", true, true, true],
            ["Web forms and lead integrations", true, true, true],
            ["Products and quotes", true, true, true],
        ],
    },
    {
        title: "Control",
        rows: [
            ["Roles and permissions", true, true, true],
            ["Custom fields and pipeline stages", true, true, true],
            ["Full history on every record", true, true, true],
            ["Recycle bin", true, true, true],
        ],
    },
    {
        title: "Support",
        rows: [
            ["Email support", true, true, true],
            ["Help moving your data in", false, false, true],
            ["Onboarding session for your team", false, false, true],
            ["Priority support", false, false, true],
        ],
    },
];

function Cell({ value }: { value: boolean | string }) {
    if (typeof value === "string") return <span className="text-[#1c1c1c]">{value}</span>;
    return value ? (
        <IconCheck size={18} stroke={2.5} aria-label="Included" className="inline text-[#4a38f5]" />
    ) : (
        <IconMinus size={16} aria-label="Not included" className="inline text-[#1c1c1c]/25" />
    );
}

export default async function PricingPage() {
    const user = await getCurrentUser();
    const primaryHref = user ? "/dashboard" : "/register";
    const primaryLabel = user ? "Go to your workspace" : "Get started";

    return (
        <div className="bg-white text-[#1c1c1c]">
            <Nav loggedIn={!!user} primaryHref={primaryHref} primaryLabel={primaryLabel} />

            <main>
                <PricingSection as="h1" loggedIn={!!user} />

                <section className={`${CONTAINER} max-w-300 pt-20 pb-30 font-(family-name:--font-host-grotesk)`}>
                    <Eyebrow>Compare plans</Eyebrow>

                    <div className="mt-8 overflow-x-auto">
                        <table className="w-full min-w-160 border-collapse text-[15px]">
                            <thead>
                                <tr className="border-b border-[#1c1c1c]/10 text-left">
                                    <th className="w-[40%] py-4 font-normal text-[#1c1c1c]/50">Features</th>
                                    {["Free trial", "Pro", "Business"].map((plan) => (
                                        <th key={plan} className="py-4 text-center text-[17px] font-semibold tracking-[-0.03em]">
                                            {plan}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            {GROUPS.map((group) => (
                                <tbody key={group.title}>
                                    <tr>
                                        <th colSpan={4} className="pt-10 pb-3 text-left font-(family-name:--font-azeret-mono) text-[12px] font-medium text-[#1c1c1c]/50 uppercase">
                                            {group.title}
                                        </th>
                                    </tr>
                                    {group.rows.map(([label, ...plans]) => (
                                        <tr key={label} className="border-b border-[#1c1c1c]/6 transition-colors hover:bg-[#f9f9f9]">
                                            <td className="py-4 text-[#1c1c1c]/70">{label}</td>
                                            {plans.map((value, index) => (
                                                <td key={index} className="py-4 text-center">
                                                    <Cell value={value} />
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            ))}
                        </table>
                    </div>
                </section>

                <FaqSection primaryHref={primaryHref} primaryLabel={primaryLabel} />
            </main>

            <Footer />
        </div>
    );
}
