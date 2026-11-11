import type { ComponentType } from "react";
import {
    IconAddressBook,
    IconCalendarEvent,
    IconChecklist,
    IconCurrencyRupee,
    IconFilter,
    IconHome,
    IconNotes,
    IconPlus,
    IconSearch,
    IconSortDescending,
    IconTargetArrow,
} from "@tabler/icons-react";

import { Avatar } from "@/components/Avatar";
import { StageBadge } from "@/components/StageBadge";

type Icon = ComponentType<{ size?: number; className?: string }>;

const NAV: { icon: Icon; label: string; active?: boolean }[] = [
    { icon: IconHome, label: "Home" },
    { icon: IconTargetArrow, label: "Leads", active: true },
    { icon: IconCurrencyRupee, label: "Deals" },
    { icon: IconAddressBook, label: "Contacts" },
    { icon: IconChecklist, label: "Tasks" },
    { icon: IconCalendarEvent, label: "Activities" },
    { icon: IconNotes, label: "Notes" },
];

const STAGES = {
    new: { name: "New", color: "#475569" },
    contacted: { name: "Contacted", color: "#7c3aed" },
    qualified: { name: "Qualified", color: "#0284c7" },
    proposal: { name: "Proposal", color: "#ca8a04" },
    won: { name: "Won", color: "#059669" },
} as const;

// Made-up leads, only to show what the product looks like
const ROWS = [
    { name: "Acme Industries", stage: STAGES.qualified, owner: "Olivia", source: "Website", created: "Nov 2" },
    { name: "Globex Corporation", stage: STAGES.proposal, owner: "Ethan", source: "Referral", created: "Nov 1" },
    { name: "Northwind Traders", stage: STAGES.new, owner: "Olivia", source: "Cold call", created: "Oct 30" },
    { name: "Contoso Ltd", stage: STAGES.won, owner: "Aanya", source: "Website", created: "Oct 29" },
    { name: "Initech Systems", stage: STAGES.contacted, owner: "Vihaan", source: "Event", created: "Oct 28" },
    { name: "Umbrella Logistics", stage: STAGES.qualified, owner: "Ethan", source: "Referral", created: "Oct 27" },
    { name: "Stark Components", stage: STAGES.proposal, owner: "Aanya", source: "Website", created: "Oct 26" },
    { name: "Wayne Supplies", stage: STAGES.new, owner: "Vihaan", source: "Event", created: "Oct 24" },
    { name: "Hooli Cloud", stage: STAGES.contacted, owner: "Olivia", source: "Cold call", created: "Oct 23" },
    { name: "Vandelay Imports", stage: STAGES.qualified, owner: "Aanya", source: "Referral", created: "Oct 22" },
    { name: "Soylent Foods", stage: STAGES.won, owner: "Ethan", source: "Website", created: "Oct 21" },
    { name: "Pied Piper Labs", stage: STAGES.new, owner: "Vihaan", source: "Website", created: "Oct 20" },
    { name: "Massive Dynamic", stage: STAGES.proposal, owner: "Olivia", source: "Event", created: "Oct 18" },
    { name: "Cyberdyne Retail", stage: STAGES.contacted, owner: "Aanya", source: "Cold call", created: "Oct 17" },
    { name: "Gringotts Finance", stage: STAGES.qualified, owner: "Vihaan", source: "Referral", created: "Oct 15" },
];

const LIGHTS = ["#FF5F57", "#FEBC2E", "#28C840"];

