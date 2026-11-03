"use client";

import { useRef, type ReactNode } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { IconBell, IconCheck, IconClock, IconPhoneCall, IconShieldCheck, IconTrendingUp } from "@tabler/icons-react";

import { Avatar } from "@/components/Avatar";
import { Accent, Eyebrow, Heading } from "../components/Eyebrow";

gsap.registerPlugin(ScrollTrigger);

// One lead's whole life in Flash, as it really happens (src/lib/leads/capture.ts and on):
// a web form becomes a lead, the next person in turn gets it with a task, a call is
// booked, the lead becomes a deal, and the win lands on the dashboard.

const PANEL = "rounded-xl bg-white p-3 text-[12px] text-[#1c1c1c] shadow-[0_10px_30px_rgb(0_0_0/0.08)] ring-1 ring-[#1c1c1c]/6";
const BADGE = "rounded-full px-1.5 py-0.5 text-[10px] font-medium";
const tint = (color: string) => ({ color, backgroundColor: `${color}1a` });

const STEPS: { title: string; body: string; visual: ReactNode }[] = [
    {
        title: "Someone fills in your website form",
        body: "The form on your site sends straight to Flash. A hidden spam trap and a per-visitor limit keep bots out.",
        visual: (
            <div className={PANEL}>
                <p className="font-(family-name:--font-aleo) text-[15px]">Talk to our team</p>
                <p className="mt-2 rounded-md border border-[#e5e5e5] px-2 py-1.5">Riya Sharma</p>
                <p className="mt-1.5 rounded-md border border-[#e5e5e5] px-2 py-1.5 tabular-nums">98765 43210</p>
                <p className="mt-2 flex items-center justify-center gap-1 rounded-md bg-[#4a38f5] py-1.5 font-medium text-white">
                    <IconCheck size={12} stroke={3} /> Sent
                </p>
            </div>
        ),
    },
    {
        title: "Flash makes the lead and picks the owner",
        body: "It checks the phone and email for an open lead first, then hands the new one to the next person in turn.",
        visual: (
            <div className={PANEL}>
                <div className="flex items-center gap-2">
                    <Avatar name="Riya Sharma" />
                    <span className="font-medium">Riya Sharma</span>
                    <span className={`ml-auto ${BADGE}`} style={tint("#ed87fc")}>
                        Website
                    </span>
                </div>
                <p className="mt-2.5 flex items-center gap-1.5 text-[#059669]">
                    <IconShieldCheck size={13} /> No open lead with this phone or email
                </p>
                <p className="mt-2 flex items-center gap-1.5 text-[#1c1c1c]/60">
                    Owner <Avatar name="Priya" /> <span className="font-medium text-[#1c1c1c]">Priya</span> · next in turn
                </p>
            </div>
        ),
    },
    {
        title: "Priya is told, with a task for today",
        body: "Her bell lights up with the new lead, and a high-priority task to reply is already on her list.",
        visual: (
            <div className="flex flex-col gap-2">
                <div className={`${PANEL} flex items-center gap-2`}>
                    <span className="flex size-6 items-center justify-center rounded-full bg-[#4a38f5]/10 text-[#4a38f5]">
                        <IconBell size={13} />
                    </span>
                    <span className="font-medium">New lead from &quot;Website contact form&quot;</span>
                </div>
                <div className={`${PANEL} flex items-center gap-2`}>
                    <span className="size-3.5 rounded-full border-[1.5px] border-[#1c1c1c]/30" />
                    <span className="font-medium">Reply to Riya Sharma</span>
                    <span className={`ml-auto ${BADGE}`} style={tint("#dc2626")}>
                        High
                    </span>
                    <span className="text-[#1c1c1c]/50">Today</span>
                </div>
            </div>
        ),
    },
    {
        title: "She books a discovery call",
        body: "Calls and meetings sit on the lead's timeline and in everyone's schedule. A reminder pops up 10 minutes before.",
        visual: (
            <div className="flex flex-col gap-2">
                <div className={PANEL}>
                    <p className="flex items-center gap-1.5 font-medium">
                        <IconPhoneCall size={13} /> Discovery call with Riya Sharma
                    </p>
                    <p className="mt-1.5 text-[#1c1c1c]/55">Tue, 11:00 AM · 30 min · Priya, Rahul</p>
                </div>
                <div className={`${PANEL} flex items-center gap-2`}>
                    <span className="flex size-6 items-center justify-center rounded-full bg-[#fff4d5] text-[#ab6400]">
                        <IconClock size={13} />
                    </span>
                    <span className="font-medium">Call in 10 minutes</span>
                </div>
            </div>
        ),
    },
    {
        title: "The lead becomes a deal",
        body: "One click converts it. The deal stays linked to the lead and keeps its owner; you set the amount and how likely it is to close.",
        visual: (
            <div className={PANEL}>
                <p className="font-medium">Brightloom: Annual plan</p>
                <p className="mt-1 font-(family-name:--font-aleo) text-[22px] leading-none">₹4,80,000</p>
                <div className="mt-3 flex items-center gap-2">
                    <span className={BADGE} style={tint("#7c3aed")}>
                        Qualified
                    </span>
                    <span className="h-1 flex-1 rounded-full bg-[#1c1c1c]/8">
                        <span className="block h-full w-1/4 rounded-full bg-[#4a38f5]" />
                    </span>
                    <span className="text-[#1c1c1c]/50">25%</span>
                </div>
            </div>
        ),
    },
    {
        title: "Won, and the dashboard knows",
        body: "Drag it to Won and revenue, win rate and Priya's row in team performance update for everyone, live.",
        visual: (
            <div className={PANEL}>
                <p className="flex items-center justify-between text-[#1c1c1c]/55">
                    Revenue won
                    <span className={`${BADGE} flex items-center gap-0.5`} style={tint("#059669")}>
                        <IconTrendingUp size={11} /> 41%
                    </span>
                </p>
                <p className="mt-1 font-(family-name:--font-aleo) text-[22px] leading-none">₹52,30,000</p>
                <svg viewBox="0 0 200 40" className="mt-3 h-10 w-full" aria-hidden>
                    <polyline points="0,36 25,34 45,22 65,30 90,12 110,26 135,8 160,20 200,4" fill="none" stroke="#4a38f5" strokeWidth="2" strokeLinejoin="round" />
                </svg>
            </div>
        ),
    },
];

