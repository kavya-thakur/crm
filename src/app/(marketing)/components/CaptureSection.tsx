"use client";

import { useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { IconCheck } from "@tabler/icons-react";

import { Avatar } from "@/components/Avatar";
import { LogoMark } from "@/components/Logo";
import { Accent, CONTAINER, Eyebrow, Heading, Lead } from "./Eyebrow";

gsap.registerPlugin(ScrollTrigger);

// Websites with a Flash form on them
const SITES = [
    { domain: "brightloom.in", page: "Contact form", tile: "bg-[#edf2fe] text-[#3a5bc7]" },
    { domain: "kitepay.com", page: "Pricing page", tile: "bg-[#e6f6eb] text-[#218358]" },
    { domain: "northwind.co", page: "Book a demo", tile: "bg-[#fff4d5] text-[#ab6400]" },
];

type Lead = { name: string; site: number; owner: string };

// One arrives per loop, from each site in turn, and goes to the next teammate in the rotation
const ARRIVALS: Lead[] = [
    { name: "Riya Sharma", site: 0, owner: "Priya" },
    { name: "Sara Khan", site: 1, owner: "Rahul" },
    { name: "Arjun Mehta", site: 2, owner: "Meera" },
    { name: "Ishaan Roy", site: 0, owner: "Priya" },
    { name: "Tara Menon", site: 1, owner: "Rahul" },
    { name: "Kabir Das", site: 2, owner: "Meera" },
];

// Already in the list, newest first
const START: Lead[] = [
    { name: "Vikram Rao", site: 2, owner: "Meera" },
    { name: "Neha Gupta", site: 1, owner: "Rahul" },
    { name: "Ananya Iyer", site: 0, owner: "Priya" },
];

const FACTS = ["Works on any website, no plugin", "Spam-trapped and rate-limited", "Shared out in turn across your team"];

const SLOT = 64; // a row is 56px tall, plus an 8px gap
const SLOTS = 3;

function Row({ lead, fresh = false }: { lead: Lead; fresh?: boolean }) {
    const site = SITES[lead.site];
    return (
        <>
            {fresh && <span data-glow className="pointer-events-none absolute inset-0 rounded-xl bg-[#4a38f5]/8 opacity-0" />}
            <span data-text="avatar" className="relative">
                <Avatar name={lead.name} size="md" />
            </span>
            <span className="relative min-w-0 flex-1">
                <span data-text="name" className="block truncate text-[14px] font-medium">
                    {lead.name}
                </span>
                <span data-text="from" className="block truncate font-(family-name:--font-azeret-mono) text-[11px] text-[#1c1c1c]/45">
                    {site.domain} · {site.page}
                </span>
            </span>
            <span className="relative shrink-0 text-[12px] text-[#1c1c1c]/50">
                → <span data-text="owner" className="font-medium text-[#1c1c1c]/75">{lead.owner}</span>
            </span>
        </>
    );
}

// Where an element sits inside the stage, ignoring any transform it has mid-animation
function box(el: HTMLElement, stage: HTMLElement) {
    let x = 0;
    let y = 0;
    for (let node: HTMLElement | null = el; node && node !== stage; node = node.offsetParent as HTMLElement | null) {
        x += node.offsetLeft;
        y += node.offsetTop;
    }
    return { x, y, w: el.offsetWidth, h: el.offsetHeight };
}

export function CaptureSection() {
    const sectionRef = useRef<HTMLElement>(null);

    useGSAP(
        () => {
            const q = gsap.utils.selector(sectionRef);
            const stage = q("[data-stage]")[0] as HTMLElement;
            const sites = q("[data-site]");
            const inbox = q("[data-inbox]")[0];
            const paths = Array.from(sectionRef.current!.querySelectorAll<SVGPathElement>("[data-path]"));

            // a soft curve from each site into the Flash list: across on desktop, down on phones
            const draw = () => {
                const to = box(inbox, stage);
                sites.forEach((site, index) => {
                    const from = box(site, stage);
                    const across = to.x > from.x + from.w;
                    const start = across ? { x: from.x + from.w, y: from.y + from.h / 2 } : { x: from.x + from.w / 2, y: from.y + from.h };
                    const end = across ? { x: to.x, y: to.y + 84 + index * 14 } : { x: to.x + to.w / 2 + (index - 1) * 24, y: to.y };
                    const bend = across ? { x: (end.x - start.x) * 0.55, y: 0 } : { x: 0, y: (end.y - start.y) * 0.55 };
                    paths[index].setAttribute("d", `M${start.x},${start.y} C${start.x + bend.x},${start.y + bend.y} ${end.x - bend.x},${end.y - bend.y} ${end.x},${end.y}`);
                });
            };
            draw();
            const resizer = new ResizeObserver(draw);
            resizer.observe(stage);

            if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return () => resizer.disconnect();

            const rows = q("[data-row=slot]");
            const incoming = q("[data-row=incoming]")[0];
            const dot = q("[data-dot]")[0];

            // what the list shows, carried from one loop to the next
            let list = [...START];
            let turn = 0;
            const arrival = () => ARRIVALS[turn % ARRIVALS.length];
            const fill = (row: HTMLElement, lead: Lead) => {
                const site = SITES[lead.site];
                row.querySelector("[data-text=name]")!.textContent = lead.name;
                row.querySelector("[data-text=from]")!.textContent = `${site.domain} · ${site.page}`;
                row.querySelector("[data-text=owner]")!.textContent = lead.owner;
                row.querySelector("[data-text=avatar] span")!.textContent = lead.name[0];
            };

            const flight = { along: 0 };
            const tl = gsap.timeline({
                repeat: -1,
                scrollTrigger: { trigger: stage, start: "top 80%", end: "bottom top", toggleActions: "play pause resume pause" },
            });

            // someone sends a form on one of the sites; it travels along that site's line
            tl.call(() => {
                fill(incoming, arrival());
                sites.forEach((site, index) => site.toggleAttribute("data-active", index === arrival().site));
            })
                .set(dot, { opacity: 1 }, "+=0.4")
                .fromTo(
                    flight,
                    { along: 0 },
                    {
                        along: 1,
                        duration: 1.2,
                        ease: "power1.inOut",
                        onUpdate: () => {
                            const path = paths[arrival().site];
                            const point = path.getPointAtLength(flight.along * path.getTotalLength());
                            gsap.set(dot, { x: point.x, y: point.y });
                        },
                    },
                )
                .to(dot, { opacity: 0, duration: 0.2 });

            // it settles in at the top of the list and the rest make room
            const landed = tl.duration();
            rows.forEach((row, slot) => {
                tl.fromTo(row, { y: slot * SLOT, opacity: 1 }, { y: (slot + 1) * SLOT, opacity: slot + 1 < SLOTS ? 1 : 0, duration: 0.6, ease: "power3.inOut" }, landed);
            });
            tl.fromTo(incoming, { y: -10, opacity: 0 }, { y: 0, opacity: 1, duration: 0.6, ease: "power3.out" }, landed + 0.1)
                .fromTo(incoming.querySelector("[data-glow]"), { opacity: 1 }, { opacity: 0, duration: 1.6, ease: "power1.in" }, "<")
                .call(() => sites.forEach((site) => site.removeAttribute("data-active")), [], "+=0.6")
                // write the new order into the resting rows, so the next loop starts from
                // exactly what's on screen, then move on to the next arrival
                .call(
                    () => {
                        list = [arrival(), ...list].slice(0, SLOTS);
                        rows.forEach((row, slot) => fill(row, list[slot]));
                        turn += 1;
                    },
                    [],
                    "+=1.2",
                );

            return () => resizer.disconnect();
        },
        { scope: sectionRef },
    );

    return (
        <section ref={sectionRef} data-reveal className="bg-white py-24 font-(family-name:--font-host-grotesk) text-[#1c1c1c] min-[921px]:py-30">
            <div className={CONTAINER}>
                <div className="flex flex-col items-center text-center">
                    <Eyebrow>Capture leads, automatically.</Eyebrow>
                    <Heading className="mt-6 max-w-210">
                        Your website form, <Accent>wired straight into Flash</Accent>
                    </Heading>
                    <Lead className="mt-6 max-w-130">Paste one snippet on any page. Every enquiry lands in Flash with the right person and a task to reply today.</Lead>
                </div>

                <div data-stage aria-hidden className="relative mx-auto mt-16 max-w-280 rounded-3xl bg-[#f4f4f4] px-4 py-10 min-[921px]:px-20 min-[921px]:py-20">
                    <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
                        {SITES.map((site) => (
                            <path key={site.domain} data-path fill="none" stroke="rgb(28 28 28 / 0.18)" strokeWidth="1" strokeDasharray="3 5" />
                        ))}
                    </svg>

                    <div className="relative grid items-center gap-14 min-[921px]:grid-cols-[240px_minmax(0,1fr)] min-[921px]:gap-36">
                        {/* the websites */}
                        <div className="grid grid-cols-3 gap-2 min-[921px]:grid-cols-1 min-[921px]:gap-5">
                            {SITES.map((site) => (
                                <div
                                    key={site.domain}
                                    data-site
                                    className="relative flex items-center gap-3 rounded-2xl border border-[#1c1c1c]/8 bg-white p-2.5 shadow-[0_1px_2px_rgb(0_0_0/0.04)] min-[921px]:px-4 min-[921px]:py-3.5 [&[data-active]>[data-ring]]:opacity-100"
                                >
                                    <span data-ring className="pointer-events-none absolute -inset-px rounded-2xl border border-[#4a38f5] opacity-0 shadow-[0_0_0_4px_rgb(74_56_245/0.08)] transition-opacity duration-500" />
                                    <span className={`hidden size-8 shrink-0 items-center justify-center rounded-lg text-[13px] font-semibold min-[921px]:flex ${site.tile}`}>{site.domain[0].toUpperCase()}</span>
                                    <span className="min-w-0">
                                        <span className="block truncate font-(family-name:--font-azeret-mono) text-[11px] font-medium min-[921px]:text-[12px]">{site.domain}</span>
                                        <span className="block truncate text-[12px] text-[#1c1c1c]/50">{site.page}</span>
                                    </span>
                                </div>
                            ))}
                        </div>

                        {/* Flash */}
                        <div data-inbox className="rounded-2xl border border-[#1c1c1c]/8 bg-white shadow-[0_24px_60px_rgb(28_28_28/0.08)]">
                            <div className="flex h-13 items-center gap-2 border-b border-[#1c1c1c]/6 px-5 text-[14px]">
                                <LogoMark size={20} />
                                <span className="font-medium">New leads</span>
                                <span className="text-[#1c1c1c]/40">from your website</span>
                                <span className="ml-auto flex items-center gap-1.5 text-[12px] text-[#1c1c1c]/50">
                                    <span className="size-1.5 animate-pulse rounded-full bg-[#30a46c]" />
                                    Live
                                </span>
                            </div>
                            <div className="p-3">
                                <div className="relative overflow-hidden" style={{ height: SLOTS * SLOT - 8 }}>
                                    <div data-row="incoming" className="absolute inset-x-0 top-0 flex h-14 items-center gap-3 rounded-xl px-3 opacity-0">
                                        <Row lead={START[0]} fresh />
                                    </div>
                                    {START.map((lead, index) => (
                                        <div
                                            key={lead.name}
                                            data-row="slot"
                                            className="absolute inset-x-0 top-0 flex h-14 items-center gap-3 rounded-xl px-3"
                                            style={{ transform: `translateY(${index * SLOT}px)` }}
                                        >
                                            <Row lead={lead} />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* a form submission on its way in */}
                    <span data-dot className="pointer-events-none absolute top-0 left-0 size-2 -translate-1/2 rounded-full bg-[#4a38f5] opacity-0 shadow-[0_0_0_4px_rgb(74_56_245/0.15)]" />
                </div>

                <ul className="mt-8 flex flex-wrap justify-center gap-x-8 gap-y-3 text-[14px] text-[#1c1c1c]/60">
                    {FACTS.map((fact) => (
                        <li key={fact} className="flex items-center gap-2">
                            <IconCheck size={15} stroke={2.5} className="text-[#4a38f5]" />
                            {fact}
                        </li>
                    ))}
                </ul>
            </div>
        </section>
    );
}
