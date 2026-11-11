import type { ReactNode } from "react";
import { IconArrowRight, IconCircleCheckFilled, IconUserCheck } from "@tabler/icons-react";

import { Button } from "./Button";
import { HeroCity } from "./HeroCity";
import { HeroPreview } from "./HeroPreview";

// The little cards that slide in beside the window while the hero is pinned,
// showing the kind of thing that happens in Flash all day
function UpdateCard({ side, icon, title, detail }: { side: "left" | "right"; icon: ReactNode; title: string; detail: string }) {
    return (
        <div
            data-hero-card
            className={`absolute z-20 hidden w-64 items-center gap-3 rounded-2xl border border-[#ebebeb] bg-white/90 p-3 font-(family-name:--font-host-grotesk) shadow-[0_12px_40px_rgb(0_0_0/0.14)] backdrop-blur min-[921px]:flex ${side === "left" ? "top-[22%] -left-16" : "top-[52%] -right-16"}`}
        >
            {icon}
            <span className="min-w-0">
                <span className="block text-[14px] font-medium text-[#1c1c1c]">{title}</span>
                <span className="block truncate text-[13px] text-[#1c1c1c]/55">{detail}</span>
            </span>
        </div>
    );
}

export function Hero({ loggedIn, primaryHref, primaryLabel }: { loggedIn: boolean; primaryHref: string; primaryLabel: string }) {
    return (
        <section data-hero className="relative overflow-clip bg-[#f4f4f4]">
            {/* a 3D city drawn in dashes behind everything, lighting up around the pointer */}
            <HeroCity className="absolute inset-x-0 top-0 h-225" />

            <div className="relative mx-auto flex w-full max-w-378 flex-col px-4 pt-14 pb-10 min-[921px]:px-10">
                <div data-hero-copy className="flex w-full flex-col items-center text-center">
                    <a
                        data-hero-line
                        href="#how-it-works"
                        className="group inline-flex items-center gap-2 rounded-full border border-[#1c1c1c]/10 bg-white py-1 pr-3 pl-1 font-(family-name:--font-host-grotesk) text-[13px] text-[#1c1c1c]/70 transition-colors hover:text-[#1c1c1c]"
                    >
                        <span className="rounded-full bg-[#4a38f5] px-2 py-0.5 text-[11px] font-medium text-white">New</span>
                        Import thousands of leads from a CSV
                        <IconArrowRight size={13} className="transition-transform group-hover:translate-x-0.5" />
                    </a>

                    <h1
                        data-hero-line
                        className="mt-7 max-w-200 font-(family-name:--font-aleo) text-[clamp(2.75rem,1.6rem+4.6vw,4.75rem)] leading-[1.04] font-light tracking-[-0.03em] text-balance text-[#1c1c1c]"
                    >
                        Every lead, every deal,{" "}
                        <span className="font-(family-name:--font-host-grotesk) tracking-[-0.05em]">
                            closed in a <span className="text-[#4a38f5]">flash</span>
                        </span>
                    </h1>

                    <p data-hero-line className="mt-6 max-w-140 font-(family-name:--font-host-grotesk) text-[17px] leading-[1.55] text-[#1c1c1c]/60">
                        Flash is the CRM your whole team actually opens. Website enquiries arrive already assigned, no customer gets chased twice, and every call, deal and note lives in one shared workspace.
                    </p>

                    <div data-hero-line className="mt-9 flex flex-wrap justify-center gap-3">
                        <Button href={primaryHref}>{primaryLabel}</Button>
                        {/* straight into the demo workspace with sample data, no sign-up (see /api/auth/demo) */}
                        {!loggedIn && (
                            <Button href="/api/auth/demo" variant="outlined">
                                Explore the live demo
                            </Button>
                        )}
                    </div>
                </div>

                <div data-hero-mockup className="relative z-10 mt-16 w-full">
                    <div data-hero-tilt className="relative mx-auto max-w-260">
                        <HeroPreview />
                        <UpdateCard
                            side="left"
                            icon={<IconUserCheck size={34} className="shrink-0 rounded-xl bg-[#edf2fe] p-2 text-[#3e63dd]" />}
                            title="Lead assigned"
                            detail="Acme Industries → Olivia"
                        />
                        <UpdateCard
                            side="right"
                            icon={<IconCircleCheckFilled size={34} className="shrink-0 rounded-xl bg-[#e6f6eb] p-2 text-[#218358]" />}
                            title="Deal won · ₹4,80,000"
                            detail="Contoso Ltd moved to Won"
                        />
                    </div>
                </div>
            </div>
        </section>
    );
}
