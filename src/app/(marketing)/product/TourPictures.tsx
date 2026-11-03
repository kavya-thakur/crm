"use client";

import gsap from "gsap";
import { Flip } from "gsap/Flip";
import { TextPlugin } from "gsap/TextPlugin";
import {
    IconAlertTriangle,
    IconBell,
    IconCheck,
    IconClock,
    IconLayoutKanban,
    IconLayoutList,
    IconPhoneCall,
} from "@tabler/icons-react";

import { Avatar } from "@/components/Avatar";

gsap.registerPlugin(Flip, TextPlugin);

// The product page's four moving pictures: small Flash screens on the dark stage, each
// acting out one feature with the app's real wording. `buildLoops` makes one paused
// timeline per picture; the page plays whichever chapter you're reading.

const WINDOW =
    "rounded-2xl bg-white/95 p-4 font-(family-name:--font-host-grotesk) text-[13px] text-[#1c1c1c] shadow-[0_30px_80px_rgb(0_0_0/0.5)] ring-1 ring-white/50 backdrop-blur-md";
const BADGE = "rounded-full px-1.5 py-0.5 text-[11px] font-medium";
const tint = (color: string) => ({ color, backgroundColor: `${color}1a` });

// --- 1. Leads: the same six leads morph between a list and a Kanban board ---

const STAGES = [
    { name: "New", color: "#64748b" },
    { name: "Meeting", color: "#0284c7" },
    { name: "Proposal", color: "#ca8a04" },
];

const LEADS = [
    { name: "Riya Sharma", company: "Brightloom", stage: 0, owner: "Priya" },
    { name: "Kabir Mehta", company: "Kitepay", stage: 1, owner: "Rahul" },
    { name: "Isha Nair", company: "Northwind", stage: 0, owner: "Meera" },
    { name: "Arjun Rao", company: "Lotus Hotels", stage: 2, owner: "Priya" },
    { name: "Tara Iyer", company: "Fintrail", stage: 1, owner: "Arjun" },
    { name: "Nikhil Das", company: "Vertex", stage: 2, owner: "Rahul" },
];

// on the board each lead sits in its stage's column (spelled out so Tailwind sees the classes)
const COLUMN = ["group-data-[mode=board]/leads:col-start-1", "group-data-[mode=board]/leads:col-start-2", "group-data-[mode=board]/leads:col-start-3"];

