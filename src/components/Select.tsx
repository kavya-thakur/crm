"use client";

import { useMemo, useState, type ReactNode } from "react";
import { IconCheck, IconChevronDown, IconSearch } from "@tabler/icons-react";
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
            panelClassName="max-h-64 overflow-y-auto p-1"
            matchWidth
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

// Like Select, but for picking several, e.g. "New or Screening". The menu stays open while
// you tick options, and the field shows what's picked: the first two, then "+2".
export function MultiSelect({
    values,
    onChange,
    options,
    placeholder,
}: {
    values: string[];
    onChange: (values: string[]) => void;
    options: SelectOption[];
    placeholder: string;
}) {
    const picked = options.filter((option) => values.includes(option.value));

    return (
        <Dropdown
            buttonClassName="flex h-8 w-full items-center gap-1 rounded-lg border border-line bg-surface px-1.5 text-left outline-none focus:border-accent focus:ring-3 focus:ring-accent-soft"
            panelClassName="max-h-72 overflow-y-auto p-1"
            matchWidth
            label={
                <>
                    <span className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
                        {picked.length === 0 && <span className="px-0.5 text-light">{placeholder}</span>}
                        {picked.slice(0, 2).map((option) => (
                            <span key={option.value} className="min-w-0 shrink truncate">
                                {option.render ?? <span className="rounded-md bg-app px-1.5 text-sm text-ink">{option.label}</span>}
                            </span>
                        ))}
                        {picked.length > 2 && <span className="shrink-0 text-sm text-faint">+{picked.length - 2}</span>}
                    </span>
                    <IconChevronDown size={14} className="shrink-0 text-faint" />
                </>
            }
        >
            {() => <MultiSelectPanel options={options} values={values} onChange={onChange} />}
        </Dropdown>
    );
}

function MultiSelectPanel({ options, values, onChange }: { options: SelectOption[]; values: string[]; onChange: (values: string[]) => void }) {
    const [query, setQuery] = useState("");
    const term = query.trim().toLowerCase();
    const shown = term ? options.filter((option) => option.label.toLowerCase().includes(term)) : options;

    // ticking keeps the options' own order, whatever order they were clicked in
    function toggle(value: string) {
        const next = values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
        onChange(options.map((option) => option.value).filter((item) => next.includes(item)));
    }

    return (
        <>
            {options.length > SEARCH_THRESHOLD && (
                <div className="sticky top-0 z-1 mb-1 flex h-8 items-center gap-1.5 rounded-lg bg-app px-2">
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

            {shown.length === 0 && <p className="px-1.5 py-2 text-sm text-faint">No matches</p>}

            {shown.map((option) => {
                const checked = values.includes(option.value);
                return (
                    <button
                        key={option.value}
                        type="button"
                        role="menuitemcheckbox"
                        aria-checked={checked}
                        onClick={() => toggle(option.value)}
                        className="flex h-8 w-full items-center gap-2 rounded px-1.5 text-left text-sm text-muted hover:bg-fill hover:text-ink"
                    >
                        <span
                            className={`flex size-4 shrink-0 items-center justify-center rounded border transition-colors ${
                                checked ? "border-accent bg-accent text-on-accent" : "border-line-strong bg-surface"
                            }`}
                        >
                            {checked && <IconCheck size={11} stroke={3} />}
                        </span>
                        <span className="min-w-0 flex-1 truncate">{option.render ?? option.label}</span>
                    </button>
                );
            })}

            {values.length > 0 && (
                <div className="sticky bottom-0 mt-1 border-t border-line-light bg-surface pt-1">
                    <button type="button" onClick={() => onChange([])} className="flex h-7 w-full items-center rounded px-1.5 text-sm text-muted hover:bg-fill hover:text-ink">
                        Clear ({values.length})
                    </button>
                </div>
            )}
        </>
    );
}
