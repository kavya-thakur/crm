"use client";

import { useRef, type ComponentType, type ReactNode } from "react";
import gsap from "gsap";
import { TextPlugin } from "gsap/TextPlugin";
import { useGSAP } from "@gsap/react";
import { IconAddressBook, IconCheck, IconCurrencyRupee, IconLayoutKanban, IconPhoneCall, IconSearch, IconTargetArrow, IconUsers } from "@tabler/icons-react";

import { Avatar } from "@/components/Avatar";
import { Accent, CONTAINER, Eyebrow, Heading } from "./Eyebrow";
import { DashArt, noise, type Sampler } from "./DashArt";

gsap.registerPlugin(TextPlugin);

type Icon = ComponentType<{ size?: number; className?: string }>;

const PANEL_WIDTH = 410;
const PANEL_HEIGHT = 505;

// Faint grey streaks across the dark panels, so they read as a surface, not a hole
const streaks: Sampler = (x, y) => (noise(Math.floor(x / 24), y) > 0.82 ? 0.95 : 0);

const FEATURES: { icon: Icon; title: string; body: string; picture: ReactNode }[] = [
    {
        icon: IconLayoutKanban,
        title: "A board your team already knows",
        body: "Leads, deals and tasks each get a Kanban board of your own stages. Drag a card along and your teammates see it move.",
        picture: <BoardPicture />,
    },
    {
        icon: IconUsers,
        title: "One live record for everyone",
        body: "When a teammate changes a lead, your screen updates on its own, with no refresh. A hand-off never loses context.",
        picture: <TeamPicture />,
    },
    {
        icon: IconSearch,
        title: "Find anything, two keys away",
        body: "Press ⌘K to search every lead, deal, contact, task and meeting, and jump straight to the one you need.",
        picture: <CommandPicture />,
    },
];

// The two shadows a dragged card moves between. GSAP can't blend from "none", so both are spelled out.
const LIFTED = "0px 16px 32px rgba(0, 0, 0, 0.28)";
const FLAT = "0px 0px 0px rgba(0, 0, 0, 0)";

