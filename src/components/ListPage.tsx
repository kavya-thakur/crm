"use client";

import { useState, type ComponentType, type ReactNode } from "react";
import {
    IconArrowDown,
    IconArrowLeft,
    IconArrowUp,
    IconArrowsSort,
    IconCalendar,
    IconCheck,
    IconChevronDown,
    IconChevronLeft,
    IconChevronRight,
    IconDownload,
    IconHash,
    IconLayoutKanban,
    IconLayoutList,
    IconLetterCase,
    IconList,
    IconPencil,
    IconPlus,
    IconSearch,
    IconTrash,
    IconUserCircle,
    IconUserOff,
    IconX,
} from "@tabler/icons-react";

import { Avatar } from "./Avatar";
import { SectionIcon, type Section } from "./SectionIcon";
import { Dropdown, MenuItem, SearchableItems } from "./Dropdown";
import { Spinner } from "./Loader";
import { toQueryParams } from "@/lib/api/client";
import { Modal } from "./Modal";
import { SidePanel } from "./SidePanel";
import { Select, type SelectOption } from "./Select";

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
            <h1 className="font-display text-[15px] font-semibold tracking-[-0.01em]">{title}</h1>
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

// The toolbar's quiet buttons (Filter, Sort, Options, Import, Export) all look like this
export const toolbarButtonClassName = "flex h-7 items-center gap-1 rounded-lg px-2 hover:bg-fill";

/**
 * Downloads the list as a CSV: the same endpoint as the list, with ?format=csv and the
 * filters on screen, so the file is exactly what's shown. A plain link, so the browser
 * handles the download (and the login cookie goes with it).
 */
// Starts a download from a menu item, as a plain download link would: the page stays put
export function downloadFile(url: string) {
    Object.assign(document.createElement("a"), { href: url, download: "" }).click();
}

export function exportUrl(endpoint: string, filters: object) {
    const params = new URLSearchParams(Object.entries({ ...toQueryParams(filters), format: "csv" }).map(([key, value]) => [key, String(value)]));
    return `/api${endpoint}?${params}`;
}

export function ExportButton({ endpoint, filters }: { endpoint: string; filters: object }) {
    return (
        <a href={exportUrl(endpoint, filters)} download className={toolbarButtonClassName} title="Download what's on screen as a CSV file">
            <IconDownload size={14} />
            Export
        </a>
    );
}

// The bar under a list: how many rows a page shows, which rows these are, and the way to the
// next and previous page. `page` and `size` come from usePaging (kept in the URL).
export function Pagination({
    page,
    size,
    total,
    sizes,
    onPage,
    onSize,
}: {
    page: number;
    size: number;
    total: number | undefined;
    sizes: readonly number[];
    onPage: (page: number) => void;
    onSize: (size: number) => void;
}) {
    const count = total ?? 0;
    const pages = Math.max(1, Math.ceil(count / size));
    const first = count === 0 ? 0 : (page - 1) * size + 1;
    const last = Math.min(page * size, count);
    const arrow = "flex size-7 items-center justify-center rounded-lg text-muted hover:bg-fill hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent";

    return (
        <div className="flex h-10 shrink-0 items-center gap-3 border-t border-line-light bg-surface px-3 text-sm text-muted">
            <span className="flex items-center gap-2">
                <span className="hidden sm:inline">Rows per page</span>
                <span className="w-18">
                    <Select value={String(size)} onChange={(value) => value && onSize(Number(value))} options={sizes.map((option) => ({ value: String(option), label: String(option) }))} placeholder="50" />
                </span>
            </span>
            <span className="ml-auto tabular-nums">
                {total === undefined ? "…" : `${first.toLocaleString()}–${last.toLocaleString()} of ${count.toLocaleString()}`}
            </span>
            <span className="flex items-center gap-1">
                <button type="button" aria-label="Previous page" disabled={page <= 1} onClick={() => onPage(page - 1)} className={arrow}>
                    <IconChevronLeft size={15} />
                </button>
                <span className="tabular-nums">
                    Page {Math.min(page, pages).toLocaleString()} of {pages.toLocaleString()}
                </span>
                <button type="button" aria-label="Next page" disabled={page >= pages} onClick={() => onPage(page + 1)} className={arrow}>
                    <IconChevronRight size={15} />
                </button>
            </span>
        </div>
    );
}

// ---------------------------------------------------------------------------
// View switcher (List / Kanban), search box, sort menu — the toolbar row
// ---------------------------------------------------------------------------

