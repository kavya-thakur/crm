"use client";

import { useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { IconCheck } from "@tabler/icons-react";

import { Accent, CONTAINER, Eyebrow, Heading, Lead } from "./Eyebrow";
import { Button } from "./Button";
import { Spotlight } from "./Spotlight";
import { PRO_PLANS, TRIAL_DAYS } from "@/lib/billing/plans";

gsap.registerPlugin(ScrollTrigger);

// One price for the whole workspace, however many people are in it. The figures come from the
// app's own plans (src/lib/billing/plans.ts), so this page always says what Settings > Billing charges.
// Trying it and buying it are different buttons: the trial goes into the app, "Buy Pro" signs up and
// goes on to Billing (or straight there, for someone signed in).
const plans = (loggedIn: boolean) => [
    {
        name: "Free trial",
        blurb: "Try all of Flash with your whole team.",
        monthly: 0,
        yearly: 0,
        cta: loggedIn ? { label: "Go to your workspace", href: "/dashboard" } : { label: "Start free trial", href: "/register" },
        features: ["Everything in Pro", "Unlimited users", "No card needed", `${TRIAL_DAYS} days, then pick a plan`],
    },
    {
        name: "Pro",
        blurb: "Buy it now, or after your free trial: everything stays as you left it.",
        monthly: PRO_PLANS.MONTHLY.price,
        yearly: PRO_PLANS.YEARLY.price,
        cta: { label: "Buy Pro", href: loggedIn ? "/settings/billing" : "/register?plan=pro" },
        features: [
            "Unlimited users, one price",
            "Leads, deals, contacts and companies",
            "Automations, team email and WhatsApp",
            "Web forms and lead integrations",
            "Products, quotes and the dashboard",
            "Roles, permissions and a recycle bin",
        ],
    },
    {
        name: "Business",
        blurb: "For bigger teams that want a hand getting set up.",
        monthly: null,
        yearly: null,
        cta: { label: "Book a demo", href: "/demo" },
        features: ["Everything in Pro", "Help moving your data in", "Onboarding session for your team", "Priority support"],
    },
];

const rupees = (amount: number) => `₹${amount.toLocaleString("en-IN")}`;

export function PricingSection({ as = "h2", loggedIn = false }: { as?: "h1" | "h2"; loggedIn?: boolean }) {
    const sectionRef = useRef<HTMLElement>(null);
    const [yearly, setYearly] = useState(false);
    // which card the spotlight is on: Pro (1) unless another plan is hovered
    const [lit, setLit] = useState(1);

    // the three cards rise in one after another as the section comes into view
    useGSAP(
        () => {
            gsap.matchMedia().add("(prefers-reduced-motion: no-preference)", () => {
                gsap.from("[data-plan]", {
                    opacity: 0,
                    y: 40,
                    duration: 0.8,
                    ease: "power3.out",
                    stagger: 0.12,
                    scrollTrigger: { trigger: "[data-plans]", start: "top 85%", once: true },
                });
            });
        },
        { scope: sectionRef },
    );

    return (
        <section ref={sectionRef} id="pricing" className={`relative overflow-clip ${as === "h1" ? "bg-[#f4f4f4]" : "bg-white"} py-24 font-(family-name:--font-host-grotesk) min-[921px]:py-30`}>
            {/* a stage light shines on the recommended plan, or the hovered one */}
            <Spotlight lit={lit} className="absolute inset-0 hidden min-[921px]:block" />

            <div className={`${CONTAINER} relative flex flex-col items-center text-center`}>
                <Eyebrow>Pricing</Eyebrow>
                <Heading as={as} className="mt-6 max-w-200">
                    Simple pricing, <Accent>one price for your whole team</Accent>
                </Heading>
                <Lead className="mt-5 max-w-130">
                    Try everything free for {TRIAL_DAYS} days, then pay monthly or yearly. Add as many people as you like: the price stays the same. No setup fees.
                </Lead>

                {/* Monthly / Yearly: the dark thumb slides under the chosen side */}
                <div role="group" aria-label="Billing period" className="relative mt-10 grid grid-cols-2 rounded-full bg-[#1c1c1c]/5 p-1 text-[14px] font-medium">
                    <span
                        aria-hidden
                        className={`absolute inset-y-1 left-1 w-[calc(50%-4px)] rounded-full bg-[#1c1c1c] transition-transform duration-400 ease-[cubic-bezier(0.32,0.72,0,1)] ${yearly ? "translate-x-full" : ""}`}
                    />
                    {[false, true].map((option) => (
                        <button
                            key={String(option)}
                            type="button"
                            aria-pressed={yearly === option}
                            onClick={() => setYearly(option)}
                            className={`relative flex h-10 items-center justify-center gap-2 px-6 transition-colors duration-300 ${yearly === option ? "text-white" : "text-[#1c1c1c]/60 hover:text-[#1c1c1c]"}`}
                        >
                            {option ? "Yearly" : "Monthly"}
                            {option && <span className="rounded-full bg-[#4a38f5] px-2 py-0.5 text-[11px] text-white">{PRO_PLANS.YEARLY.note}</span>}
                        </button>
                    ))}
                </div>
            </div>

            <div data-plans className={`${CONTAINER} relative mt-14 grid max-w-300 items-stretch gap-4 text-left min-[921px]:grid-cols-3`}>
                {plans(loggedIn).map((plan, index) => {
                    const featured = plan.name === "Pro";
                    const price = yearly ? plan.yearly : plan.monthly;

                    return (
                        <article
                            key={plan.name}
                            data-plan
                            onPointerEnter={() => setLit(index)}
                            onPointerLeave={() => setLit(1)}
                            // side by side, the cards share their five rows (title, blurb, price, button, list)
                            // through a subgrid, so prices and buttons line up whatever each blurb's length
                            className={`flex flex-col rounded-3xl p-8 min-[921px]:row-span-5 min-[921px]:grid min-[921px]:grid-rows-subgrid min-[921px]:gap-y-0 ${featured ? "bg-[#1c1c1c] text-white shadow-[0_24px_60px_rgb(28_28_28/0.25)]" : "border border-[#1c1c1c]/10 bg-white text-[#1c1c1c]"}`}
                        >
                            <div className="flex items-center justify-between">
                                <h3 className="text-[20px] font-semibold tracking-[-0.03em]">{plan.name}</h3>
                                {featured && <span className="rounded-full bg-[#4a38f5] px-2.5 py-1 text-[12px] font-medium">Most popular</span>}
                            </div>
                            <p className={`mt-2 text-[15px] ${featured ? "text-white/60" : "text-[#1c1c1c]/60"}`}>{plan.blurb}</p>

                            <p className="mt-8 flex h-15 items-end gap-2">
                                {/* keyed so the figure fades in again when the billing period changes */}
                                <span key={String(yearly)} className="animate-[fade-in_0.35s_ease-out] font-(family-name:--font-aleo) text-[56px] leading-none font-light tracking-[-0.03em] tabular-nums">
                                    {price === null ? "Custom" : rupees(price)}
                                </span>
                                {price !== null && price > 0 && (
                                    <span className={`pb-1.5 text-[14px] leading-tight ${featured ? "text-white/50" : "text-[#1c1c1c]/50"}`}>
                                        {yearly ? "per year" : "per month"}
                                        <br />
                                        for your whole team
                                    </span>
                                )}
                                {price === 0 && <span className={`pb-1.5 text-[14px] ${featured ? "text-white/50" : "text-[#1c1c1c]/50"}`}>for {TRIAL_DAYS} days</span>}
                            </p>

                            <Button href={plan.cta.href} scheme={featured ? "dark" : "light"} variant={plan.name === "Free trial" ? "outlined" : "filled"} className={`mt-8 self-stretch ${plan.name === "Free trial" ? "justify-center" : "justify-between"}`}>
                                {plan.cta.label}
                            </Button>

                            <ul className={`mt-8 flex flex-col gap-3 border-t pt-8 text-[15px] ${featured ? "border-white/10" : "border-[#1c1c1c]/10"}`}>
                                {plan.features.map((feature) => (
                                    <li key={feature} className="flex items-center gap-3">
                                        <IconCheck size={16} stroke={2.5} className={`shrink-0 ${featured ? "text-[#8f84ff]" : "text-[#4a38f5]"}`} />
                                        {feature}
                                    </li>
                                ))}
                            </ul>
                        </article>
                    );
                })}
            </div>
        </section>
    );
}