export function FeaturesSection() {
    const sectionRef = useRef<HTMLElement>(null);

    useGSAP(
        () => {
            if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

            // each picture loops on its own, only while its card is on screen
            const loop = (trigger: string, repeatDelay = 0.8) =>
                gsap.timeline({ repeat: -1, repeatDelay, scrollTrigger: { trigger, toggleActions: "play pause resume pause" } });

            // 1. a deal is picked up, dropped on the next stage, then on Won, where it turns green
            const lift = { scale: 1.06, rotation: 2.5, boxShadow: LIFTED, duration: 0.25 };
            const drop = { scale: 1, rotation: 0, boxShadow: FLAT, duration: 0.25 };
            gsap.set("[data-moving-deal]", { boxShadow: FLAT });
            loop("[data-picture=board]")
                .from("[data-moving-deal]", { opacity: 0, y: -12, duration: 0.4 })
                .to("[data-moving-deal]", lift, "+=0.6")
                .to("[data-grab]", { opacity: 1, duration: 0.2 }, "<")
                .to("[data-moving-deal]", { xPercent: 100, x: 8, duration: 0.8, ease: "power2.inOut" })
                .to("[data-moving-deal]", drop)
                .to("[data-grab]", { opacity: 0, duration: 0.2 }, "<")
                .to("[data-moving-deal]", lift, "+=0.7")
                .to("[data-grab]", { opacity: 1, duration: 0.2 }, "<")
                .to("[data-moving-deal]", { xPercent: 200, x: 16, duration: 0.8, ease: "power2.inOut" })
                .to("[data-moving-deal]", { ...drop, borderColor: "#059669" })
                .to("[data-grab]", { opacity: 0, duration: 0.2 }, "<")
                .from("[data-won-tick]", { scale: 0, duration: 0.35, ease: "back.out(2)" }, "<")
                .to("[data-moving-deal]", { opacity: 0, y: 10, duration: 0.4 }, "+=1.4");

            // 2. teammates' cursors drift between rows; each row lights up in the colour
            //    of whoever is on it
            const rows = gsap.utils.toArray<HTMLElement>("[data-team-row]");
            gsap.utils.toArray<HTMLElement>("[data-team-cursor]").forEach((cursor, index) => {
                const color = cursor.dataset.color!;
                const walk = loop("[data-picture=team]", 0);
                TEAM[index].rows.forEach((row, step) => {
                    walk.to(cursor, { top: row * ROW + 16, left: cursorLeft(index, step), duration: 1.1, ease: "sine.inOut" }, step === 0 ? index * 0.6 : ">")
                        // a separate tween, so restarting the loop doesn't replay old highlights
                        .call(() => void gsap.fromTo(rows[row], { backgroundColor: `${color}55` }, { backgroundColor: `${color}00`, duration: 1.4 }));
                });
            });

            // 3. ⌘K: "acme" is typed, the highlight steps down to the Acme deal,
            //    it's pressed, and the deal opens
            loop("[data-picture=command]", 1)
                .set("[data-placeholder]", { opacity: 0 }, 0.4)
                .to("[data-typed]", { text: "acme", duration: 0.5, ease: "none" }, 0.4)
                .to("[data-highlight]", { y: 36, duration: 0.35, ease: "power2.out" }, "+=0.3")
                .to("[data-highlight]", { y: 72, duration: 0.35, ease: "power2.out" }, "+=0.35")
                .to("[data-highlight]", { scale: 0.96, duration: 0.1, yoyo: true, repeat: 1 }, "+=0.4")
                .fromTo("[data-toast]", { opacity: 0, y: 16, scale: 0.95 }, { opacity: 1, y: 0, scale: 1, duration: 0.4, ease: "back.out(1.8)" })
                .to("[data-toast]", { opacity: 0, y: 8, duration: 0.3 }, "+=1.6")
                .to("[data-typed]", { text: "", duration: 0.3, ease: "none" }, "<")
                .to("[data-highlight]", { y: 0, duration: 0.3 }, "<")
                .set("[data-placeholder]", { opacity: 1 });
        },
        { scope: sectionRef }
    );

    return (
        // sits above the quote section that follows, which slides out from underneath it
        <section ref={sectionRef} className="relative z-10 min-h-svh bg-white py-16">
            <div className={CONTAINER}>
                <div className="flex flex-col items-center text-center">
                    <Eyebrow>Skip the clunky software your team avoids.</Eyebrow>
                    <Heading className="mt-6 max-w-225">
                        Give your sales team a CRM <Accent>they&apos;ll actually use</Accent>
                    </Heading>
                </div>

                <div className="mt-20 grid gap-4 min-[921px]:grid-cols-3">
                    {FEATURES.map((feature) => (
                        <article key={feature.title} className="flex flex-col border border-[#1c1c1c]/10 bg-[#f8f8f8] p-4">
                            <div className="relative aspect-410/505 w-full overflow-hidden bg-[#1c1c1c]">
                                <DashArt
                                    width={PANEL_WIDTH}
                                    height={PANEL_HEIGHT}
                                    sample={streaks}
                                    rowGap={12}
                                    barHeight={3}
                                    cell={6}
                                    className="absolute inset-0 h-full w-full text-white/8"
                                />
                                {feature.picture}
                            </div>

                            <h3 className="mt-6 flex items-center gap-2.5 font-(family-name:--font-host-grotesk) text-[22px] leading-7 font-medium tracking-[-0.02em] text-[#1c1c1c]">
                                <span className="flex size-6 shrink-0 items-center justify-center rounded bg-[#4a38f5] text-white">
                                    <feature.icon size={15} />
                                </span>
                                {feature.title}
                            </h3>
                            <p className="mt-3 font-(family-name:--font-host-grotesk) text-[16px] leading-[1.55] text-[#1c1c1c]">{feature.body}</p>
                        </article>
                    ))}
                </div>
            </div>
        </section>
    );
}

// --- the three pictures: small Flash screens on frosted glass ---

const WINDOW =
    "absolute top-1/2 left-1/2 w-[88%] -translate-1/2 rounded-xl bg-white/92 p-3 font-(family-name:--font-host-grotesk) text-[11px] text-[#1c1c1c] shadow-[0_20px_60px_rgb(0_0_0/0.45)] ring-1 ring-white/50 backdrop-blur-md";

type Deal = { name: string; amount: string; owner: string };

