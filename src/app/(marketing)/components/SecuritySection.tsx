"use client";

import { useRef, type ComponentType, type ReactNode } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import {
    IconCheck,
    IconCircleCheck,
    IconCookie,
    IconCurrencyRupee,
    IconKey,
    IconLayoutKanban,
    IconLock,
    IconMinus,
    IconNotes,
    IconShieldCheck,
    IconShieldLock,
    IconUserCheck,
} from "@tabler/icons-react";

import { Accent, CONTAINER, Eyebrow, Heading, Lead } from "./Eyebrow";

gsap.registerPlugin(ScrollTrigger);

type Icon = ComponentType<{ size?: number; className?: string }>;

// Only claims the code backs up: org-scoped queries, permission-built roles, the record
// timeline, bcrypt, httpOnly cookies, and the web form's spam trap + rate limit
const FACTS: { icon: Icon; text: string }[] = [
    { icon: IconKey, text: "Passwords hashed with bcrypt, never stored as text" },
    { icon: IconCookie, text: "Sign-in kept in a secure, httpOnly cookie" },
    { icon: IconShieldCheck, text: "Web forms spam-trapped and rate-limited" },
];

const PANEL =
    "relative h-72 overflow-hidden rounded-[18px] bg-[#f4f4f4] bg-[radial-gradient(rgb(28_28_28/0.09)_1px,transparent_1px)] font-(family-name:--font-host-grotesk) text-[#1c1c1c] [background-size:16px_16px]";
const MONO = "font-(family-name:--font-azeret-mono)";