// The product shown inside a desktop window, the way twenty.com shows its own. It's a
// drawing made from the app's own pieces, not a live screenshot.
export function HeroPreview() {
    return (
        <div
            aria-hidden
            className="mx-auto flex h-120 w-full max-w-260 flex-col overflow-hidden rounded-[20px] border border-[#ebebeb] bg-white text-left text-[13px] text-[#333333] shadow-[0_4px_16px_rgb(0_0_0/0.08)] min-[921px]:h-169 min-[921px]:shadow-[0_10px_64px_rgb(0_0_0/0.2)]"
        >
            {/* window bar: traffic lights, the app name in the middle */}
            <div className="grid shrink-0 grid-cols-[auto_1fr_auto] items-center border-b border-black/5 bg-[#f7f7f7] px-3 py-2 shadow-[inset_0_1px_rgb(255_255_255/0.65)]">
                <div className="flex items-center gap-2 px-1.5">
                    {LIGHTS.map((color) => (
                        <span key={color} className="size-3 rounded-full shadow-[inset_0_0_0_0.5px_rgb(0_0_0/0.12)]" style={{ backgroundColor: color }} />
                    ))}
                </div>
                <span className="justify-self-center text-[12px] font-medium text-[#28241e]/60">Flash</span>
                <span className="w-15" />
            </div>

            <div className="flex min-h-0 flex-1">
                <aside className="hidden w-55 shrink-0 flex-col gap-4 border-r border-[#ebebeb] bg-[#f9f9f9] p-2.5 min-[921px]:flex">
                    <div className="flex h-8 items-center gap-2 px-1.5">
                        <span className="flex size-5 items-center justify-center rounded bg-[#1c1c1c] text-[10px] font-semibold text-white">A</span>
                        <span className="font-medium text-[#1c1c1c]">Acme Sales</span>
                    </div>

                    <nav className="flex flex-col gap-0.5">
                        {NAV.map((item) => (
                            <span
                                key={item.label}
                                className={`flex h-8 items-center gap-2 rounded-lg px-1.5 font-medium ${item.active ? "bg-black/5 text-[#1c1c1c]" : "text-[#666666]"}`}
                            >
                                <item.icon size={16} className={item.active ? "text-[#4a38f5]" : "text-[#999999]"} />
                                {item.label}
                            </span>
                        ))}
                    </nav>
                </aside>

                <div className="flex min-w-0 flex-1 flex-col">
                    <div className="flex h-12 shrink-0 items-center gap-2 border-b border-[#ebebeb] bg-[#fcfcfc] px-3">
                        <IconTargetArrow size={16} className="text-[#4a38f5]" />
                        <span className="font-semibold text-[#1c1c1c]">Leads</span>
                        <span className="text-[#999999]">128</span>
                        <span className="ml-auto flex h-6 items-center gap-1 rounded-lg bg-[#3e63dd] px-2 font-medium text-white">
                            <IconPlus size={14} />
                            New Lead
                        </span>
                    </div>

                    <div className="flex h-10 shrink-0 items-center justify-end gap-1 border-b border-[#f1f1f1] px-2 font-medium text-[#666666]">
                        <span className="flex h-7 items-center gap-1 px-2">
                            <IconSearch size={14} /> Search
                        </span>
                        <span className="flex h-7 items-center gap-1 px-2">
                            <IconFilter size={14} /> Filter
                        </span>
                        <span className="flex h-7 items-center gap-1 px-2">
                            <IconSortDescending size={14} /> Sort
                        </span>
                    </div>

                    <div className="min-h-0 flex-1 overflow-hidden">
                        <div className="grid h-8 grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)_minmax(0,1fr)] items-center border-b border-[#f1f1f1] px-3 font-medium text-[#999999] min-[921px]:grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.8fr)]">
                            <span>Name</span>
                            <span>Stage</span>
                            <span>Owner</span>
                            <span className="hidden min-[921px]:block">Source</span>
                            <span className="hidden min-[921px]:block">Created</span>
                        </div>

                        {ROWS.map((row) => (
                            <div
                                key={row.name}
                                className="grid h-8 grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)_minmax(0,1fr)] items-center border-b border-[#f1f1f1] px-3 min-[921px]:grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.8fr)]"
                            >
                                <span className="flex min-w-0 items-center gap-1.5 text-[#1c1c1c]">
                                    <Avatar name={row.name} />
                                    <span className="truncate">{row.name}</span>
                                </span>
                                <span className="min-w-0">
                                    <StageBadge name={row.stage.name} color={row.stage.color} />
                                </span>
                                <span className="flex min-w-0 items-center gap-1.5">
                                    <Avatar name={row.owner} />
                                    <span className="truncate">{row.owner}</span>
                                </span>
                                <span className="hidden truncate min-[921px]:block">{row.source}</span>
                                <span className="hidden truncate text-[#999999] min-[921px]:block">{row.created}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