function DealCard({ deal }: { deal: Deal }) {
    return (
        <span className="flex flex-col gap-1">
            <span className="truncate font-medium">{deal.name}</span>
            <span className="text-[#1c1c1c]/60">{deal.amount}</span>
            <span className="flex items-center gap-1 text-[#1c1c1c]/60">
                <Avatar name={deal.owner} /> {deal.owner}
            </span>
        </span>
    );
}

function BoardPicture() {
    const stages: { name: string; color: string; deals: Deal[] }[] = [
        {
            name: "New",
            color: "#64748b",
            deals: [
                { name: "Initech", amount: "₹75,000", owner: "Vihaan" },
                { name: "Umbrella Co", amount: "₹2,10,000", owner: "Aanya" },
            ],
        },
        { name: "Qualified", color: "#7c3aed", deals: [{ name: "Acme Industries", amount: "₹4,80,000", owner: "Olivia" }] },
        { name: "Won", color: "#059669", deals: [{ name: "Contoso Ltd", amount: "₹3,10,000", owner: "Ethan" }] },
    ];

    return (
        <div data-picture="board" aria-hidden className={WINDOW}>
            <div className="mb-3 flex items-center justify-between">
                <span>
                    <span className="font-semibold">Deals</span> <span className="text-[#1c1c1c]/50">· ₹11.9L open</span>
                </span>
                <span className="rounded-full bg-[#4a38f5] px-2 py-0.5 text-[10px] font-medium text-white">+ Deal</span>
            </div>

            <div className="relative grid grid-cols-3 gap-2">
                {stages.map((stage) => (
                    <div key={stage.name} className="flex min-w-0 flex-col gap-2">
                        <span className="flex items-center gap-1 font-medium">
                            <span className="size-1.5 rounded-full" style={{ backgroundColor: stage.color }} />
                            {stage.name}
                            <span className="text-[#1c1c1c]/40">{stage.deals.length}</span>
                        </span>
                        {/* the open spot where the moving deal lands */}
                        <span className="h-19 rounded-lg border border-dashed border-[#1c1c1c]/15" />
                        {stage.deals.map((deal) => (
                            <span key={deal.name} className="rounded-lg border border-[#ebebeb] bg-white p-2">
                                <DealCard deal={deal} />
                            </span>
                        ))}
                    </div>
                ))}

                <span data-moving-deal className="absolute top-6 left-0 h-19 w-[calc((100%-16px)/3)] rounded-lg border-[1.5px] border-[#4a38f5] bg-white p-2">
                    <DealCard deal={{ name: "Hooli Cloud", amount: "₹1,25,000", owner: "Vihaan" }} />
                    <span data-won-tick className="absolute -top-1.5 -right-1.5 flex size-4 items-center justify-center rounded-full bg-[#059669] text-white">
                        <IconCheck size={10} stroke={3} />
                    </span>
                    {/* the hand that drags it */}
                    <svg data-grab width="18" height="18" viewBox="0 0 22 22" className="absolute -right-2 -bottom-3 opacity-0">
                        <path d="M2 2 L20 9 L11 11 L9 20 Z" fill="#1c1c1c" stroke="#ffffff" strokeWidth="1.5" />
                    </svg>
                </span>
            </div>
        </div>
    );
}

const ROW = 36;

// Who's in the table, and the rows each of them visits, in order
const TEAM = [
    { name: "Olivia", color: "#f5c400", rows: [0, 3, 1] },
    { name: "Ethan", color: "#ff8a4c", rows: [2, 4, 0] },
    { name: "Aanya", color: "#d65cf0", rows: [4, 1, 3] },
];

const cursorLeft = (person: number, step: number) => `${[16, 48, 30][(person + step) % 3]}%`;

const LEADS = [
    { name: "Acme Industries", stage: "Qualified", color: "#7c3aed", owner: "Olivia" },
    { name: "Globex Corp", stage: "Proposal", color: "#ca8a04", owner: "Ethan" },
    { name: "Initech Systems", stage: "New", color: "#64748b", owner: "Vihaan" },
    { name: "Hooli Cloud", stage: "Qualified", color: "#7c3aed", owner: "Aanya" },
    { name: "Vandelay Imports", stage: "Contacted", color: "#0284c7", owner: "Olivia" },
];