// Same two names on every page, so people learn them once
export function ViewSwitcher({ view, onChange }: { view: "table" | "board"; onChange: (view: "table" | "board") => void }) {
    return (
        <Dropdown
            buttonClassName="flex h-7 items-center gap-1 rounded-lg px-2 hover:bg-fill"
            label={
                <>
                    {view === "table" ? <IconLayoutList size={16} /> : <IconLayoutKanban size={16} />}
                    {view === "table" ? "List" : "Kanban"}
                    <IconChevronDown size={14} className="text-faint" />
                </>
            }
        >
            {(close) => (
                <>
                    <MenuItem selected={view === "table"} onClick={() => { onChange("table"); close(); }}>
                        <IconLayoutList size={16} /> List
                    </MenuItem>
                    <MenuItem selected={view === "board"} onClick={() => { onChange("board"); close(); }}>
                        <IconLayoutKanban size={16} /> Kanban
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
        // on a phone it scrolls sideways rather than running off the screen
        <div className="fixed bottom-6 left-1/2 z-30 flex h-10 max-w-[calc(100vw-1rem)] -translate-x-1/2 items-center gap-1 overflow-x-auto rounded-lg border border-line bg-surface px-1.5 font-medium text-muted shadow-strong [&>*]:shrink-0">
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
                    <SearchableItems items={agents} label={(agent) => agent.name}>
                        {(agent) => (
                            <MenuItem key={agent.id} onClick={() => { onAssign(agent.id); close(); }}>
                                <Avatar name={agent.name} /> {agent.name}
                            </MenuItem>
                        )}
                    </SearchableItems>
                </>
            )}
        </Dropdown>
    );
}

// One field bulk edit can set, and how its value is sent to the bulk API
export interface BulkField {
    key: string;
    label: string;
    type: "text" | "number" | "date" | "select";
    /** defaults to an icon for the field's type */
    icon?: ComponentType<{ size?: number; className?: string }>;
    options?: SelectOption[];
    /** can be emptied on every selected record */
    clearable?: boolean;
    /** the picked value ("" = empty) as the bulk API's changes, e.g. { sourceId: 4 } */
    toChanges: (value: string) => Record<string, unknown>;
}

const TYPE_ICONS = { text: IconLetterCase, number: IconHash, date: IconCalendar, select: IconList };

// "Edit field" in the bulk bar: opens a side panel, like a record's, where you pick a field
// and give it a value that every selected record gets. Other fields aren't touched.
export function BulkEditButton({
    count,
    noun,
    fields,
    pending,
    onApply,
}: {
    count: number;
    /** singular, e.g. "lead" */
    noun: string;
    fields: BulkField[];
    pending: boolean;
    onApply: (changes: Record<string, unknown>) => void;
}) {
    const [open, setOpen] = useState(false);

    if (fields.length === 0) return null;

    return (
        <>
            <button type="button" onClick={() => setOpen(true)} className="flex h-7 items-center gap-1 rounded-lg px-2 hover:bg-fill">
                <IconPencil size={14} /> Edit field
            </button>

            {/* SidePanel mounts its content fresh each time it opens, so the form always starts at step 1 */}
            <SidePanel open={open} onClose={() => setOpen(false)}>
                <BulkEditForm
                    nouns={`${count} ${count === 1 ? noun : `${noun}s`}`}
                    noun={noun}
                    fields={fields}
                    pending={pending}
                    onCancel={() => setOpen(false)}
                    onApply={(changes) => {
                        onApply(changes);
                        setOpen(false);
                    }}
                />
            </SidePanel>
        </>
    );
}

