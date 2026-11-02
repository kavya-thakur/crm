"use client";

import { useState } from "react";
import { IconArrowDown } from "@tabler/icons-react";

import { formatMoney, formatMoneyShort } from "@/lib/format";
import { Avatar } from "@/components/Avatar";

export interface TeamMember {
    id: number;
    name: string;
    revenue: number | null;
    won: number | null;
    winRate: number | null;
    openValue: number | null;
    openCount: number | null;
    leads: number | null;
    converted: number | null;
    tasksDone: number;
    activitiesDone: number;
}

export interface Team {
    seesDeals: boolean;
    seesLeads: boolean;
    people: TeamMember[];
}

type SortKey = "revenue" | "won" | "winRate" | "openValue" | "leads" | "converted" | "tasksDone" | "activitiesDone";

// The table's columns; deal and lead columns only show for someone who can see the team's deals / leads
const COLUMNS: { key: SortKey; label: string; needs?: "deals" | "leads"; format?: (value: number) => string }[] = [
    { key: "revenue", label: "Revenue won", needs: "deals", format: formatMoney },
    { key: "won", label: "Deals won", needs: "deals" },
    { key: "winRate", label: "Win rate", needs: "deals", format: (value) => `${value}%` },
    { key: "openValue", label: "Open pipeline", needs: "deals", format: formatMoneyShort },
    { key: "leads", label: "New leads", needs: "leads" },
    { key: "converted", label: "Converted", needs: "leads" },
    { key: "tasksDone", label: "Tasks done" },
    { key: "activitiesDone", label: "Calls & meetings" },
];

// Gold, silver and bronze for the top three
const MEDALS = ["bg-[#fff4d5] text-[#ab6400] ring-[#ab6400]/20", "bg-[#f0f0f0] text-[#646464] ring-[#646464]/20", "bg-[#f8ece6] text-[#a35829] ring-[#a35829]/20"];

/**
 * Everyone in the workspace ranked by the column you sort on (revenue won to start with),
 * so a manager can see who's doing well. Clicking a person narrows the whole dashboard to them.
 */
export function TeamTable({
    team,
    meId,
    selectedId,
    onPick,
}: {
    team: Team;
    meId: number;
    selectedId: number | null;
    onPick: (id: number | null) => void;
}) {
    const columns = COLUMNS.filter((column) => !column.needs || (column.needs === "deals" ? team.seesDeals : team.seesLeads));
    const [sortKey, setSortKey] = useState<SortKey>(columns[0].key);

    // highest first; nobody-closed-anything (null) goes last; ties stay alphabetical
    const ranked = [...team.people].sort((a, b) => (b[sortKey] ?? -1) - (a[sortKey] ?? -1) || a.name.localeCompare(b.name));
    const topRevenue = Math.max(...team.people.map((person) => person.revenue ?? 0), 1);

    return (
        <div className="-mx-5 overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse">
                <thead>
                    <tr className="border-y border-line-light text-left text-sm text-faint">
                        <th className="w-12 py-2 pl-5 font-medium">#</th>
                        <th className="py-2 pr-4 font-medium">Agent</th>
                        {columns.map((column) => (
                            <th key={column.key} className="py-2 pr-5 text-right font-medium last:pr-5" aria-sort={sortKey === column.key ? "descending" : undefined}>
                                <button
                                    type="button"
                                    onClick={() => setSortKey(column.key)}
                                    className={`inline-flex items-center gap-1 whitespace-nowrap hover:text-ink ${sortKey === column.key ? "text-ink" : ""}`}
                                >
                                    {sortKey === column.key && <IconArrowDown size={12} stroke={2.25} />}
                                    {column.label}
                                </button>
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {ranked.map((person, index) => {
                        const selected = person.id === selectedId;
                        const scored = (person[sortKey] ?? 0) > 0;
                        return (
                            <tr
                                key={person.id}
                                onClick={() => onPick(selected ? null : person.id)}
                                className={`cursor-pointer border-b border-line-light last:border-b-0 ${selected ? "bg-accent-faint" : "hover:bg-paper"}`}
                            >
                                <td className="py-2.5 pl-5">
                                    {index < 3 && scored ? (
                                        <span className={`flex size-6 items-center justify-center rounded-full text-sm font-semibold ring-1 ring-inset ${MEDALS[index]}`}>
                                            {index + 1}
                                        </span>
                                    ) : (
                                        <span className="flex size-6 items-center justify-center text-sm text-faint tabular-nums">{index + 1}</span>
                                    )}
                                </td>
                                <td className="py-2.5 pr-4">
                                    {/* the name is the real control, so the row works from the keyboard too */}
                                    <button
                                        type="button"
                                        aria-pressed={selected}
                                        className="flex items-center gap-2.5 text-left outline-none focus-visible:underline"
                                    >
                                        <Avatar name={person.name} size="md" />
                                        <span className="font-medium whitespace-nowrap text-ink">{person.name}</span>
                                        {person.id === meId && <span className="rounded-full bg-app px-1.5 text-sm text-muted">You</span>}
                                    </button>
                                </td>
                                {columns.map((column) => {
                                    const value = person[column.key];
                                    return (
                                        <td
                                            key={column.key}
                                            className={`py-2.5 pr-5 text-right tabular-nums ${sortKey === column.key ? "font-medium text-ink" : "text-muted"}`}
                                        >
                                            {value === null ? <span className="text-light">—</span> : column.format ? column.format(value) : value}
                                            {/* revenue also gets a thin bar: their share of the top earner's */}
                                            {column.key === "revenue" && value !== null && (
                                                <span className="mt-1 ml-auto block h-1 w-24 rounded-full bg-accent-soft">
                                                    <span className="block h-full rounded-full bg-accent" style={{ width: `${(value / topRevenue) * 100}%` }} />
                                                </span>
                                            )}
                                        </td>
                                    );
                                })}
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}