function TeamPicture() {
    return (
        <div data-picture="team" aria-hidden className={WINDOW}>
            <div className="mb-2 flex items-center justify-between">
                <span>
                    <span className="font-semibold">Leads</span> <span className="text-[#1c1c1c]/50">· 128</span>
                </span>
                <span className="flex items-center gap-1.5 text-[10px] text-[#1c1c1c]/50">
                    <span className="flex -space-x-1.5">
                        {TEAM.map((person) => (
                            <span key={person.name} className="flex size-4.5 items-center justify-center rounded-full text-[9px] font-semibold ring-2 ring-white" style={{ backgroundColor: person.color }}>
                                {person.name[0]}
                            </span>
                        ))}
                    </span>
                    3 here now
                </span>
            </div>

            <div className="relative">
                {LEADS.map((lead) => (
                    <div key={lead.name} data-team-row className="flex items-center gap-2 rounded-md border-b border-[#f1f1f1] px-1.5" style={{ height: ROW }}>
                        <Avatar name={lead.name} />
                        <span className="min-w-0 flex-1 truncate font-medium">{lead.name}</span>
                        <span className="rounded-full px-1.5 py-0.5 text-[10px] font-medium" style={{ color: lead.color, backgroundColor: `${lead.color}1a` }}>
                            {lead.stage}
                        </span>
                        <Avatar name={lead.owner} />
                    </div>
                ))}

                {TEAM.map((person, index) => (
                    // each cursor starts where its loop ends, so the loop repeats without a jump
                    <span
                        key={person.name}
                        data-team-cursor
                        data-color={person.color}
                        className="absolute z-10 flex flex-col items-start"
                        style={{ top: person.rows[2] * ROW + 16, left: cursorLeft(index, 2) }}
                    >
                        <svg width="14" height="14" viewBox="0 0 22 22">
                            <path d="M2 2 L20 9 L11 11 L9 20 Z" fill={person.color} />
                        </svg>
                        <span className="-mt-0.5 ml-2.5 rounded-full px-1.5 py-px text-[9px] font-medium" style={{ backgroundColor: person.color }}>
                            {person.name}
                        </span>
                    </span>
                ))}
            </div>
        </div>
    );
}

function CommandPicture() {
    const items: { icon: Icon; label: string; keys: string }[] = [
        { icon: IconTargetArrow, label: "Acme Industries", keys: "Lead" },
        { icon: IconAddressBook, label: "Sophia Bennett · Acme", keys: "Contact" },
        { icon: IconCurrencyRupee, label: "Acme Industries · ₹4,80,000", keys: "Deal" },
        { icon: IconPhoneCall, label: "Demo call with Acme", keys: "Call" },
    ];

    return (
        <div data-picture="command" aria-hidden className={WINDOW}>
            <div className="relative flex h-8 items-center gap-2 border-b border-[#f1f1f1] pb-2">
                <IconSearch size={13} className="shrink-0 text-[#999999]" />
                <span data-placeholder className="absolute left-5 text-[#999999]">
                    Search leads, deals, contacts…
                </span>
                <span data-typed className="font-medium" />
                <span className="-ml-1.5 h-3.5 w-px animate-pulse bg-[#4a38f5]" />
                <span className="ml-auto rounded border border-[#ebebeb] px-1 text-[10px] text-[#999999]">⌘K</span>
            </div>

            <div className="relative mt-2">
                <span data-highlight className="absolute inset-x-0 top-0 h-9 rounded-lg bg-[#4a38f5]/10" />
                {items.map((item) => (
                    <div key={item.label} className="relative flex h-9 items-center gap-2 px-1.5">
                        <span className="flex size-6 shrink-0 items-center justify-center rounded-md border border-[#ebebeb] bg-white text-[#666666]">
                            <item.icon size={13} />
                        </span>
                        {item.label}
                        <span className="ml-auto rounded border border-[#ebebeb] px-1 text-[10px] text-[#999999]">{item.keys}</span>
                    </div>
                ))}
            </div>

            {/* the record opening once it's picked */}
            <div data-toast className="absolute -bottom-12 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-white px-3 py-1.5 whitespace-nowrap opacity-0 shadow-[0_8px_24px_rgb(0_0_0/0.3)]">
                <span className="flex size-4 items-center justify-center rounded-full bg-[#059669] text-white">
                    <IconCheck size={10} stroke={3} />
                </span>
                Opening deal · Acme Industries
            </div>
        </div>
    );
}