export function LeadsPicture() {
    return (
        <div data-pic="leads" className={WINDOW}>
            <div className="flex items-center justify-between">
                <span>
                    <span className="font-semibold">Leads</span> <span className="text-[#1c1c1c]/45">420</span>
                </span>
                <span className="relative flex h-7 w-24 items-center rounded-lg border border-[#ebebeb] px-2 text-[12px] font-medium">
                    <span data-view="list" className="absolute flex items-center gap-1.5">
                        <IconLayoutList size={14} /> List
                    </span>
                    <span data-view="board" className="absolute flex items-center gap-1.5 opacity-0">
                        <IconLayoutKanban size={14} /> Kanban
                    </span>
                </span>
            </div>

            {/* column headings for each view, swapped by fading */}
            <div className="relative mt-3 h-6 text-[11px] text-[#1c1c1c]/45">
                <div data-view="list" className="absolute inset-0 grid grid-cols-[1fr_auto_auto] items-center gap-6 border-b border-[#f1f1f1] px-2">
                    <span>Name</span>
                    <span>Stage</span>
                    <span>Owner</span>
                </div>
                <div data-view="board" className="absolute inset-0 grid grid-cols-3 gap-2 opacity-0">
                    {STAGES.map((stage) => (
                        <span key={stage.name} className="flex items-center gap-1.5 px-1 font-medium text-[#1c1c1c]">
                            <span className="size-1.5 rounded-full" style={{ backgroundColor: stage.color }} />
                            {stage.name}
                            <span className="text-[#1c1c1c]/40">2</span>
                        </span>
                    ))}
                </div>
            </div>

            <div className="relative mt-1.5">
                {/* the board's column backgrounds */}
                <div data-view="board" className="absolute inset-0 grid grid-cols-3 gap-2 opacity-0">
                    {STAGES.map((stage) => (
                        <span key={stage.name} className="-mx-0.5 rounded-lg bg-[#f4f4f4]" />
                    ))}
                </div>

                <div data-leads data-mode="list" className="group/leads relative grid grid-flow-dense grid-cols-3 gap-x-2 gap-y-1 data-[mode=board]:gap-y-2 data-[mode=board]:p-1">
                    {LEADS.map((lead) => (
                        <div
                            key={lead.name}
                            data-lead
                            className={`col-span-3 flex h-9 items-center gap-2 rounded-lg border border-transparent bg-white px-2 group-data-[mode=board]/leads:col-span-1 group-data-[mode=board]/leads:h-15 group-data-[mode=board]/leads:border-[#ebebeb] ${COLUMN[lead.stage]}`}
                        >
                            <span data-lead-body className="flex min-w-0 flex-1 items-center gap-2 group-data-[mode=board]/leads:flex-col group-data-[mode=board]/leads:items-start group-data-[mode=board]/leads:gap-1">
                                <span className="flex min-w-0 items-center gap-2">
                                    <Avatar name={lead.name} />
                                    <span className="truncate font-medium">{lead.name}</span>
                                </span>
                                <span className="truncate text-[#1c1c1c]/45 group-data-[mode=board]/leads:text-[11px]">{lead.company}</span>
                                <span className="ml-auto flex items-center gap-2 group-data-[mode=board]/leads:hidden">
                                    <span className={BADGE} style={tint(STAGES[lead.stage].color)}>
                                        {STAGES[lead.stage].name}
                                    </span>
                                    <Avatar name={lead.owner} />
                                </span>
                            </span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

// --- 2. Duplicates: typing in someone who's already a lead brings up the warning ---

export function DuplicatePicture() {
    const field = "mt-1 flex h-9 items-center rounded-lg border border-[#e5e5e5] bg-[#fafafa] px-3";

    return (
        <div data-pic="duplicates" className={WINDOW}>
            <p className="text-[15px] font-semibold">New lead</p>

            <label className="mt-4 block text-[12px] text-[#1c1c1c]/55">
                Name
                <span className={field}>
                    <span data-dup-name className="text-[13px] text-[#1c1c1c]" />
                    <span data-dup-caret="name" className="ml-px h-4 w-px bg-[#4a38f5]" />
                </span>
            </label>
            <label className="mt-3 block text-[12px] text-[#1c1c1c]/55">
                Phone
                <span className={`${field} relative`}>
                    <span data-dup-phone className="text-[13px] text-[#1c1c1c] tabular-nums" />
                    <span data-dup-caret="phone" className="ml-px h-4 w-px bg-[#4a38f5] opacity-0" />
                    {/* the amber ring once the number matches */}
                    <span data-dup-ring className="absolute -inset-px rounded-lg border-[1.5px] border-[#f5b041] opacity-0" />
                </span>
            </label>

            {/* the real warning, word for word */}
            <div data-dup-warning role="presentation" className="mt-3 flex items-start gap-2 rounded-lg border border-[#f5d090] bg-[#fff8eb] p-3 text-[12px] leading-snug text-[#8a5a00] opacity-0">
                <IconAlertTriangle size={15} className="mt-px shrink-0" />
                <p className="min-w-0 flex-1">
                    <span className="font-medium">Riya Sharma</span> is already an open lead with the same phone, owned by Priya. Work on that one instead of adding a
                    second.
                    <span className="mt-1.5 block font-medium text-[#4a38f5]">Open Riya Sharma →</span>
                </p>
            </div>

            <div className="mt-4 flex justify-end gap-2 text-[12px] font-medium">
                <span className="rounded-lg border border-[#ebebeb] px-3 py-1.5">Cancel</span>
                <span data-dup-save className="rounded-lg bg-[#4a38f5] px-3 py-1.5 text-white">
                    Add lead
                </span>
            </div>
        </div>
    );
}

// --- 3. Deals: one deal is won (with a burst), another is lost and gets its reason ---

const DEAL_STAGES = [
    { name: "Qualified", color: "#7c3aed", total: "₹6.2L" },
    { name: "Proposal", color: "#ca8a04", total: "₹4.8L" },
    { name: "Won", color: "#059669", total: "" },
    { name: "Lost", color: "#dc2626", total: "₹1.1L" },
];

const REASONS = ["Price too high", "Chose a competitor", "No budget", "Bad timing"];
const BURST = Array.from({ length: 14 }, (_, index) => index);
// a moving card sits in a column's empty slot: 6px in from the column edge, below its heading
const DEAL_CARD = "absolute top-[34px] left-1.5 h-16 w-[calc((100%-24px)/4-12px)] rounded-lg border bg-white p-2";

export function DealsPicture() {
    return (
        <div data-pic="deals" className={WINDOW}>
            <div className="mb-3 flex items-center justify-between">
                <span>
                    <span className="font-semibold">Deals</span> <span className="text-[#1c1c1c]/45">300</span>
                </span>
                <span className="text-[11px] text-[#1c1c1c]/45">Drag a card to move it</span>
            </div>

            <div className="relative grid grid-cols-4 gap-2 text-[11px]">
                {DEAL_STAGES.map((stage) => (
                    <div key={stage.name} className="flex min-w-0 flex-col gap-2 rounded-lg bg-[#f6f6f6] p-1.5 pb-3">
                        <span className="flex items-center gap-1 font-medium">
                            <span className={BADGE} style={tint(stage.color)}>
                                {stage.name}
                            </span>
                            <span className="ml-auto text-[#1c1c1c]/45 tabular-nums" data-total={stage.name}>
                                {stage.name === "Won" ? "₹3.1L" : stage.total}
                            </span>
                        </span>
                        <span className="h-16" />
                        <span className="rounded-lg border border-[#ebebeb] bg-white p-2">
                            <span className="block truncate font-medium">{["Initech", "Umbrella Co", "Contoso Ltd", "Wayne Supplies"][DEAL_STAGES.indexOf(stage)]}</span>
                            <span className="text-[#1c1c1c]/50">{["₹2,10,000", "₹95,000", "₹3,10,000", "₹1,10,000"][DEAL_STAGES.indexOf(stage)]}</span>
                        </span>
                    </div>
                ))}

                {/* the deal that's won, starting in Qualified */}
                <span data-deal="won" className={`${DEAL_CARD} border-[#4a38f5] shadow-[0_10px_24px_rgb(0_0_0/0.18)]`}>
                    <span className="block truncate font-medium">Hooli Cloud</span>
                    <span className="text-[#1c1c1c]/50">₹1,25,000</span>
                    <span className="absolute top-1/2 left-1/2">
                        {BURST.map((index) => (
                            <span key={index} data-burst className="absolute size-1.5 rounded-full opacity-0" style={{ backgroundColor: ["#4a38f5", "#059669", "#f5c400", "#ed87fc"][index % 4] }} />
                        ))}
                    </span>
                </span>

                {/* the deal that's lost, starting in Proposal */}
                <span data-deal="lost" className={`${DEAL_CARD} border-[#4a38f5] opacity-0 shadow-[0_10px_24px_rgb(0_0_0/0.18)]`}>
                    <span className="block truncate font-medium">Globex Corp</span>
                    <span className="text-[#1c1c1c]/50">₹2,40,000</span>
                    <span data-lost-chip className="mt-0.5 block truncate text-[10px] font-medium text-[#dc2626] opacity-0">
                        Chose a competitor
                    </span>
                </span>

                {/* the lost reason picker */}
                <div data-reasons className="absolute top-26 right-0 w-44 rounded-xl border border-[#ebebeb] bg-white p-1.5 text-[12px] opacity-0 shadow-[0_16px_40px_rgb(0_0_0/0.2)]">
                    <p className="px-2 py-1 text-[11px] text-[#1c1c1c]/45">Why was it lost?</p>
                    <div className="relative">
                        <span data-reason-highlight className="absolute inset-x-0 top-0 h-7 rounded-md bg-[#4a38f5]/10" />
                        {REASONS.map((reason) => (
                            <p key={reason} className="relative flex h-7 items-center px-2">
                                {reason}
                            </p>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}

// --- 4. Follow-ups: an @mention lights up a teammate's bell, then a reminder arrives ---

export function FollowUpsPicture() {
    return (
        <div data-pic="follow" className="flex w-full flex-col gap-3">
            <div className={WINDOW}>
                <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2">
                        <Avatar name="Acme Industries" size="md" />
                        <span>
                            <span className="block font-semibold">Acme Industries</span>
                            <span className="block text-[11px] text-[#1c1c1c]/45">Lead · Meeting</span>
                        </span>
                    </span>
                    {/* Priya's bell */}
                    <span data-bell className="relative flex size-8 items-center justify-center rounded-full border border-[#ebebeb]">
                        <IconBell size={16} />
                        <span data-bell-dot className="absolute -top-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full bg-[#4a38f5] text-[9px] font-semibold text-white opacity-0">
                            1
                        </span>
                    </span>
                </div>

                {/* the note that gets posted */}
                <div data-note className="mt-4 flex gap-2 opacity-0">
                    <Avatar name="Ananya" />
                    <p className="rounded-xl rounded-tl-sm bg-[#f4f4f4] px-3 py-2 leading-snug">
                        Can you join Thursday&apos;s demo? <span className="rounded bg-[#4a38f5]/10 px-1 font-medium text-[#4a38f5]">@Priya Sharma</span>
                    </p>
                </div>

                {/* the composer, where it's typed */}
                <div className="relative mt-4 flex h-10 items-center rounded-xl border border-[#e5e5e5] px-3">
                    <span data-compose className="whitespace-nowrap" />
                    <span data-compose-pill className="ml-1 rounded bg-[#4a38f5]/10 px-1 font-medium text-[#4a38f5] opacity-0">
                        @Priya Sharma
                    </span>
                    <span data-compose-at className="font-medium text-[#4a38f5]" />
                    <span className="ml-px h-4 w-px bg-[#4a38f5]" />

                    {/* who to mention */}
                    <div data-mention-menu className="absolute bottom-11 left-36 w-44 rounded-xl border border-[#ebebeb] bg-white p-1 text-[12px] opacity-0 shadow-[0_16px_40px_rgb(0_0_0/0.2)]">
                        <p className="flex h-8 items-center gap-2 rounded-md bg-[#4a38f5]/10 px-2">
                            <Avatar name="Priya Sharma" /> Priya Sharma
                        </p>
                        <p className="flex h-8 items-center gap-2 px-2">
                            <Avatar name="Prakash Jain" /> Prakash Jain
                        </p>
                    </div>
                </div>
            </div>

            {/* what Priya sees: the notification, then the reminder */}
            <div data-notice className="flex items-center gap-3 rounded-2xl bg-white/95 p-3 font-(family-name:--font-host-grotesk) text-[13px] opacity-0 shadow-[0_20px_50px_rgb(0_0_0/0.45)]">
                <Avatar name="Ananya" size="md" />
                <span className="min-w-0">
                    <span className="block font-medium">Ananya mentioned you on Acme Industries</span>
                    <span className="block truncate text-[12px] text-[#1c1c1c]/55">Can you join Thursday&apos;s demo?</span>
                </span>
                <span className="ml-auto text-[11px] text-[#1c1c1c]/40">now</span>
            </div>
            <div data-reminder className="flex items-center gap-3 rounded-2xl bg-white/95 p-3 font-(family-name:--font-host-grotesk) text-[13px] opacity-0 shadow-[0_20px_50px_rgb(0_0_0/0.45)]">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[#fff4d5] text-[#ab6400]">
                    <IconClock size={16} />
                </span>
                <span className="min-w-0">
                    <span className="block font-medium">Call in 10 minutes</span>
                    <span className="flex items-center gap-1 truncate text-[12px] text-[#1c1c1c]/55">
                        <IconPhoneCall size={12} /> Discovery call with Fintrail Capital
                    </span>
                </span>
                <span className="ml-auto flex size-5 items-center justify-center rounded-full bg-[#059669] text-white">
                    <IconCheck size={12} stroke={3} />
                </span>
            </div>
        </div>
    );
}

// --- the loops ---

export function buildLoops(scope: HTMLElement) {
    const q = gsap.utils.selector(scope);
    const loop = (repeatDelay = 1) => gsap.timeline({ paused: true, repeat: -1, repeatDelay });

    // 1. list → Kanban → list. Flip records where every lead is, the layout changes, and the
    //    leads glide from the old spots to the new ones; their text fades back in on arrival.
    const grid = q("[data-leads]")[0] as HTMLElement;
    const switchView = (mode: "list" | "board") => () => {
        const state = Flip.getState(q("[data-lead]"));
        grid.dataset.mode = mode;
        gsap.to(q(`[data-view=${mode}]`), { opacity: 1, duration: 0.4 });
        gsap.to(q(`[data-view=${mode === "list" ? "board" : "list"}]`), { opacity: 0, duration: 0.3 });
        gsap.set(q("[data-lead-body]"), { opacity: 0 });
        Flip.from(state, {
            duration: 0.9,
            ease: "power3.inOut",
            stagger: 0.04,
            onComplete: () => void gsap.to(q("[data-lead-body]"), { opacity: 1, duration: 0.3, stagger: 0.03 }),
        });
    };
    const leads = loop(0).call(switchView("board"), [], 1.4).call(switchView("list"), [], 4.6).to({}, { duration: 3.2 }, 4.6);

    // 2. the name and number are typed; the number matches, so the warning slides in with a
    //    shake and "Add lead" goes quiet
    const duplicates = loop(1.4)
        .set(q("[data-dup-name], [data-dup-phone]"), { text: "" })
        .set(q("[data-dup-caret=name]"), { opacity: 1 })
        .set(q("[data-dup-caret=phone]"), { opacity: 0 })
        .to(q("[data-dup-name]"), { text: "Riya Sharma", duration: 0.8, ease: "none" }, 0.5)
        .set(q("[data-dup-caret=name]"), { opacity: 0 })
        .set(q("[data-dup-caret=phone]"), { opacity: 1 })
        .to(q("[data-dup-phone]"), { text: "98765 43210", duration: 0.9, ease: "none" }, "+=0.3")
        .to(q("[data-dup-ring]"), { opacity: 1, duration: 0.2 }, "+=0.3")
        .fromTo(q("[data-dup-warning]"), { opacity: 0, y: -8, scale: 0.97 }, { opacity: 1, y: 0, scale: 1, duration: 0.45, ease: "back.out(2)" }, "<")
        .to(q("[data-dup-warning]"), { x: 5, duration: 0.06, repeat: 5, yoyo: true, ease: "sine.inOut" })
        .to(q("[data-dup-save]"), { opacity: 0.35, duration: 0.3 }, "<")
        .to(q("[data-dup-warning], [data-dup-ring]"), { opacity: 0, duration: 0.4 }, "+=2.6")
        .to(q("[data-dup-save]"), { opacity: 1, duration: 0.3 }, "<");

    // 3. Hooli Cloud is dragged Qualified → Proposal → Won: the Won total climbs and the card
    //    bursts. Then Globex Corp is dragged to Lost and gets its reason.
    const lift = { scale: 1.06, rotation: 2.5, duration: 0.2 };
    const drop = { scale: 1, rotation: 0, duration: 0.2 };
    // one column over = the card's width + its 12px of column padding + the 8px gap
    const step = (column: number) => ({ xPercent: 100 * column, x: 20 * column, duration: 0.7, ease: "power2.inOut" });
    const wonTotal = { value: 3.1 };
    const burst = q("[data-burst]");
    const deals = loop(1)
        .set(q("[data-deal=won]"), { xPercent: 0, x: 0, opacity: 1 })
        .set(q("[data-deal=lost]"), { xPercent: 100, x: 20, opacity: 0 })
        .set(q("[data-lost-chip], [data-reasons]"), { opacity: 0 })
        .set(q("[data-reason-highlight]"), { y: 0 })
        .call(() => {
            wonTotal.value = 3.1;
            q("[data-total=Won]")[0].textContent = "₹3.1L";
        })
        .to(q("[data-deal=won]"), lift, 0.6)
        .to(q("[data-deal=won]"), step(1))
        .to(q("[data-deal=won]"), drop)
        .to(q("[data-deal=won]"), lift, "+=0.4")
        .to(q("[data-deal=won]"), step(2))
        .to(q("[data-deal=won]"), drop)
        .to(wonTotal, {
            value: 4.35,
            duration: 0.8,
            ease: "power2.out",
            onUpdate: () => void (q("[data-total=Won]")[0].textContent = `₹${wonTotal.value.toFixed(2)}L`),
        }, "<")
        .fromTo(
            burst,
            { opacity: 1, x: 0, y: 0, scale: 1 },
            {
                opacity: 0,
                x: (index) => Math.cos((index / burst.length) * Math.PI * 2) * gsap.utils.random(40, 70),
                y: (index) => Math.sin((index / burst.length) * Math.PI * 2) * gsap.utils.random(30, 55),
                scale: 0.4,
                duration: 0.9,
                ease: "power3.out",
                // without this the dots would show from the moment the loop is built
                immediateRender: false,
            },
            "<",
        )
        .to(q("[data-deal=lost]"), { opacity: 1, duration: 0.3 }, "+=0.6")
        .to(q("[data-deal=lost]"), lift, "+=0.3")
        .to(q("[data-deal=lost]"), step(3))
        .to(q("[data-deal=lost]"), drop)
        .fromTo(q("[data-reasons]"), { opacity: 0, y: -6, scale: 0.96 }, { opacity: 1, y: 0, scale: 1, duration: 0.3, ease: "back.out(2)" })
        .to(q("[data-reason-highlight]"), { y: 28, duration: 0.3, ease: "power2.out" }, "+=0.5")
        .to(q("[data-reason-highlight]"), { scale: 0.95, duration: 0.1, yoyo: true, repeat: 1 }, "+=0.4")
        .to(q("[data-reasons]"), { opacity: 0, y: -4, duration: 0.25 })
        .to(q("[data-lost-chip]"), { opacity: 1, duration: 0.3 })
        .to(q("[data-deal]"), { opacity: 0, duration: 0.4 }, "+=1.8");

    // 4. a note is typed, "@Pri" brings up the menu, Priya is picked; the note posts, her bell
    //    rings, and the notification and a reminder arrive
    const follow = loop(1.2)
        .set(q("[data-compose], [data-compose-at]"), { text: "" })
        .set(q("[data-compose-pill], [data-note], [data-notice], [data-reminder], [data-bell-dot], [data-mention-menu]"), { opacity: 0 })
        .to(q("[data-compose]"), { text: "Can you join Thursday's demo?", duration: 1.2, ease: "none" }, 0.4)
        .to(q("[data-compose-at]"), { text: " @Pri", duration: 0.4, ease: "none" }, "+=0.2")
        .fromTo(q("[data-mention-menu]"), { opacity: 0, y: 6 }, { opacity: 1, y: 0, duration: 0.25 })
        .set(q("[data-compose-at]"), { text: "" }, "+=0.6")
        .set(q("[data-mention-menu]"), { opacity: 0 }, "<")
        .set(q("[data-compose-pill]"), { opacity: 1 }, "<")
        .set(q("[data-compose], [data-compose-at]"), { text: "" }, "+=0.5")
        .set(q("[data-compose-pill]"), { opacity: 0 }, "<")
        .fromTo(q("[data-note]"), { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.4, ease: "back.out(1.6)" }, "<")
        .fromTo(q("[data-bell]"), { rotation: 0 }, { rotation: 16, duration: 0.08, repeat: 5, yoyo: true, ease: "sine.inOut", transformOrigin: "50% 0%" }, "+=0.3")
        .fromTo(q("[data-bell-dot]"), { opacity: 0, scale: 0 }, { opacity: 1, scale: 1, duration: 0.3, ease: "back.out(3)" }, "<")
        .fromTo(q("[data-notice]"), { opacity: 0, y: 24, scale: 0.95 }, { opacity: 1, y: 0, scale: 1, duration: 0.45, ease: "back.out(1.6)" }, "<0.1")
        .fromTo(q("[data-reminder]"), { opacity: 0, y: 24, scale: 0.95 }, { opacity: 1, y: 0, scale: 1, duration: 0.45, ease: "back.out(1.6)" }, "+=1.1")
        .to(q("[data-note], [data-notice], [data-reminder], [data-bell-dot]"), { opacity: 0, duration: 0.4 }, "+=2.2");

    return [leads, duplicates, deals, follow];
}
