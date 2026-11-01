import type { ComponentType, ReactNode } from "react";
import {
    IconArrowUpRight,
    IconCalendarEvent,
    IconHandGrab,
    IconLayoutKanban,
    IconNotes,
    IconPhoneCall,
    IconSearch,
    IconSparkles,
    IconTargetArrow,
    IconUserCheck,
    IconUsers,
    IconX,
} from "@tabler/icons-react";

import { Avatar } from "@/components/Avatar";
import { StageBadge } from "@/components/StageBadge";
import { Accent, CONTAINER, Eyebrow, Heading } from "./Eyebrow";
import { DashArt, noise, type Sampler } from "./DashArt";

type Icon = ComponentType<{ size?: number; className?: string }>;

const PANEL_WIDTH = 410;
const PANEL_HEIGHT = 505;

// Faint grey streaks across the dark panels, so they read as a surface, not a hole
const streaks: Sampler = (x, y) => (noise(Math.floor(x / 24), y) > 0.82 ? 0.95 : 0);

const FEATURES: { icon: Icon; title: string; body: string; snippet: ReactNode }[] = [
    {
        icon: IconLayoutKanban,
        title: "Familiar, modern interface",
        body: "A board and tables that feel like the tools your team already likes. Nothing to train, nothing to configure first.",
        snippet: <BoardSnippet />,
    },
    {
        icon: IconUsers,
        title: "Built for the whole team",
        body: "Everyone works from the same live records, so a hand-off never loses context and nobody updates a stale copy.",
        snippet: <TableSnippet />,
    },
    {
        icon: IconSparkles,
        title: "Fast path to action",
        body: "Assign a lead, add a note or book a call in a couple of clicks, straight from the record you're looking at.",
        snippet: <ActionsSnippet />,
    },
];

