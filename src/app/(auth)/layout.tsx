import type { ReactNode } from "react";
import Link from "next/link";
import { Aleo } from "next/font/google";
import { IconCalendarEvent, IconCircleCheckFilled, IconUserCheck } from "@tabler/icons-react";

import { LogoMark } from "@/components/Logo";
import { HeroCity } from "../(marketing)/components/HeroCity";

const aleo = Aleo({ variable: "--font-aleo", weight: ["300"], subsets: ["latin"] });

// The kind of thing that happens in Flash all day, floating over the city
function UpdateCard({ icon, title, detail, className }: { icon: ReactNode; title: string; detail: string; className: string }) {
    return (
        <div className={`flex w-72 items-center gap-3 rounded-2xl text-left border border-[#ebebeb] bg-white/90 p-3 shadow-[0_12px_40px_rgb(0_0_0/0.12)] backdrop-blur ${className}`}>
            {icon}
            <span className="min-w-0">
                <span className="block text-[14px] font-medium text-[#1c1c1c]">{title}</span>
                <span className="block truncate text-[13px] text-[#1c1c1c]/55">{detail}</span>
            </span>
        </div>
    );
}

// Login and register share the landing page's look: the form on white, and the
// halftone city from the hero on the right (desktop only)
export default function AuthLayout({ children }: { children: ReactNode }) {
    return (
        <div className={`${aleo.variable} grid min-h-screen bg-white font-(family-name:--font-host-grotesk) min-[921px]:grid-cols-[1fr_1.1fr]`}>
            <div className="flex flex-col px-6 py-6 min-[921px]:px-12">
                <Link href="/" aria-label="Flash home" className="inline-flex items-center gap-2.5 self-start text-[#1c1c1c]">
                    <LogoMark size={30} />
                    <span className="text-[19px] font-semibold tracking-[-0.045em]">Flash</span>
                </Link>

                <main className="mx-auto flex w-full max-w-90 flex-1 flex-col justify-center py-12 animate-[fade-in_0.4s_ease-out]">{children}</main>

                <p className="text-[12px] text-[#1c1c1c]/40">© {new Date().getFullYear()} Flash</p>
            </div>

            <aside className="relative m-3 hidden overflow-hidden rounded-3xl bg-[#f4f4f4] min-[921px]:block">
                <HeroCity className="absolute inset-0" />

                <div className="relative flex h-full flex-col items-center px-10 pt-[14vh] text-center">
                    <p className="max-w-110 font-(family-name:--font-aleo) text-[44px] leading-[1.08] font-light tracking-[-0.03em] text-balance text-[#1c1c1c]">
                        Every lead, every deal, <span className="font-(family-name:--font-host-grotesk) tracking-[-0.05em]">closed in a <span className="text-[#4a38f5]">flash</span></span>
                    </p>

                    <div className="mt-12 flex flex-col items-center gap-3">
                        <UpdateCard
                            className="-translate-x-10"
                            icon={<IconUserCheck size={34} className="shrink-0 rounded-xl bg-[#edf2fe] p-2 text-[#3e63dd]" />}
                            title="Lead assigned"
                            detail="Acme Industries → Priya"
                        />
                        <UpdateCard
                            className="translate-x-10"
                            icon={<IconCalendarEvent size={34} className="shrink-0 rounded-xl bg-[#fff4d5] p-2 text-[#ab6400]" />}
                            title="Call scheduled"
                            detail="Contoso Ltd · Tue 11:00"
                        />
                        <UpdateCard
                            className="-translate-x-4"
                            icon={<IconCircleCheckFilled size={34} className="shrink-0 rounded-xl bg-[#e6f6eb] p-2 text-[#218358]" />}
                            title="Deal won · ₹4,80,000"
                            detail="Hooli Cloud moved to Won"
                        />
                    </div>
                </div>
            </aside>
        </div>
    );
}
