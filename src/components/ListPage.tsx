"use client";

import type { ReactNode } from "react";
import {
    IconArrowDown,
    IconArrowUp,
    IconArrowsSort,
    IconChevronDown,
    IconLayoutKanban,
    IconPlus,
    IconSearch,
    IconTable,
    IconTrash,
    IconUserCircle,
    IconUserOff,
    IconX,
} from "@tabler/icons-react";

import { Avatar } from "./Avatar";
import { SectionIcon, type Section } from "./SectionIcon";
import { Dropdown, MenuItem } from "./Dropdown";
import { Spinner } from "./Loader";
import { Modal } from "./Modal";

/**
 * Shared chrome for an entity list page (Leads, Deals, ...): header, view
 * switcher, search box, sort menu, active-filter chips, the floating
 * bulk-action bar and the delete-confirm modal.
 *
 * Each page keeps its own data fetching, its own two-step filter menu (the
 * fields differ per entity) and its own table/board content — only the
 * pieces that were byte-for-byte identical live here.
 */

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

export function ListHeader({
    section,
    title,
    count,
    createLabel,
    onCreate,
}: {
    section: Section;
    title: string;
    count?: number;
    createLabel?: string;
    onCreate?: () => void;
}) {
    return (
        <header className="flex h-12 shrink-0 items-center gap-2 border-b border-line bg-paper px-3">
            <SectionIcon section={section} size="md" />
            <h1 className="font-semibold">{title}</h1>
            {count !== undefined && <span className="text-faint">{count}</span>}

            {onCreate && createLabel && (
                <button
                    type="button"
                    onClick={onCreate}
                    className="ml-auto flex h-6 items-center gap-1 rounded-lg bg-accent px-2 font-medium text-on-accent hover:bg-accent-hover"
                >
                    <IconPlus size={14} />
                    {createLabel}
                </button>
            )}
        </header>
    );
}

// ---------------------------------------------------------------------------
// View switcher (table / board), search box, sort menu — the toolbar row
// ---------------------------------------------------------------------------

export function ViewSwitcher({
    view,
    onChange,
    tableLabel,
    boardLabel,
}: {
    view: "table" | "board";
    onChange: (view: "table" | "board") => void;
    tableLabel: string;
    boardLabel: string;
}) {
    return (
        <Dropdown
            buttonClassName="flex h-7 items-center gap-1 rounded-lg px-2 hover:bg-fill"
            label={
                <>
                    {view === "table" ? <IconTable size={16} /> : <IconLayoutKanban size={16} />}
                    {view === "table" ? tableLabel : boardLabel}
                    <IconChevronDown size={14} className="text-faint" />
                </>
            }
        >
            {(close) => (
                <>
                    <MenuItem selected={view === "table"} onClick={() => { onChange("table"); close(); }}>
                        <IconTable size={16} /> {tableLabel}
                    </MenuItem>
                    <MenuItem selected={view === "board"} onClick={() => { onChange("board"); close(); }}>
                        <IconLayoutKanban size={16} /> {boardLabel}
                    </MenuItem>
                </>
            )}
        </Dropdown>
    );
}

export function SearchBox({
    value,
    onChange,
    ariaLabel,
}: {
    value: string;
    onChange: (value: string) => void;
    ariaLabel: string;
}) {
    return (
        <label className="flex h-7 items-center gap-1 rounded-lg px-2 hover:bg-fill focus-within:bg-fill">
            <IconSearch size={14} />
            <input
                type="text"
                placeholder="Search"
                value={value}
                onChange={(event) => onChange(event.target.value)}
                aria-label={ariaLabel}
                className="w-16 bg-transparent font-normal text-ink outline-none transition-all placeholder:font-medium placeholder:text-muted focus:w-44"
            />
        </label>
    );
}

export function SortMenu<TSortField extends string>({
    fields,
    sortBy,
    sortOrder,
    onChange,
}: {
    fields: { field: TSortField; label: string }[];
    sortBy: TSortField;
    sortOrder: "asc" | "desc";
    onChange: (change: { sortBy?: TSortField; sortOrder?: "asc" | "desc" }) => void;
}) {
    return (
        <Dropdown
            align="right"
            buttonClassName="flex h-7 items-center gap-1 rounded-lg px-2 hover:bg-fill"
            label={<><IconArrowsSort size={14} /> Sort</>}
        >
            {(close) => (
                <>
                    {fields.map(({ field, label }) => (
                        <MenuItem
                            key={field}
                            selected={sortBy === field}
                            onClick={() => { onChange({ sortBy: field }); close(); }}
                        >
                            {label}
                        </MenuItem>
                    ))}
                    <div className="my-1 h-px bg-line-light" />
                    <MenuItem selected={sortOrder === "asc"} onClick={() => { onChange({ sortOrder: "asc" }); close(); }}>
                        <IconArrowUp size={16} /> Ascending
                    </MenuItem>
                    <MenuItem selected={sortOrder === "desc"} onClick={() => { onChange({ sortOrder: "desc" }); close(); }}>
                        <IconArrowDown size={16} /> Descending
                    </MenuItem>
                </>
            )}
        </Dropdown>
    );
}