export function Journey() {
    const sectionRef = useRef<HTMLElement>(null);

    useGSAP(
        () => {
            // Desktop: the section holds still and the steps slide past sideways as you scroll.
            // Each card swings round to face you as it reaches the middle, like pages turning,
            // and the line underneath fills in step with the scroll.
            gsap.matchMedia().add("(min-width: 921px) and (prefers-reduced-motion: no-preference)", () => {
                const track = sectionRef.current!.querySelector<HTMLElement>("[data-track]")!;
                const distance = () => track.scrollWidth - window.innerWidth;
                const scroll = { trigger: sectionRef.current, start: "top 64px", end: () => `+=${distance()}`, scrub: 0.6, invalidateOnRefresh: true };

                const slide = gsap.to(track, { x: () => -distance(), ease: "none", scrollTrigger: { ...scroll, pin: true } });
                gsap.fromTo("[data-journey-line]", { scaleX: 0 }, { scaleX: 1, ease: "none", scrollTrigger: scroll });

                gsap.utils.toArray<HTMLElement>("[data-step]").forEach((step) => {
                    gsap.fromTo(
                        step,
                        { rotationY: -45, z: -240, opacity: 0.3 },
                        { rotationY: 0, z: 0, opacity: 1, ease: "none", scrollTrigger: { trigger: step, containerAnimation: slide, start: "left right", end: "center 60%", scrub: true } },
                    );
                    // the moment on the plate rises into place a little behind its card (tied to the
                    // scroll too, so the cards already on screen start out finished)
                    gsap.fromTo(
                        step.querySelector("[data-step-visual]"),
                        { y: 60, rotationX: 35, opacity: 0 },
                        { y: 0, rotationX: 0, opacity: 1, ease: "power2.out", scrollTrigger: { trigger: step, containerAnimation: slide, start: "left 90%", end: "left 45%", scrub: true } },
                    );
                });
            });
        },
        { scope: sectionRef },
    );

    return (
        <section ref={sectionRef} className="overflow-clip bg-white py-24 min-[921px]:flex min-[921px]:h-[calc(100svh-64px)] min-[921px]:flex-col min-[921px]:justify-center min-[921px]:py-0">
            <div className="mx-auto w-full max-w-378 px-4 min-[921px]:px-10">
                <Eyebrow>Start to finish.</Eyebrow>
                <Heading size="md" className="mt-5 max-w-190">
                    From a website enquiry <Accent>to revenue on the dashboard</Accent>
                </Heading>
            </div>

            <div className="relative mt-12 [perspective:1600px]">
                <div data-track className="flex flex-col gap-6 px-4 min-[921px]:w-max min-[921px]:flex-row min-[921px]:pr-[calc(40vw-200px)] min-[921px]:pl-10">
                    {STEPS.map((step, index) => (
                        <article key={step.title} data-step className="flex w-full flex-col rounded-3xl border border-[#1c1c1c]/8 bg-[#f6f6f6] p-6 transform-3d min-[921px]:w-100">
                            <div className="flex items-center gap-3">
                                <span className="size-2.5 rounded-full bg-[#4a38f5]" />
                                <span className="font-(family-name:--font-azeret-mono) text-[12px] font-medium text-[#1c1c1c]/50">
                                    STEP {String(index + 1).padStart(2, "0")}
                                </span>
                            </div>
                            {/* the moment itself, on a grey plate */}
                            <div className="mt-4 flex h-44 items-center rounded-2xl bg-[#ebebeb] bg-[radial-gradient(rgb(28_28_28/0.08)_1px,transparent_1px)] bg-size-[10px_10px] px-5">
                                <div data-step-visual className="w-full">
                                    {step.visual}
                                </div>
                            </div>
                            <h3 className="mt-5 text-[19px] leading-6 font-medium tracking-[-0.02em] text-[#1c1c1c]">{step.title}</h3>
                            <p className="mt-2 text-[15px] leading-[1.55] text-[#1c1c1c]/60">{step.body}</p>
                        </article>
                    ))}
                </div>

                {/* the line the steps travel along */}
                <div aria-hidden className="mx-auto mt-10 hidden h-px max-w-378 bg-[#1c1c1c]/10 min-[921px]:block min-[921px]:w-[calc(100%-80px)]">
                    <div data-journey-line className="h-full origin-left bg-[#4a38f5]" style={{ transform: "scaleX(0)" }} />
                </div>
            </div>
        </section>
    );
}
