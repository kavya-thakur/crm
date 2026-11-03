"use client";

import { useRef, useState, type ComponentType, type CSSProperties, type ReactNode } from "react";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import {
    IconAt,
    IconCalendarEvent,
    IconChecklist,
    IconCircleDot,
    IconEye,
    IconHierarchy2,
    IconLayoutKanban,
    IconNotes,
    IconPhoneCall,
    IconShieldLock,
    IconTag,
    IconTimeline,
    IconTrash,
    IconUserCheck,
    IconUsers,
    IconWorld,
} from "@tabler/icons-react";

import { Accent, CONTAINER, Heading, Lead } from "./Eyebrow";
import { DashArt, skyline } from "./DashArt";

type Icon = ComponentType<{ size?: number; className?: string; style?: CSSProperties }>;

interface MenuCard {
    icon: Icon;
    title: string;
    rows: { icon: Icon; label: string; color: string }[];
}

interface Step {
    heading: ReactNode;
    body: string;
    cards: [MenuCard, MenuCard];
}

const STEPS: Step[] = [
    {
        heading: (
            <>
                Shape a pipeline <Accent>that fits how you sell</Accent>
            </>
        ),
        body: "Import your spreadsheet in minutes, name your own deal stages and lead sources, and add the custom fields your team actually fills in.",
        cards: [
            {
                icon: IconLayoutKanban,
                title: "Pipeline",
                rows: [
                    { icon: IconCircleDot, label: "New", color: "#94a3b8" },
                    { icon: IconCircleDot, label: "Qualified", color: "#38bdf8" },
                    { icon: IconCircleDot, label: "Proposal", color: "#fbbf24" },
                    { icon: IconCircleDot, label: "Won", color: "#89fc9a" },
                ],
            },
            {
                icon: IconTag,
                title: "Lead sources",
                rows: [
                    { icon: IconWorld, label: "Website", color: "#ed87fc" },
                    { icon: IconUsers, label: "Referral", color: "#ed87fc" },
                    { icon: IconCalendarEvent, label: "Event", color: "#ed87fc" },
                ],
            },
        ],
    },
    {
        heading: (
            <>
                Bring in the team, <Accent>with the right access</Accent>
            </>
        ),
        body: "Invite your agents and give each one a role. Leads from your website forms are shared out among them in turn.",
        cards: [
            {
                icon: IconShieldLock,
                title: "Roles",
                rows: [
                    { icon: IconHierarchy2, label: "Admin", color: "#89fc9a" },
                    { icon: IconUserCheck, label: "Manager", color: "#89fc9a" },
                    { icon: IconUsers, label: "Agent", color: "#89fc9a" },
                ],
            },
            {
                icon: IconEye,
                title: "Permissions",
                rows: [
                    { icon: IconEye, label: "View", color: "#feffb7" },
                    { icon: IconUserCheck, label: "Assign", color: "#feffb7" },
                    { icon: IconTrash, label: "Delete", color: "#feffb7" },
                ],
            },
        ],
    },
    {
        heading: (
            <>
                Work every deal <Accent>until it closes</Accent>
            </>
        ),
        body: "Book calls and meetings with a reminder 10 minutes before, @mention a teammate in a note, and see every change on the record's timeline.",
        cards: [
            {
                icon: IconCalendarEvent,
                title: "Follow-ups",
                rows: [
                    { icon: IconPhoneCall, label: "Call", color: "#ed87fc" },
                    { icon: IconUsers, label: "Meeting", color: "#ed87fc" },
                    { icon: IconChecklist, label: "Task", color: "#ed87fc" },
                ],
            },
            {
                icon: IconNotes,
                title: "Notes",
                rows: [
                    { icon: IconAt, label: "Mention", color: "#38bdf8" },
                    { icon: IconTimeline, label: "Timeline", color: "#38bdf8" },
                ],
            },
        ],
    },
];

const PANEL_WIDTH = 660;
const PANEL_HEIGHT = 692;

// The backdrop of the picture on the right: a black skyline on pale grey
const PANEL_TOWERS = [
    { x: 0, width: 90, height: 0.34 },
    { x: 96, width: 60, height: 0.46 },
    { x: 162, width: 120, height: 0.4 },
    { x: 288, width: 48, height: 0.58 },
    { x: 342, width: 102, height: 0.5 },
    { x: 450, width: 66, height: 0.66 },
    { x: 522, width: 54, height: 0.9 },
    { x: 582, width: 78, height: 0.8 },
];

// The notch in the picture's left edge, as on twenty.com
const NOTCH = "polygon(0 0, 100% 0, 100% 100%, 0 100%, 0 70%, 32px 66%, 32px 30%, 0 26%)";

