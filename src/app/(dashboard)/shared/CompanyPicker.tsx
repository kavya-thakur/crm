"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { IconBuilding, IconCheck, IconChevronDown, IconPlus, IconSearch, IconX } from "@tabler/icons-react";

import { api } from "@/lib/api/client";
import { Dropdown } from "@/components/Dropdown";

/*
 * Picking a company: search the workspace's companies and pick one, or add a new one by its name.
 * Values are company names, as the API takes them (it files the contact under that company).
 */

// The search box and the list, without a menu around it: in a dropdown (CompanyPicker), or
// straight in a panel (bulk edit, where a menu would be cut off by the panel's scroll)
export function CompanyOptions({ value, onPick, clearable = true }: { value: string | null; onPick: (name: string | null) => void; clearable?: boolean }) {
    const [typed, setTyped] = useState("");
    const [term, setTerm] = useState("");

    // search once typing pauses
    useEffect(() => {
        const timer = setTimeout(() => setTerm(typed.trim()), 200);
        return () => clearTimeout(timer);
    }, [typed]);

    // the first 50 A to Z; anyone who can't see contacts (so not companies) can still type a new one
    const companies = useQuery({
        queryKey: ["companies", "pick", term],
        queryFn: () => api.get<{ data: { id: number; name: string }[] }>("/companies", { params: { search: term || undefined } }).then((res) => res.data.data),
        retry: false,
    });

    const wanted = typed.trim();
    const exact = companies.data?.find((company) => company.name.toLowerCase() === wanted.toLowerCase());
    const pickTyped = () => {
        if (wanted) onPick(exact?.name ?? wanted);
    };

    const item = "flex h-8 w-full items-center gap-2 rounded px-1.5 text-left text-sm text-muted hover:bg-fill hover:text-ink";

    return (
        <div className="flex flex-col gap-0.5">
            <label className="mb-1 flex h-8 items-center gap-1.5 rounded-lg bg-app px-2">
                <IconSearch size={14} className="shrink-0 text-faint" />
                <input
                    autoFocus
                    value={typed}
                    onChange={(event) => setTyped(event.target.value)}
                    onKeyDown={(event) => {
                        // Enter: the company typed, found or new
                        if (event.key === "Enter") {
                            event.preventDefault();
                            pickTyped();
                        }
                    }}
                    maxLength={200}
                    placeholder="Search or add a company"
                    aria-label="Company"
                    className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-light"
                />
            </label>

            {wanted && !exact && (
                <button type="button" onClick={pickTyped} className={item}>
                    <IconPlus size={15} className="shrink-0" />
                    <span className="truncate">
                        Add <span className="font-medium text-ink">&ldquo;{wanted}&rdquo;</span>
                    </span>
                </button>
            )}

            {clearable && value && !wanted && (
                <button type="button" onClick={() => onPick(null)} className={item}>
                    <IconX size={15} className="shrink-0" /> No company
                </button>
            )}

            {companies.data?.map((company) => (
                <button key={company.id} type="button" onClick={() => onPick(company.name)} className={item}>
                    <IconBuilding size={15} className="shrink-0 text-faint" />
                    <span className="truncate">{company.name}</span>
                    {company.name.toLowerCase() === value?.toLowerCase() && <IconCheck size={14} className="ml-auto shrink-0 text-ink" />}
                </button>
            ))}

            {companies.data?.length === 0 && !wanted && <p className="px-1.5 py-1 text-sm text-faint">No companies yet. Type a name to add one.</p>}
        </div>
    );
}

// A field's company, as a menu: shows the current one, and opens the search and list
export function CompanyPicker({
    value,
    onChange,
    disabled,
    placeholder = "Add company",
    buttonClassName = "flex h-7 max-w-full items-center gap-1 rounded-lg px-1 hover:bg-fill",
}: {
    value: string | null;
    onChange: (name: string | null) => void;
    disabled?: boolean;
    placeholder?: string;
    buttonClassName?: string;
}) {
    if (disabled) return <span className={`block truncate px-1 ${value ? "" : "text-light"}`}>{value ?? "Empty"}</span>;

    return (
        <Dropdown
            buttonClassName={buttonClassName}
            panelClassName="max-h-80 w-72 p-1"
            label={
                <>
                    {value ? <span className="truncate">{value}</span> : <span className="truncate text-light">{placeholder}</span>}
                    <IconChevronDown size={14} className="ml-auto shrink-0 text-faint" />
                </>
            }
        >
            {(close) => (
                <CompanyOptions
                    value={value}
                    onPick={(name) => {
                        if ((name ?? "") !== (value ?? "")) onChange(name);
                        close();
                    }}
                />
            )}
        </Dropdown>
    );
}