export function FeaturesSection() {
    return (
        <section data-reveal className="bg-white py-16">
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
                                {feature.snippet}
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

// --- the three product snippets, drawn from the app's own pieces ---

const SNIPPET = "absolute rounded-lg border border-[#ebebeb] bg-white text-[13px] text-[#333333] shadow-[0_10px_40px_rgb(0_0_0/0.35)]";

function BoardSnippet() {
    const columns = [
        {
            stage: { name: "Qualified", color: "#7c3aed" },
            deals: [
                { title: "Acme Industries", amount: "₹4,80,000", owner: "Priya", date: "Nov 18" },
                { title: "Hooli Cloud", amount: "₹1,25,000", owner: "Arjun", date: "Nov 24" },
            ],
        },
        {
            stage: { name: "Proposal", color: "#ca8a04" },
            deals: [{ title: "Globex Corporation", amount: "₹9,60,000", owner: "Rahul", date: "Dec 2" }],
        },
    ];

    return (
        <div className={`${SNIPPET} top-[19%] -left-4 w-[105%] p-3`}>
            <p className="mb-3 flex items-center gap-1.5 font-medium text-[#666666]">
                <IconLayoutKanban size={14} /> All deals <span className="text-[#999999]">· 9</span>
            </p>
            <div className="grid grid-cols-2 gap-3">
                {columns.map((column) => (
                    <div key={column.stage.name} className="flex flex-col gap-2">
                        <StageBadge name={column.stage.name} color={column.stage.color} />
                        {column.deals.map((deal) => (
                            <div key={deal.title} className="flex flex-col gap-1.5 rounded-lg border border-[#ebebeb] bg-white p-2.5">
                                <span className="flex items-center gap-1.5 font-medium text-[#1c1c1c]">
                                    <Avatar name={deal.title} /> {deal.title}
                                </span>
                                <span className="text-[#666666]">{deal.amount}</span>
                                <span className="flex items-center gap-1.5 text-[#666666]">
                                    <Avatar name={deal.owner} /> {deal.owner}
                                </span>
                                <span className="flex items-center gap-1.5 text-[#999999]">
                                    <IconCalendarEvent size={13} /> {deal.date}
                                </span>
                            </div>
                        ))}
                    </div>
                ))}
            </div>
            {/* a hand dragging a card across, to show it's a live board */}
            <IconHandGrab size={44} stroke={1.4} className="absolute right-[28%] bottom-[22%] fill-white text-[#1c1c1c]" />
        </div>
    );
}

// A teammate's cursor: a coloured name tag with a little pointer
function Cursor({ name, color, className }: { name: string; color: string; className: string }) {
    return (
        <span className={`absolute z-10 flex flex-col items-start ${className}`}>
            <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden>
                <path d="M2 2 L20 9 L11 11 L9 20 Z" fill={color} />
            </svg>
            <span
                className="-mt-1 ml-3 px-2 py-1 font-(family-name:--font-azeret-mono) text-[16px] font-semibold tracking-[0.04em] text-[#1c1c1c] uppercase"
                style={{ backgroundColor: color }}
            >
                {name}
            </span>
        </span>
    );
}

function TableSnippet() {
    const rows = [
        { name: "Acme Industries", stage: { name: "Qualified", color: "#0284c7" } },
        { name: "Initech Systems", stage: { name: "Qualified", color: "#0284c7" } },
        { name: "Umbrella Logistics", stage: { name: "Qualified", color: "#0284c7" } },
        { name: "Vandelay Imports", stage: { name: "Qualified", color: "#0284c7" } },
        { name: "Gringotts Finance", stage: { name: "Qualified", color: "#0284c7" } },
    ];

    return (
        <>
            <div className={`${SNIPPET} top-[27%] left-[13%] w-[95%] overflow-hidden`}>
                <p className="flex h-10 items-center gap-1.5 border-b border-[#f1f1f1] px-3 font-medium text-[#666666]">
                    <IconTargetArrow size={14} /> All leads <span className="text-[#999999]">· 5</span>
                </p>
                <div className="flex gap-1.5 border-b border-[#f1f1f1] px-3 py-2">
                    <span className="flex items-center gap-1 rounded bg-[#edf2fe] px-1.5 py-0.5 text-[#3e63dd]">
                        Stage is Qualified <IconX size={12} />
                    </span>
                    <span className="flex items-center gap-1 rounded bg-[#edf2fe] px-1.5 py-0.5 text-[#3e63dd]">
                        Owner is Priya <IconX size={12} />
                    </span>
                </div>
                {rows.map((row) => (
                    <div key={row.name} className="grid h-8 grid-cols-[1.4fr_1fr] items-center border-b border-[#f1f1f1] px-3 last:border-b-0">
                        <span className="flex items-center gap-1.5 text-[#1c1c1c]">
                            <Avatar name={row.name} /> {row.name}
                        </span>
                        <span>
                            <StageBadge name={row.stage.name} color={row.stage.color} />
                        </span>
                    </div>
                ))}
            </div>
            <Cursor name="Priya" color="#feffb7" className="top-[9%] left-[42%]" />
            <Cursor name="Rahul" color="#ffb38a" className="top-[50%] left-[3%]" />
            <Cursor name="Meera" color="#ed87fc" className="bottom-[6%] left-[46%]" />
        </>
    );
}

function ActionsSnippet() {
    const groups: { title: string; items: { icon: Icon; label: string; shortcut?: string }[] }[] = [
        {
            title: "This lead",
            items: [
                { icon: IconUserCheck, label: "Assign to an agent" },
                { icon: IconNotes, label: "Add a note" },
                { icon: IconPhoneCall, label: "Schedule a call" },
            ],
        },
        {
            title: "Go to",
            items: [
                { icon: IconArrowUpRight, label: "Go to Deals", shortcut: "G D" },
                { icon: IconArrowUpRight, label: "Go to Tasks", shortcut: "G T" },
            ],
        },
    ];

    return (
        <div className={`${SNIPPET} top-[15%] left-[24%] w-[90%] overflow-hidden`}>
            <p className="flex h-11 items-center gap-2 border-b border-[#f1f1f1] px-3 text-[#999999]">
                <IconSearch size={14} /> Type anything...
            </p>
            <div className="flex flex-col gap-3 p-2">
                {groups.map((group) => (
                    <div key={group.title}>
                        <p className="px-1.5 pb-1 text-[11px] font-medium text-[#999999]">{group.title}</p>
                        {group.items.map((item, index) => (
                            <span
                                key={item.label}
                                className={`flex h-8 items-center gap-2 rounded-md px-1.5 text-[#333333] ${group.title === "This lead" && index === 1 ? "bg-black/5" : ""}`}
                            >
                                <span className="flex size-6 items-center justify-center rounded border border-[#ebebeb] text-[#666666]">
                                    <item.icon size={14} />
                                </span>
                                {item.label}
                                {item.shortcut && <span className="ml-auto rounded border border-[#ebebeb] px-1 text-[11px] text-[#999999]">{item.shortcut}</span>}
                            </span>
                        ))}
                    </div>
                ))}
            </div>
        </div>
    );
}