// One of the dark floating menus: a title, then rows with a coloured icon and a cut corner
function Menu({ card }: { card: MenuCard }) {
    return (
        <div className="w-77.5 rounded-xl bg-[#1c1c1c] p-2 shadow-[0_10px_40px_rgb(0_0_0/0.25)]">
            <p className="flex items-center gap-2 px-2.5 pt-2 pb-3.5 font-(family-name:--font-host-grotesk) text-[18px] font-medium tracking-[-0.02em] text-white">
                <card.icon size={18} />
                {card.title}
            </p>
            <ul className="flex flex-col gap-1.5">
                {card.rows.map((row) => (
                    <li
                        key={row.label}
                        className="flex h-12.5 items-center gap-3 bg-[#2a2a2a] px-3.5 font-(family-name:--font-azeret-mono) text-[14px] tracking-[0.06em] text-white uppercase"
                        // the bottom-right corner cut, matching the buttons
                        style={{ clipPath: "polygon(0 0, 100% 0, 100% calc(100% - 14px), calc(100% - 14px) 100%, 0 100%)" }}
                    >
                        <row.icon size={18} className="shrink-0" style={{ color: row.color }} />
                        {row.label}
                    </li>
                ))}
            </ul>
        </div>
    );
}

function Picture({ step, active = true }: { step: Step; active?: boolean }) {
    return (
        <div
            className={`absolute inset-0 transition-[opacity,translate] duration-500 ease-out ${active ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-3 opacity-0"}`}
        >
            <div className="absolute top-[28%] left-[5%]">
                <Menu card={step.cards[0]} />
            </div>
            <div className="absolute top-[38%] left-[54%]">
                <Menu card={step.cards[1]} />
            </div>
        </div>
    );
}

function Backdrop({ children }: { children: ReactNode }) {
    return (
        <div className="relative aspect-660/692 w-full overflow-hidden bg-[#e4e4e4]" style={{ clipPath: NOTCH }}>
            <DashArt
                width={PANEL_WIDTH}
                height={PANEL_HEIGHT}
                sample={skyline(PANEL_TOWERS, PANEL_HEIGHT)}
                className="absolute inset-0 h-full w-full text-[#1c1c1c]"
            />
            {children}
        </div>
    );
}

export function StepsSection() {
    const pinRef = useRef<HTMLDivElement>(null);
    const [active, setActive] = useState(0);

    // While the tall section scrolls past, the picture stays put and the step changes
    // with how far through it you are. React skips the re-render when the step is the same.
    useGSAP(() => {
        ScrollTrigger.create({
            trigger: pinRef.current,
            start: "top 64px",
            end: "bottom bottom",
            onUpdate: ({ progress }) => setActive(Math.min(STEPS.length - 1, Math.floor(progress * STEPS.length))),
        });
    }, []);

    return (
        <section id="how-it-works" className="bg-[#f4f4f4]">
            {/* desktop: one picture pinned in place while the three steps scroll through */}
            <div ref={pinRef} className="hidden h-[300vh] min-[921px]:block">
                <div className="sticky top-16 flex h-[calc(100vh-64px)] items-center">
                    <div className={`${CONTAINER} grid grid-cols-2 items-center gap-10`}>
                        <div className="flex gap-12">
                            {/* progress: the current step's number on a short rail, a dot for the others */}
                            <ol aria-label="Steps" className="flex w-9 shrink-0 flex-col items-start gap-4 pt-3">
                                {STEPS.map((_, index) => (
                                    <li key={index} className="flex gap-4">
                                        <span
                                            className={`w-0.5 rounded-full bg-[#1c1c1c]/20 transition-[height] duration-500 ${index === active ? "h-20" : "h-1"}`}
                                        />
                                        <span
                                            className={`font-(family-name:--font-azeret-mono) text-[12px] font-medium text-[#4a38f5] transition-opacity duration-300 ${index === active ? "opacity-100" : "opacity-0"}`}
                                        >
                                            {String(index + 1).padStart(2, "0")}
                                        </span>
                                    </li>
                                ))}
                            </ol>

                            <div className="grid max-w-113.5">
                                {STEPS.map((step, index) => (
                                    <div
                                        key={index}
                                        aria-hidden={index !== active}
                                        className={`col-start-1 row-start-1 transition-[opacity,translate] duration-500 ease-out ${index === active ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-3 opacity-0"}`}
                                    >
                                        <Heading as="h3">{step.heading}</Heading>
                                        <Lead className="mt-8 max-w-105">{step.body}</Lead>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <Backdrop>
                            {STEPS.map((step, index) => (
                                <Picture key={index} step={step} active={index === active} />
                            ))}
                        </Backdrop>
                    </div>
                </div>
            </div>

            {/* phones: the steps one under another */}
            <div className={`${CONTAINER} flex flex-col gap-16 py-16 min-[921px]:hidden`}>
                {STEPS.map((step, index) => (
                    <div key={index}>
                        <span className="font-(family-name:--font-azeret-mono) text-[12px] font-medium text-[#4a38f5]">{String(index + 1).padStart(2, "0")}</span>
                        <Heading as="h3" className="mt-3">
                            {step.heading}
                        </Heading>
                        <Lead className="mt-4">{step.body}</Lead>
                        <div className="mt-8">
                            <Backdrop>
                                <Picture step={step} />
                            </Backdrop>
                        </div>
                    </div>
                ))}
            </div>
        </section>
    );
}