// ---------------------------------------------------------------------------
// Active filters, shown as removable chips below the toolbar
// ---------------------------------------------------------------------------

export function FilterBar({
    show,
    onReset,
    children,
}: {
    show: boolean;
    onReset: () => void;
    children: ReactNode;
}) {
    if (!show) return null;

    return (
        <div className="flex h-10 shrink-0 items-center gap-1 border-b border-line-light px-2">
            {children}
            <button
                type="button"
                onClick={onReset}
                className="ml-auto h-6 rounded-lg px-2 font-medium text-faint hover:bg-fill hover:text-muted"
            >
                Reset
            </button>
        </div>
    );
}

export function FilterChip({ children, onRemove }: { children: ReactNode; onRemove: () => void }) {
    return (
        <span className="flex h-6 items-center gap-1 rounded border border-accent-soft bg-accent-faint pr-0.5 pl-2 text-sm font-medium text-accent">
            {children}
            <button
                type="button"
                aria-label="Remove filter"
                onClick={onRemove}
                className="flex size-5 items-center justify-center rounded hover:bg-accent-soft"
            >
                <IconX size={12} />
            </button>
        </span>
    );
}

// ---------------------------------------------------------------------------
// Floating bulk-action bar (Twenty's style: appears once rows are selected)
// ---------------------------------------------------------------------------

export function BulkBar({
    count,
    onClear,
    onDelete,
    children,
}: {
    count: number;
    onClear: () => void;
    onDelete?: () => void;
    children?: ReactNode;
}) {
    if (count === 0) return null;

    return (
        <div className="fixed bottom-6 left-1/2 z-30 flex h-10 -translate-x-1/2 items-center gap-1 rounded-lg border border-line bg-surface px-1.5 font-medium text-muted shadow-strong">
            <span className="px-2 text-ink">{count} selected</span>
            <span className="h-4 w-px bg-line" />

            {children}

            {onDelete && (
                <button
                    type="button"
                    onClick={onDelete}
                    className="flex h-7 items-center gap-1 rounded-lg px-2 text-danger hover:bg-danger-soft"
                >
                    <IconTrash size={14} /> Delete
                </button>
            )}

            <button
                type="button"
                aria-label="Clear selection"
                onClick={onClear}
                className="flex size-7 items-center justify-center rounded-lg text-faint hover:bg-fill hover:text-ink"
            >
                <IconX size={14} />
            </button>
        </div>
    );
}

// Bulk-assign dropdown: identical markup for leads and deals, only the
// agent list and what happens on pick differ.
export function AssignMenu({
    agents,
    onAssign,
}: {
    agents: { id: number; name: string }[];
    onAssign: (agentId: number | null) => void;
}) {
    return (
        <Dropdown
            openUp
            buttonClassName="flex h-7 items-center gap-1 rounded-lg px-2 hover:bg-fill"
            label={<><IconUserCircle size={14} /> Assign</>}
        >
            {(close) => (
                <>
                    <MenuItem onClick={() => { onAssign(null); close(); }}>
                        <IconUserOff size={16} /> Unassigned
                    </MenuItem>
                    {agents.map((agent) => (
                        <MenuItem key={agent.id} onClick={() => { onAssign(agent.id); close(); }}>
                            <Avatar name={agent.name} /> {agent.name}
                        </MenuItem>
                    ))}
                </>
            )}
        </Dropdown>
    );
}

// ---------------------------------------------------------------------------
// Delete confirmation
// ---------------------------------------------------------------------------

export function ConfirmDeleteModal({
    open,
    title,
    count,
    noun,
    description,
    error,
    pending,
    onCancel,
    onConfirm,
}: {
    open: boolean;
    /** overrides the count/noun heading, e.g. for a single named record */
    title?: ReactNode;
    count?: number;
    /** singular form, e.g. "lead" — pluralised automatically as "leads" */
    noun?: string;
    description?: string;
    error?: string;
    pending: boolean;
    onCancel: () => void;
    onConfirm: () => void;
}) {
    return (
        <Modal open={open} onClose={onCancel}>
            <div className="p-6">
                <h2 className="text-lg font-semibold">
                    {title ?? `Delete ${count} ${count === 1 ? noun : `${noun}s`}?`}
                </h2>
                <p className="mt-2 text-muted">{description ?? "This can't be undone."}</p>
                {error && <p role="alert" className="mt-3 text-sm text-danger">{error}</p>}
                <div className="mt-6 flex justify-end gap-2">
                    <button
                        type="button"
                        onClick={onCancel}
                        className="h-8 rounded-lg border border-fill bg-black/2 px-3 font-medium text-muted hover:bg-app"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={onConfirm}
                        disabled={pending}
                        className="flex h-8 items-center gap-1.5 rounded-lg bg-danger px-3 font-medium text-white hover:bg-[#dd3e42] disabled:opacity-60"
                    >
                        {pending && <Spinner size={14} />}
                        {pending ? "Deleting" : "Delete"}
                    </button>
                </div>
            </div>
        </Modal>
    );
}