// Two steps, and no dropdowns (a panel's own scroll would hide their menus): pick a field
// from a list, then pick its value from a list, or type it.
function BulkEditForm({
    nouns,
    noun,
    fields,
    pending,
    onCancel,
    onApply,
}: {
    nouns: string;
    noun: string;
    fields: BulkField[];
    pending: boolean;
    onCancel: () => void;
    onApply: (changes: Record<string, unknown>) => void;
}) {
    const [key, setKey] = useState<string | null>(null);
    // "" is a real choice ("Empty") for a field that can be cleared
    const [value, setValue] = useState<string | null>(null);
    const [search, setSearch] = useState("");

    const field = fields.find((item) => item.key === key);
    const ready = field !== undefined && value !== null && (value !== "" || field.clearable);
    const shownFields = fields.filter((item) => item.label.toLowerCase().includes(search.trim().toLowerCase()));

    function pick(next: BulkField) {
        setKey(next.key);
        // typed values start empty; list values start with nothing picked
        setValue(next.type === "select" ? null : "");
    }

    return (
        <form
            className="flex h-full flex-col"
            onSubmit={(event) => {
                event.preventDefault();
                if (field && ready) onApply(field.toChanges(value));
            }}
        >
            <header className="flex h-12 shrink-0 items-center gap-2 border-b border-line-light px-4">
                <IconPencil size={16} className="text-faint" />
                <h2 className="font-semibold">Edit {nouns}</h2>
                <button
                    type="button"
                    aria-label="Close"
                    onClick={onCancel}
                    className="ml-auto flex size-7 items-center justify-center rounded-lg text-faint hover:bg-fill hover:text-ink"
                >
                    <IconX size={16} />
                </button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
                {!field ? (
                    <>
                        <p className="text-muted">Pick a field. Every selected {noun} gets the value you give it; their other fields stay as they are.</p>

                        {fields.length > 7 && (
                            <label className="mt-4 flex h-8 items-center gap-2 rounded-lg border border-line px-2 focus-within:border-accent focus-within:ring-3 focus-within:ring-accent-soft">
                                <IconSearch size={14} className="shrink-0 text-faint" />
                                <input
                                    autoFocus
                                    value={search}
                                    onChange={(event) => setSearch(event.target.value)}
                                    placeholder="Search fields"
                                    className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-light"
                                />
                            </label>
                        )}

                        <ul className="mt-3 flex flex-col gap-0.5">
                            {shownFields.map((item) => {
                                const Icon = item.icon ?? TYPE_ICONS[item.type];
                                return (
                                    <li key={item.key}>
                                        <button
                                            type="button"
                                            onClick={() => pick(item)}
                                            className="group flex h-9 w-full items-center gap-2.5 rounded-lg px-2 text-left hover:bg-fill"
                                        >
                                            <Icon size={16} className="shrink-0 text-faint" />
                                            <span className="flex-1 text-ink">{item.label}</span>
                                            <IconChevronRight size={14} className="text-light group-hover:text-muted" />
                                        </button>
                                    </li>
                                );
                            })}
                            {shownFields.length === 0 && <li className="px-2 py-3 text-faint">No field called &ldquo;{search}&rdquo;</li>}
                        </ul>
                    </>
                ) : (
                    <>
                        <button
                            type="button"
                            onClick={() => setKey(null)}
                            className="-ml-1 flex h-7 items-center gap-1 rounded-lg px-1 text-sm font-medium text-muted hover:bg-fill hover:text-ink"
                        >
                            <IconArrowLeft size={14} /> All fields
                        </button>

                        <h3 className="mt-3 text-[15px] font-semibold text-ink">{field.label}</h3>
                        <p className="mt-0.5 text-sm text-faint">The new value for all {nouns}</p>

                        {field.type === "select" ? (
                            <ul role="radiogroup" aria-label={field.label} className="mt-3 flex flex-col gap-0.5">
                                {[...(field.clearable ? [{ value: "", label: "Empty" }] : []), ...(field.options ?? [])].map((option) => {
                                    const picked = value === option.value;
                                    return (
                                        <li key={option.value}>
                                            <button
                                                type="button"
                                                role="radio"
                                                aria-checked={picked}
                                                onClick={() => setValue(option.value)}
                                                className={`flex h-9 w-full items-center gap-2.5 rounded-lg px-2 text-left ${
                                                    picked ? "bg-accent-faint text-ink ring-1 ring-accent/30 ring-inset" : "hover:bg-fill"
                                                }`}
                                            >
                                                <span className="min-w-0 flex-1 truncate">
                                                    {option.value === "" ? <span className="text-faint">Empty (clear it)</span> : (option.render ?? option.label)}
                                                </span>
                                                {picked && <IconCheck size={15} className="shrink-0 text-accent" />}
                                            </button>
                                        </li>
                                    );
                                })}
                            </ul>
                        ) : (
                            <input
                                autoFocus
                                type={field.type}
                                value={value ?? ""}
                                onChange={(event) => setValue(event.target.value)}
                                placeholder={field.clearable ? "Leave empty to clear it" : `New ${field.label.toLowerCase()}`}
                                className="mt-3 h-9 w-full rounded-lg border border-line px-2.5 outline-none placeholder:text-light focus:border-accent focus:ring-3 focus:ring-accent-soft"
                            />
                        )}
                    </>
                )}
            </div>

            <footer className="flex shrink-0 justify-end gap-2 border-t border-line-light px-4 py-3">
                <button type="button" onClick={onCancel} className="h-8 rounded-lg border border-fill bg-black/2 px-3 font-medium text-muted hover:bg-app">
                    Cancel
                </button>
                <button
                    type="submit"
                    disabled={!ready || pending}
                    className="flex h-8 items-center gap-1.5 rounded-lg bg-accent px-3 font-medium text-on-accent hover:bg-accent-hover disabled:opacity-60"
                >
                    {pending && <Spinner size={14} />}
                    Apply to {nouns}
                </button>
            </footer>
        </form>
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
