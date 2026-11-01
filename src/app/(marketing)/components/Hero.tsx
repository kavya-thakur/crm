import Link from "next/link";
import { StageBadge } from "@/components/StageBadge";
import { Avatar } from "@/components/Avatar";
import { IconAddressBook, IconCurrencyRupee, IconNotes, IconTargetArrow } from "@tabler/icons-react";
import { Halftone } from "./Halftone";

export function Hero({ loggedIn, primaryHref, primaryLabel }: { loggedIn: boolean; primaryHref: string; primaryLabel: string }) {
    return (
        <header className="relative overflow-hidden bg-[#f4f4f4] pt-40 pb-28">
            <Halftone shape="bolt" size={260} fade="top" className="pointer-events-none absolute -top-6 -left-10 text-[#4F46E5]/70" />
            <Halftone shape="diamond" size={220} fade="top" className="pointer-events-none absolute -right-6 bottom-0 text-[#4F46E5]/70" />

            <div className="relative mx-auto max-w-4xl px-6 text-center">
                <h1
                    data-hero-line
                    className="font-(family-name:--font-aleo) text-[42px] leading-[1.1] font-light tracking-tight text-[#1c1c1c] sm:text-[60px] sm:leading-[66px]"
                >
                    Run your pipeline, <span className="font-normal">not your inbox</span>
                </h1>
                <p data-hero-line className="mx-auto mt-6 max-w-lg font-(family-name:--font-host-grotesk) text-base text-[#1c1c1c]/60">
                    Flash keeps every lead, deal and conversation in one workspace your whole team actually uses — set up in minutes, shaped around how you sell.
                </p>

                <div data-hero-line className="mt-8 flex items-center justify-center gap-3 font-(family-name:--font-azeret-mono) text-xs font-medium tracking-wide uppercase">
                    <Link href={primaryHref} className="flex h-11 items-center rounded-lg bg-[#1c1c1c] px-5 text-white hover:bg-black">
                        {primaryLabel}
                    </Link>
                    {!loggedIn && (
                        <a href="#how-it-works" className="flex h-11 items-center rounded-lg border border-[#1c1c1c] px-5 text-[#1c1c1c] hover:bg-white">
                            See how it works
                        </a>
                    )}
                </div>
            </div>

            <div data-hero-mockup className="relative mt-16 px-6">
                <HeroMockup />
            </div>
        </header>
    );
}

// A static mockup of the real app (same sidebar tiles, same StageBadge pills) —
// illustrative, not a live screenshot.
function HeroMockup() {
    const rows = [
        { name: "Acme Inc", stage: { name: "Qualified", color: "#0284C7" }, owner: "Priya" },
        { name: "Globex Corp", stage: { name: "Proposal", color: "#CA8A04" }, owner: "Rahul" },
        { name: "Northwind Traders", stage: { name: "New", color: "#475569" }, owner: "Priya" },
        { name: "Contoso", stage: { name: "Won", color: "#059669" }, owner: "Meera" },
    ];

    return (
        <div className="mx-auto flex max-w-4xl overflow-hidden rounded-xl border border-line bg-white text-left shadow-[2px_4px_24px_rgb(0_0_0/0.1)]">
            <div className="hidden w-44 shrink-0 flex-col gap-1 border-r border-line bg-paper p-3 sm:flex">
                {[
                    { icon: IconTargetArrow, label: "Leads", active: true },
                    { icon: IconCurrencyRupee, label: "Deals" },
                    { icon: IconAddressBook, label: "Contacts" },
                    { icon: IconNotes, label: "Notes" },
                ].map((item) => (
                    <span
                        key={item.label}
                        className={`flex h-8 items-center gap-2 rounded-lg px-2 text-[13px] ${item.active ? "bg-[#edf2fe] text-[#3e63dd]" : "text-muted"}`}
                    >
                        <item.icon size={14} />
                        {item.label}
                    </span>
                ))}
            </div>
            <div className="min-w-0 flex-1 p-4">
                <div className="flex items-center justify-between">
                    <span className="text-[14px] font-medium text-[#1c1c1c]">Leads</span>
                    <span className="rounded-lg bg-[#1c1c1c] px-3 py-1.5 text-[12px] font-medium text-white">New lead</span>
                </div>
                <div className="mt-3 overflow-hidden rounded-lg border border-line-light">
                    {rows.map((row, index) => (
                        <div
                            key={row.name}
                            className={`flex items-center gap-3 px-3 py-2.5 text-[13px] ${index !== rows.length - 1 ? "border-b border-line-light" : ""}`}
                        >
                            <span className="min-w-0 flex-1 truncate font-medium text-[#1c1c1c]">{row.name}</span>
                            <StageBadge name={row.stage.name} color={row.stage.color} />
                            <span className="flex w-20 shrink-0 items-center gap-1.5 text-muted">
                                <Avatar name={row.owner} />
                                {row.owner}
                            </span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
