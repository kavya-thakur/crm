"use client";

import { useMemo, useState, type ReactNode } from "react";
import { IconChevronDown, IconSearch } from "@tabler/icons-react";
import { Dropdown, MenuItem } from "./Dropdown";

/**
 * A proper dropdown for forms — styled like the app's other menus (Dropdown)
 * instead of the browser's native <select>, with an optional search box for
 * longer lists. Options are string-valued (like a native select); the caller
 * converts to/from numbers etc.
 */

export interface SelectOption {
    value: string;
    label: string;
    /** overrides the plain label, e.g. a colored stage pill */
    render?: ReactNode;
}

interface SelectProps {
    value: string | undefined;
    onChange: (value: string | undefined) => void;
    options: SelectOption[];
    placeholder: string;
    disabled?: boolean;
    /** defaults to on once there are more than 8 options */
    searchable?: boolean;
    className?: string;
}

const SEARCH_THRESHOLD = 8;

export function Select({ value, onChange, options, placeholder, disabled, searchable, className }: SelectProps) {
    const selected = options.find((option) => option.value === value);
    const showSearch = searchable ?? options.length > SEARCH_THRESHOLD;

    return (
        <Dropdown
            disabled={disabled}
            buttonClassName={`flex h-8 w-full items-center justify-between gap-1 rounded-lg border border-line bg-surface px-2 text-left outline-none focus:border-accent focus:ring-3 focus:ring-accent-soft ${className ?? ""}`}
            panelClassName="w-full max-h-64 overflow-y-auto p-1"
            label={
                <>
                    <span className={`min-w-0 flex-1 truncate ${selected ? "" : "text-light"}`}>
                        {selected ? (selected.render ?? selected.label) : placeholder}
                    </span>
                    <IconChevronDown size={14} className="shrink-0 text-faint" />
                </>
            }
        >
            {(close) => (
                <SelectPanel
                    options={options}
                    value={value}
                    showSearch={showSearch}
                    onChange={(next) => { onChange(next); close(); }}
                />
            )}
        </Dropdown>
    );
}

function SelectPanel({
    options,
    value,
    showSearch,
    onChange,
}: {
    options: SelectOption[];
    value: string | undefined;
    showSearch: boolean;
    onChange: (value: string | undefined) => void;
}) {
    const [query, setQuery] = useState("");

    const filtered = useMemo(() => {
        const term = query.trim().toLowerCase();
        return term ? options.filter((option) => option.label.toLowerCase().includes(term)) : options;
    }, [options, query]);

    return (
        <>
            {showSearch && (
                <div className="sticky top-0 mb-1 flex h-8 items-center gap-1.5 rounded-lg bg-app px-2">
                    <IconSearch size={14} className="shrink-0 text-faint" />
                    <input
                        autoFocus
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search..."
                        className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-light"
                    />
                </div>
            )}

            {filtered.length === 0 && <p className="px-1.5 py-2 text-sm text-faint">No matches</p>}

            {filtered.map((option) => (
                <MenuItem key={option.value} selected={option.value === value} onClick={() => onChange(option.value)}>
                    {option.render ?? option.label}
                </MenuItem>
            ))}
        </>
    );
}
