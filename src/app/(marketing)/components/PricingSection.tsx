"use client";

import { useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { IconCheck } from "@tabler/icons-react";

import { Accent, CONTAINER, Eyebrow, Heading, Lead } from "./Eyebrow";
import { Button } from "./Button";
import { WaveField } from "./WaveField";

gsap.registerPlugin(ScrollTrigger);

// Prices are per user, per month; a yearly plan is billed once a year at 20% off
const PLANS = [
    {
        name: "Free",
        blurb: "For trying Flash with a small team.",
        monthly: 0,
        yearly: 0,
        cta: { label: "Get started", href: "/register" },
        features: ["Up to 3 users", "Leads, deals and contacts", "Kanban boards", "Tasks and scheduled activities", "Notes with @mentions"],
    },
    {
        name: "Team",
        blurb: "For sales teams that work every day in Flash.",
        monthly: 999,
        yearly: 799,
        cta: { label: "Get started", href: "/register" },
        features: ["Everything in Free", "Unlimited users", "Roles and permissions", "Custom fields and pipeline stages", "Web forms that create leads", "Full timeline on every record"],
    },
    {
        name: "Business",
        blurb: "For bigger teams that want a hand getting set up.",
        monthly: null,
        yearly: null,
        cta: { label: "Book a demo", href: "/demo" },
        features: ["Everything in Team", "Help moving your data in", "Onboarding session for your team", "Priority support"],
    },
];

const rupees = (amount: number) => `₹${amount.toLocaleString("en-IN")}`;

export function PricingSection({ as = "h2" }: { as?: "h1" | "h2" }) {
    const sectionRef = useRef<HTMLElement>(null);
    const [yearly, setYearly] = useState(false);

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
        <section ref={sectionRef} id="pricing" className={`relative overflow-clip ${as === "h1" ? "bg-[#f4f4f4]" : "bg-white pb-48 min-[921px]:pb-64"} py-24 font-(family-name:--font-host-grotesk) min-[921px]:py-30`}>
            {/* on the landing page, violet ridge lines roll along under the plans, like a floor they stand on */}
            {as === "h2" && <WaveField className="absolute inset-x-0 bottom-0 h-[60%]" />}

            <div className={`${CONTAINER} relative flex flex-col items-center text-center`}>
                <Eyebrow>Pricing</Eyebrow>
                <Heading as={as} className="mt-6 max-w-200">
                    Simple pricing, <Accent>for teams of every size</Accent>
                </Heading>
                <Lead className="mt-5 max-w-130">Start free, pay per user when your team grows. No setup fees, no minimum seats, cancel any time.</Lead>

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
                            {option && <span className="rounded-full bg-[#4a38f5] px-2 py-0.5 text-[11px] text-white">−20%</span>}
                        </button>
                    ))}
                </div>
            </div>

            <div data-plans className={`${CONTAINER} relative mt-14 grid max-w-300 items-stretch gap-4 text-left min-[921px]:grid-cols-3`}>
                {PLANS.map((plan) => {
                    const featured = plan.name === "Team";
                    const price = yearly ? plan.yearly : plan.monthly;

                    return (
                        <article
                            key={plan.name}
                            data-plan
                            className={`flex flex-col rounded-3xl p-8 ${featured ? "bg-[#1c1c1c] text-white shadow-[0_24px_60px_rgb(28_28_28/0.25)]" : "border border-[#1c1c1c]/10 bg-white text-[#1c1c1c]"}`}
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
                                        per user / month
                                        <br />
                                        {yearly ? "billed yearly" : "billed monthly"}
                                    </span>
                                )}
                                {price === 0 && <span className={`pb-1.5 text-[14px] ${featured ? "text-white/50" : "text-[#1c1c1c]/50"}`}>forever</span>}
                            </p>

                            <Button href={plan.cta.href} scheme={featured ? "dark" : "light"} variant={plan.name === "Free" ? "outlined" : "filled"} className={`mt-8 self-stretch ${plan.name === "Free" ? "justify-center" : "justify-between"}`}>
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