export function SecuritySection() {
    const sectionRef = useRef<HTMLElement>(null);

    useGSAP(
        () => {
            if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

            const q = gsap.utils.selector(sectionRef);
            // each picture loops on its own, only while it's on screen
            const loop = (picture: string, repeatDelay = 0.8) =>
                gsap.timeline({ repeat: -1, repeatDelay, scrollTrigger: { trigger: q(`[data-picture=${picture}]`)[0], toggleActions: "play pause resume pause" } });

            // 1. you look through your own records; a reach into another workspace bounces off the lock
            loop("sealed")
                .fromTo(q("[data-scan]"), { opacity: 0, y: 0 }, { opacity: 1, duration: 0.3 })
                .to(q("[data-scan]"), { y: ROW, duration: 0.45, ease: "power2.inOut" }, "+=0.5")
                .to(q("[data-scan]"), { y: ROW * 2, duration: 0.45, ease: "power2.inOut" }, "+=0.5")
                .to(q("[data-scan]"), { opacity: 0, duration: 0.3 }, "+=0.5")
                .fromTo(q("[data-probe]"), { x: 0, opacity: 0 }, { opacity: 1, duration: 0.2 })
                .to(q("[data-probe]"), { x: 44, duration: 0.5, ease: "power2.in" })
                .to(q("[data-lock]"), { scale: 1.15, duration: 0.12, yoyo: true, repeat: 1 })
                .fromTo(q("[data-lock-ring]"), { scale: 1, opacity: 0.5 }, { scale: 2, opacity: 0, duration: 0.7 }, "<")
                .to(q("[data-probe]"), { x: 0, opacity: 0, duration: 0.5, ease: "power2.out" }, "<")
                .fromTo(q("[data-blocked]"), { opacity: 0, y: 4 }, { opacity: 1, y: 0, duration: 0.25 }, "<")
                .to(q("[data-blocked]"), { opacity: 0, duration: 0.3 }, "+=1.1");

            // 2. the checks pop in once, then an admin flips "Agent can assign" on and off again
            gsap.from(q("[data-check]"), {
                scale: 0,
                duration: 0.35,
                ease: "back.out(2)",
                stagger: 0.025,
                scrollTrigger: { trigger: q("[data-picture=roles]")[0], start: "top 85%", once: true },
            });
            const away = { x: CELL.x + 70, y: CELL.y + 80 };
            const click = { scale: 0.85, duration: 0.1, yoyo: true, repeat: 1 };
            loop("roles", 0.6)
                .fromTo(q("[data-cursor]"), { ...away, opacity: 0 }, { opacity: 1, duration: 0.2 }, "+=0.6")
                .to(q("[data-cursor]"), { x: CELL.x, y: CELL.y, duration: 0.9, ease: "power3.inOut" })
                .to(q("[data-cursor]"), click)
                .to(q("[data-off]"), { opacity: 0, duration: 0.15 }, "<")
                .fromTo(q("[data-on]"), { scale: 0, opacity: 1 }, { scale: 1, duration: 0.35, ease: "back.out(2.2)" }, "<")
                .fromTo(q("[data-saved]"), { opacity: 0, y: 4 }, { opacity: 1, y: 0, duration: 0.25 })
                .to(q("[data-cursor]"), { ...away, opacity: 0, duration: 0.7, ease: "power2.in" }, "+=0.3")
                .to(q("[data-cursor]"), { x: CELL.x, y: CELL.y, opacity: 1, duration: 0.9, ease: "power3.inOut" }, "+=1.4")
                .to(q("[data-cursor]"), click)
                .to(q("[data-on]"), { scale: 0, duration: 0.2 }, "<")
                .to(q("[data-off]"), { opacity: 1, duration: 0.2 }, "<+=0.1")
                .to(q("[data-saved]"), { opacity: 0, duration: 0.25 }, "<")
                .to(q("[data-cursor]"), { ...away, opacity: 0, duration: 0.7, ease: "power2.in" }, "+=0.3");

            // 3. a new change lands on top of the timeline every couple of seconds; after six
            //    the same three are showing again, so the loop joins up without a jump
            const entries = q("[data-entry]");
            const timeline = loop("timeline", 0);
            let shown = [entries[2], entries[1], entries[0]];
            LOG.forEach((_, step) => {
                const at = step * 2.2 + 1.4;
                const incoming = entries[(step + VISIBLE) % LOG.length];
                const leaving = shown[VISIBLE - 1];
                shown.forEach((entry, slot) => {
                    timeline.to(entry, { y: (slot + 1) * ENTRY, opacity: slot + 1 < VISIBLE ? 1 : 0, duration: 0.5, ease: "power3.inOut" }, at);
                });
                timeline
                    .fromTo(incoming, { y: -ENTRY, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, ease: "power3.out", immediateRender: false }, at + 0.1)
                    .set(leaving, { y: -ENTRY }, at + 0.6);
                shown = [incoming, ...shown.slice(0, VISIBLE - 1)];
            });
            timeline.to({}, { duration: LOG.length * 2.2 - timeline.duration() });
        },
        { scope: sectionRef },
    );

    return (
        <section ref={sectionRef} data-reveal className="bg-[#f4f4f4] py-24 font-(family-name:--font-host-grotesk) text-[#1c1c1c] min-[921px]:py-30">
            <div className={CONTAINER}>
                <div className="flex flex-col items-center text-center">
                    <Eyebrow>Built to be trusted.</Eyebrow>
                    <Heading className="mt-6 max-w-200">
                        Your customer list <Accent>stays yours</Accent>
                    </Heading>
                    <Lead className="mt-6 max-w-150">
                        Before your team moves its leads into Flash, here&apos;s how they&apos;re kept safe: sealed off from other companies, visible only to the right people, and logged
                        whenever they change.
                    </Lead>
                </div>

                <div className="mt-16 grid gap-4 min-[921px]:grid-cols-3">
                    <Card
                        title="Every workspace is sealed off"
                        body="Each company's leads, deals and contacts live in their own workspace. Every request is checked against yours, so no one outside your team can reach them."
                    >
                        <SealedPicture />
                    </Card>
                    <Card
                        title="Roles decide who sees what"
                        body="Build roles from view, create, edit, delete and assign. An agent can see only their own leads while a manager sees the whole pipeline."
                    >
                        <RolesPicture />
                    </Card>
                    <Card
                        title="Every change leaves a trace"
                        body="Stage moves, reassignments and edits are logged on the record's timeline with who made them, automatically. Nothing changes quietly."
                    >
                        <TimelinePicture />
                    </Card>
                </div>

                <ul className="mt-4 grid gap-4 min-[921px]:grid-cols-3">
                    {FACTS.map((fact) => (
                        <li key={fact.text} className="flex items-center gap-3 rounded-2xl border border-[#1c1c1c]/8 bg-white px-4 py-3.5 text-[14px]">
                            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[#1c1c1c] text-white">
                                <fact.icon size={16} />
                            </span>
                            {fact.text}
                        </li>
                    ))}
                </ul>
            </div>
        </section>
    );
}

function Card({ title, body, children }: { title: string; body: string; children: ReactNode }) {
    return (
        <article className="flex flex-col rounded-3xl border border-[#1c1c1c]/8 bg-white p-2">
            {children}
            <div className="px-4 pt-5 pb-5">
                <h3 className="text-[20px] font-medium tracking-[-0.03em]">{title}</h3>
                <p className="mt-2 text-[15px] leading-[1.55] text-[#1c1c1c]/60">{body}</p>
            </div>
        </article>
    );
}

// --- 1. two workspaces with a locked wall between them ---

const ROW = 34; // a record row is 28px tall, plus a 6px gap

function SealedPicture() {
    return (
        <div data-picture="sealed" aria-hidden className={PANEL}>
            <div className="absolute inset-x-4 top-1/2 grid -translate-y-1/2 grid-cols-2 gap-14">
                <div className="rounded-xl border border-[#1c1c1c]/8 bg-white p-3">
                    <p className="flex items-center gap-2 text-[12px] font-medium">
                        <span className="flex size-5 items-center justify-center rounded-md bg-[#4a38f5] text-[10px] text-white">B</span>
                        Brightloom
                    </p>
                    <p className={`mt-1 ${MONO} text-[10px] text-[#1c1c1c]/40`}>your workspace</p>
                    <div className="relative mt-3 flex flex-col gap-1.5">
                        <span data-scan className="absolute inset-x-0 top-0 h-7 rounded-md bg-[#4a38f5]/12 opacity-0" />
                        {["Sophia Bennett", "Hooli Cloud", "Kitepay"].map((record) => (
                            <span key={record} className="relative flex h-7 items-center truncate rounded-md border border-[#1c1c1c]/6 px-2 text-[11px]">
                                {record}
                            </span>
                        ))}
                    </div>
                </div>

                <div className="rounded-xl border border-[#1c1c1c]/8 bg-white/60 p-3">
                    <p className="flex items-center gap-2 text-[12px] font-medium text-[#1c1c1c]/45">
                        <span className="flex size-5 items-center justify-center rounded-md bg-[#1c1c1c]/10 text-[10px]">A</span>
                        Another company
                    </p>
                    <p className={`mt-1 ${MONO} text-[10px] text-[#1c1c1c]/30`}>not yours</p>
                    <div className="mt-3 flex flex-col gap-1.5">
                        {[70, 85, 60].map((width) => (
                            <span key={width} className="flex h-7 items-center rounded-md border border-[#1c1c1c]/6 px-2">
                                <span className="h-2 rounded-full bg-[#1c1c1c]/10" style={{ width: `${width}%` }} />
                            </span>
                        ))}
                    </div>
                </div>
            </div>

            {/* the wall */}
            <span className="absolute inset-y-4 left-1/2 border-l border-dashed border-[#1c1c1c]/20" />
            <span data-probe className="absolute top-1/2 left-[calc(50%-56px)] size-2.5 -translate-y-1/2 rounded-full bg-[#4a38f5] opacity-0 shadow-[0_0_12px_#4a38f5]" />
            <span className="absolute top-1/2 left-1/2 -translate-1/2">
                <span data-lock-ring className="absolute inset-0 rounded-full border-2 border-[#4a38f5] opacity-0" />
                <span data-lock className="relative flex size-9 items-center justify-center rounded-full bg-[#1c1c1c] text-white shadow-[0_8px_20px_rgb(0_0_0/0.2)]">
                    <IconLock size={16} />
                </span>
            </span>
            <span data-blocked className={`absolute top-[calc(50%+28px)] left-1/2 -translate-x-1/2 rounded-full bg-[#1c1c1c] px-2 py-0.5 ${MONO} text-[10px] text-white opacity-0`}>
                403 · blocked
            </span>
        </div>
    );
}

// --- 2. a role's permissions, with a cursor ticking one on and off ---

const ROLES = ["Admin", "Manager", "Agent"];
const ACTIONS = ["View", "Create", "Edit", "Delete", "Assign"];
// true = allowed, "own" = only their own records, null = the cell the cursor toggles
const GRANTS: (boolean | "own" | null)[][] = [
    [true, true, true, true, true],
    [true, true, true, false, true],
    ["own", true, "own", false, null],
];
const LABEL_WIDTH = 72;
const COLUMN = 44;
const HEADER = 28;
const ROW_HEIGHT = 40;
// the middle of the Agent × Assign cell, where the cursor clicks
const CELL = { x: LABEL_WIDTH + 4 * COLUMN + COLUMN / 2, y: HEADER + 2 * ROW_HEIGHT + ROW_HEIGHT / 2 };

function Tick() {
    return (
        <span data-check className="flex size-6 items-center justify-center rounded-md bg-[#4a38f5] text-white">
            <IconCheck size={14} stroke={3} />
        </span>
    );
}

function RolesPicture() {
    return (
        <div data-picture="roles" aria-hidden className={`${PANEL} flex items-center justify-center`}>
            <div className="relative rounded-xl border border-[#1c1c1c]/8 bg-white p-3">
                <div className="relative" style={{ width: LABEL_WIDTH + ACTIONS.length * COLUMN }}>
                    <div className="flex" style={{ height: HEADER }}>
                        <span style={{ width: LABEL_WIDTH }} />
                        {ACTIONS.map((action) => (
                            <span key={action} className={`flex items-center justify-center ${MONO} text-[9px] text-[#1c1c1c]/45 uppercase`} style={{ width: COLUMN }}>
                                {action}
                            </span>
                        ))}
                    </div>
                    {ROLES.map((role, row) => (
                        <div key={role} className="flex items-center border-t border-[#1c1c1c]/6" style={{ height: ROW_HEIGHT }}>
                            <span className="text-[12px] font-medium" style={{ width: LABEL_WIDTH }}>
                                {role}
                            </span>
                            {GRANTS[row].map((grant, column) => (
                                <span key={column} className="relative flex items-center justify-center" style={{ width: COLUMN }}>
                                    {grant === true && <Tick />}
                                    {grant === "own" && (
                                        <span data-check className="rounded-md bg-[#4a38f5]/10 px-1.5 py-1 text-[10px] font-medium text-[#4a38f5]">
                                            Own
                                        </span>
                                    )}
                                    {grant === false && <IconMinus size={14} className="text-[#1c1c1c]/20" />}
                                    {grant === null && (
                                        <>
                                            <span data-off className="absolute">
                                                <IconMinus size={14} className="text-[#1c1c1c]/20" />
                                            </span>
                                            <span data-on className="absolute flex size-6 items-center justify-center rounded-md bg-[#4a38f5] text-white" style={{ transform: "scale(0)" }}>
                                                <IconCheck size={14} stroke={3} />
                                            </span>
                                        </>
                                    )}
                                </span>
                            ))}
                        </div>
                    ))}

                    {/* its tip is the top-left corner, so x/y point exactly at the cell */}
                    <svg data-cursor width="18" height="18" viewBox="0 0 18 18" className="absolute top-0 left-0 origin-top-left opacity-0">
                        <path d="M1 1 L1 15 L5 11 L8 17 L10.5 16 L7.5 10 L13 10 Z" fill="#1c1c1c" stroke="#fff" strokeWidth="1.2" strokeLinejoin="round" />
                    </svg>
                </div>
            </div>
            <span data-saved className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[11px] whitespace-nowrap opacity-0 shadow-[0_6px_20px_rgb(0_0_0/0.08)]">
                <IconShieldLock size={13} className="text-[#4a38f5]" />
                Agents can now assign leads
            </span>
        </div>
    );
}

// --- 3. the record timeline, filling up with changes ---

const ENTRY = 56; // a timeline row is 48px tall, plus an 8px gap
const VISIBLE = 3;

const LOG: { icon: Icon; tone: string; who: string; did: string; detail: string }[] = [
    { icon: IconLayoutKanban, tone: "bg-[#ede9fe] text-[#6d28d9]", who: "Olivia", did: "moved a deal", detail: "Hooli Cloud → Negotiation" },
    { icon: IconUserCheck, tone: "bg-[#edf2fe] text-[#3a5bc7]", who: "Aanya", did: "assigned a lead", detail: "Acme Industries → Ethan" },
    { icon: IconCurrencyRupee, tone: "bg-[#e6f6eb] text-[#218358]", who: "Ethan", did: "changed the value", detail: "₹1,00,000 → ₹1,25,000" },
    { icon: IconNotes, tone: "bg-[#fff4d5] text-[#ab6400]", who: "Vihaan", did: "added a note", detail: "Proposal sent, follow up Friday" },
    { icon: IconCircleCheck, tone: "bg-[#e0f8f3] text-[#00826d]", who: "Olivia", did: "completed a task", detail: "Send proposal to Initech" },
    { icon: IconShieldLock, tone: "bg-[#fee9f6] text-[#c2298a]", who: "Aanya", did: "changed a role", detail: "Ethan → Manager" },
];

function TimelinePicture() {
    return (
        <div data-picture="timeline" aria-hidden className={`${PANEL} px-6`}>
            <p className={`mt-5 flex items-center gap-2 ${MONO} text-[10px] text-[#1c1c1c]/45 uppercase`}>
                <span className="size-1.5 rounded-full bg-[#4a38f5]" />
                Timeline · Hooli Cloud
            </p>
            <div className="relative mt-4" style={{ height: VISIBLE * ENTRY }}>
                {LOG.map((entry, index) => (
                    <div
                        key={entry.detail}
                        data-entry
                        className="absolute inset-x-0 top-0 flex h-12 items-center gap-2.5 rounded-xl border border-[#1c1c1c]/8 bg-white px-2.5"
                        // the first three start on screen, newest on top; the rest wait above, hidden
                        style={index < VISIBLE ? { transform: `translateY(${(VISIBLE - 1 - index) * ENTRY}px)` } : { transform: `translateY(${-ENTRY}px)`, opacity: 0 }}
                    >
                        <span className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${entry.tone}`}>
                            <entry.icon size={16} />
                        </span>
                        <span className="min-w-0">
                            <span className="block truncate text-[12px]">
                                <span className="font-medium">{entry.who}</span> {entry.did}
                            </span>
                            <span className="block truncate text-[11px] text-[#1c1c1c]/50">{entry.detail}</span>
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}
