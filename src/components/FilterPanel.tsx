"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
    IconAdjustmentsHorizontal,
    IconCheck,
    IconChevronLeft,
    IconFilter,
    IconGripVertical,
    IconLayoutColumns,
    IconProgress,
    IconSettings,
    IconX,
} from "@tabler/icons-react";

import { api, errorMessage } from "@/lib/api/client";
import { toast } from "@/components/Toast";
import { MultiSelect, Select } from "@/components/Select";
import { Dropdown, MenuItem } from "./Dropdown";
import { FilterChip } from "./ListPage";

/**
 * Shared filter UI for an entity list page (Leads, Deals, Contacts): a
 * "Filter" button that opens a panel with saved filters on the left, the
 * active filter rows (drag to reorder, click to add more) on the right, and
 * a "Manage fields" tab for showing/hiding table columns.
 *
 * Each page supplies its own field definitions (how a field reads/writes its
 * slice of the filters object and renders its own control) and column list;
 * this component only owns the panel chrome, dragging, and saved-filter CRUD.
 */

// ---------------------------------------------------------------------------
// Visibility + order for a set of items, kept in this browser only, not
// synced to a server — a per-device layout preference, not data worth
// sharing. Used for both table columns ("Manage fields" → Columns) and
// filter fields ("Manage fields" → Filters): both are just "which of these
// named things show, and in what order."
// ---------------------------------------------------------------------------

export interface ColumnDef {
    key: string;
    label: string;
    /** starting pixel width for a resizable table column; ignored elsewhere */
    width?: number;
}

interface StoredColumnPrefs {
    order: string[];
    hidden: string[];
}

export function useColumnPrefs(storageKey: string, defaultOrder: string[]) {
    const [order, setOrder] = useState(defaultOrder);
    const [hidden, setHidden] = useState<Set<string>>(new Set());

    // Re-reads whenever the *set* of known keys changes (sorted+joined so the
    // array's reference changing every render doesn't matter) — not just once
    // on mount, since a page's columns can grow after the first render (custom
    // field definitions load in asynchronously, later than the static ones).
    const columnsKey = [...defaultOrder].sort().join(",");

    useEffect(() => {
        let nextOrder = defaultOrder;
        let nextHidden = new Set<string>();

        try {
            const raw = localStorage.getItem(storageKey);

            if (raw) {
                const saved = JSON.parse(raw) as Partial<StoredColumnPrefs>;
                const knownOrder = (saved.order ?? []).filter((key) => defaultOrder.includes(key));
                const missing = defaultOrder.filter((key) => !knownOrder.includes(key));

                nextOrder = [...knownOrder, ...missing];
                nextHidden = new Set((saved.hidden ?? []).filter((key) => defaultOrder.includes(key)));
            }
        } catch {
            // corrupt or blocked storage: fall back to the defaults set above
        }

        setOrder(nextOrder);
        setHidden(nextHidden);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [storageKey, columnsKey]);

    function persist(nextOrder: string[], nextHidden: Set<string>) {
        setOrder(nextOrder);
        setHidden(nextHidden);
        try {
            localStorage.setItem(storageKey, JSON.stringify({ order: nextOrder, hidden: [...nextHidden] }));
        } catch {
            // storage full or blocked: the preference just won't survive a reload
        }
    }

    return {
        order,
        hidden,
        visibleOrder: order.filter((key) => !hidden.has(key)),
        toggle: (key: string) => {
            const next = new Set(hidden);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            persist(order, next);
        },
        reorder: (nextOrder: string[]) => persist(nextOrder, hidden),
    };
}

export type ColumnPrefs = ReturnType<typeof useColumnPrefs>;

const DEFAULT_COLUMN_WIDTH = 160;
const MIN_COLUMN_WIDTH = 80;

// Column prefs + the ordered, visible subset of a page's columns in one call,
// instead of every page re-deriving the same filter/map over its column list.
// Also manages per-column pixel widths (drag-resized in the table header) —
// kept in a separate storage key from order/hidden so the two never clobber
// each other on write.
export function useTableColumns<TColumn extends ColumnDef>(storageKey: string, columns: TColumn[]) {
    const columnPrefs = useColumnPrefs(storageKey, columns.map((column) => column.key));
    const widthsKey = `${storageKey}-widths`;
    const [widths, setWidths] = useState<Record<string, number>>({});

    useEffect(() => {
        try {
            const raw = localStorage.getItem(widthsKey);
            setWidths(raw ? JSON.parse(raw) : {});
        } catch {
            setWidths({});
        }
    }, [widthsKey]);

    function resize(key: string, width: number) {
        setWidths((prev) => {
            const next = { ...prev, [key]: Math.max(MIN_COLUMN_WIDTH, Math.round(width)) };
            try {
                localStorage.setItem(widthsKey, JSON.stringify(next));
            } catch {
                // storage full or blocked: the width just won't survive a reload
            }
            return next;
        });
    }

    const visibleColumns = columnPrefs.visibleOrder
        .map((key) => columns.find((column) => column.key === key))
        .filter((column): column is TColumn => !!column);

    function getWidth(column: TColumn) {
        return widths[column.key] ?? column.width ?? DEFAULT_COLUMN_WIDTH;
    }

    // Drags within the visible list, but reorders the full (incl. hidden)
    // order underneath so a hidden column doesn't lose its place.
    function reorderVisible(fromKey: string, toKey: string) {
        if (fromKey === toKey) return;
        const fullOrder = [...columnPrefs.order];
        const fromIndex = fullOrder.indexOf(fromKey);
        if (fromIndex === -1) return;
        fullOrder.splice(fromIndex, 1);
        const insertAt = fullOrder.indexOf(toKey);
        fullOrder.splice(insertAt === -1 ? fullOrder.length : insertAt, 0, fromKey);
        columnPrefs.reorder(fullOrder);
    }

    return { columnPrefs, visibleColumns, getWidth, resize, reorderVisible };
}

// ---------------------------------------------------------------------------
// Filter fields — each page defines these over its own filters object
// ---------------------------------------------------------------------------

export interface FilterFieldDef<TFilters> {
    key: string;
    label: string;
    /** does this field currently have a real value applied? */
    isActive: (filters: TFilters) => boolean;
    /** what removing this filter sets */
    clear: (filters: TFilters) => Partial<TFilters>;
    renderControl: (filters: TFilters, onChange: (change: Partial<TFilters>) => void) => ReactNode;
    /** chip shown in the list toolbar's active-filter bar; defaults to the label alone */
    renderChip?: (filters: TFilters) => ReactNode;
}

interface SavedFilter {
    id: number;
    name: string;
    filters: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// A plain drag-to-reorder list: native HTML5 drag-and-drop, no library.
// Used for both the active-filter rows and the manage-fields column list.
// ---------------------------------------------------------------------------

function DraggableRows<T>({
    items,
    getKey,
    onReorder,
    renderItem,
}: {
    items: T[];
    getKey: (item: T) => string;
    onReorder: (next: T[]) => void;
    renderItem: (item: T) => ReactNode;
}) {
    const draggedFrom = useRef<number | null>(null);

    function handleDrop(targetIndex: number) {
        const from = draggedFrom.current;
        draggedFrom.current = null;
        if (from === null || from === targetIndex) return;

        const next = [...items];
        const [moved] = next.splice(from, 1);
        next.splice(targetIndex, 0, moved);
        onReorder(next);
    }

    return (
        <>
            {items.map((item, index) => (
                <div
                    key={getKey(item)}
                    draggable
                    onDragStart={() => { draggedFrom.current = index; }}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => handleDrop(index)}
                >
                    {renderItem(item)}
                </div>
            ))}
        </>
    );
}

// ---------------------------------------------------------------------------
// Control renderers shared by every entity's "assigned to" / "created"
// filter — identical markup everywhere, only the agent list differs.
// ---------------------------------------------------------------------------

export const controlClassName =
    "h-8 w-full rounded-lg border border-line bg-surface px-2 outline-none focus:border-accent focus:ring-3 focus:ring-accent-soft";

export function renderSelectControl(
    value: string | number | undefined,
    onChange: (value: string | undefined) => void,
    options: { value: string | number; label: string }[],
    placeholder: string,
) {
    return (
        <Select
            value={value === undefined ? undefined : String(value)}
            onChange={onChange}
            options={options.map((option) => ({ value: String(option.value), label: option.label }))}
            placeholder={placeholder}
        />
    );
}

export function renderAssignedToControl(
    value: string | undefined,
    onChange: (value: string | undefined) => void,
    agents?: { id: number; name: string }[],
) {
    return (
        <Select
            value={value}
            onChange={onChange}
            placeholder="Anyone"
            options={[
                { value: "me", label: "Me" },
                { value: "unassigned", label: "Unassigned" },
                ...(agents?.map((agent) => ({ value: String(agent.id), label: agent.name })) ?? []),
            ]}
        />
    );
}

export function renderCreatedRangeControl(
    createdFrom: string | undefined,
    createdTo: string | undefined,
    onChange: (change: { createdFrom?: string; createdTo?: string }) => void,
) {
    return (
        <div className="flex items-center gap-1">
            <input
                type="date"
                aria-label="Created from"
                value={createdFrom ?? ""}
                onChange={(e) => onChange({ createdFrom: e.target.value || undefined })}
                className={controlClassName}
            />
            <span className="shrink-0 text-faint">to</span>
            <input
                type="date"
                aria-label="Created to"
                value={createdTo ?? ""}
                onChange={(e) => onChange({ createdTo: e.target.value || undefined })}
                className={controlClassName}
            />
        </div>
    );
}

// ---------------------------------------------------------------------------
// Full field factories for the two filters every entity has in exactly the
// same shape. "Assigned to" takes a getter/setter pair because the filters
// object represents it differently per entity (Deals use a real number,
// Leads/Contacts a string) — everything else about it is identical.
// ---------------------------------------------------------------------------

function assignedToLabel(value: string, agents?: { id: number; name: string }[]) {
    if (value === "me") return "Me";
    if (value === "unassigned") return "Unassigned";
    return agents?.find((agent) => String(agent.id) === value)?.name ?? "Agent";
}

export function createAssignedToField<TFilters>(options: {
    get: (filters: TFilters) => string | undefined;
    set: (value: string | undefined) => Partial<TFilters>;
    agents?: { id: number; name: string }[];
}): FilterFieldDef<TFilters> {
    const { get, set, agents } = options;

    return {
        key: "assignedTo",
        label: "Assigned to",
        isActive: (filters) => get(filters) !== undefined,
        clear: () => set(undefined),
        renderControl: (filters, onChange) => renderAssignedToControl(get(filters), (value) => onChange(set(value)), agents),
        renderChip: (filters) => {
            const value = get(filters);
            return value === undefined ? null : `Assigned to: ${assignedToLabel(value, agents)}`;
        },
    };
}

export function createCreatedRangeField<TFilters extends { createdFrom?: string; createdTo?: string }>(): FilterFieldDef<TFilters> {
    return {
        key: "createdRange",
        label: "Created",
        isActive: (filters) => !!filters.createdFrom || !!filters.createdTo,
        clear: () => ({ createdFrom: undefined, createdTo: undefined }) as Partial<TFilters>,
        renderControl: (filters, onChange) =>
            renderCreatedRangeControl(filters.createdFrom, filters.createdTo, (change) => onChange(change as Partial<TFilters>)),
        renderChip: (filters) => `Created: ${filters.createdFrom ?? "…"} – ${filters.createdTo ?? "…"}`,
    };
}

// When a record was last changed, from one day to another
export function createModifiedRangeField<TFilters extends { updatedFrom?: string; updatedTo?: string }>(): FilterFieldDef<TFilters> {
    return {
        key: "modifiedRange",
        label: "Last modified",
        isActive: (filters) => !!filters.updatedFrom || !!filters.updatedTo,
        clear: () => ({ updatedFrom: undefined, updatedTo: undefined }) as Partial<TFilters>,
        // the date control reports whichever end changed, as createdFrom / createdTo
        renderControl: (filters, onChange) =>
            renderCreatedRangeControl(filters.updatedFrom, filters.updatedTo, (change) =>
                onChange({
                    ...("createdFrom" in change && { updatedFrom: change.createdFrom }),
                    ...("createdTo" in change && { updatedTo: change.createdTo }),
                } as Partial<TFilters>),
            ),
        renderChip: (filters) => `Modified: ${filters.updatedFrom ?? "…"} – ${filters.updatedTo ?? "…"}`,
    };
}

// "Created by" / "Modified by": you, or one teammate
export function createPersonField<TFilters>(options: {
    key: string;
    label: string;
    get: (filters: TFilters) => string | undefined;
    set: (value: string | undefined) => Partial<TFilters>;
    agents?: { id: number; name: string }[];
}): FilterFieldDef<TFilters> {
    const { key, label, get, set, agents } = options;
    const nameOf = (value: string) => (value === "me" ? "Me" : (agents?.find((agent) => String(agent.id) === value)?.name ?? "Someone"));

    return {
        key,
        label,
        isActive: (filters) => get(filters) !== undefined,
        clear: () => set(undefined),
        renderControl: (filters, onChange) =>
            renderSelectControl(
                get(filters),
                (value) => onChange(set(value)),
                [{ value: "me", label: "Me" }, ...(agents?.map((agent) => ({ value: String(agent.id), label: agent.name })) ?? [])],
                "Anyone",
            ),
        renderChip: (filters) => {
            const value = get(filters);
            return value === undefined ? null : `${label}: ${nameOf(value)}`;
        },
    };
}

// Several values at once, like "New or Screening": a dropdown you tick as many as you like in
export function createMultiSelectField<TFilters>(options: {
    key: string;
    label: string;
    get: (filters: TFilters) => number[] | undefined;
    set: (value: number[] | undefined) => Partial<TFilters>;
    options: { value: number; label: string; render?: ReactNode }[];
}): FilterFieldDef<TFilters> {
    const { key, label, get, set } = options;
    const choices = options.options;

    return {
        key,
        label,
        isActive: (filters) => (get(filters)?.length ?? 0) > 0,
        clear: () => set(undefined),
        renderControl: (filters, onChange) => (
            <MultiSelect
                values={(get(filters) ?? []).map(String)}
                onChange={(values) => onChange(set(values.length > 0 ? values.map(Number) : undefined))}
                options={choices.map((choice) => ({ value: String(choice.value), label: choice.label, render: choice.render }))}
                placeholder={`Any ${label.toLowerCase()}`}
            />
        ),
        renderChip: (filters) => {
            const names = (get(filters) ?? []).map((value) => choices.find((choice) => choice.value === value)?.label ?? "…");
            return `${label}: ${names.length > 2 ? `${names.slice(0, 2).join(", ")} +${names.length - 2}` : names.join(", ")}`;
        },
    };
}

// ---------------------------------------------------------------------------
// Active filters, shown as removable chips below the toolbar — driven
// entirely by the field defs, so no page hand-lists its own chips.
// ---------------------------------------------------------------------------

export function ActiveFilterChips<TFilters>({
    fields,
    filters,
    onChange,
}: {
    fields: FilterFieldDef<TFilters>[];
    filters: TFilters;
    onChange: (change: Partial<TFilters>) => void;
}) {
    return (
        <>
            {fields.filter((field) => field.isActive(filters)).map((field) => (
                <FilterChip key={field.key} onRemove={() => onChange(field.clear(filters))}>
                    {field.renderChip ? field.renderChip(filters) : field.label}
                </FilterChip>
            ))}
        </>
    );
}

// ---------------------------------------------------------------------------
// "Options": column visibility for this list, plus shortcuts to the admin
// screens that shape this entity (custom fields, pipeline stages, source
// list) — separate from "Filter", which only ever touches filtering.
// ---------------------------------------------------------------------------

export function OptionsMenuButton<TColumn extends ColumnDef>({
    columns,
    columnPrefs,
    canManageCustomFields,
    extraLinks,
}: {
    columns: TColumn[];
    columnPrefs: ColumnPrefs;
    canManageCustomFields?: boolean;
    /** this entity's other admin-editable lists, e.g. [{ label: "Pipeline stages", href: "/settings/stages" }] */
    extraLinks?: { label: string; href: string }[];
}) {
    return (
        <Dropdown
            align="right"
            buttonClassName="flex h-7 items-center gap-1 rounded-lg px-2 hover:bg-fill"
            panelClassName="w-64 p-1"
            label={<><IconAdjustmentsHorizontal size={14} /> Options</>}
        >
            {(close) => (
                <OptionsMenuContent
                    columns={columns}
                    columnPrefs={columnPrefs}
                    canManageCustomFields={canManageCustomFields}
                    extraLinks={extraLinks}
                    close={close}
                />
            )}
        </Dropdown>
    );
}

// A fresh instance each time the dropdown opens, so "which submenu is open"
// resets to the top-level menu instead of remembering the last one shown.
function OptionsMenuContent<TColumn extends ColumnDef>({
    columns,
    columnPrefs,
    canManageCustomFields,
    extraLinks,
    close,
}: {
    columns: TColumn[];
    columnPrefs: ColumnPrefs;
    canManageCustomFields?: boolean;
    extraLinks?: { label: string; href: string }[];
    close: () => void;
}) {
    const router = useRouter();
    const [showColumns, setShowColumns] = useState(false);

    if (showColumns) {
        return (
            <>
                <button
                    type="button"
                    onClick={() => setShowColumns(false)}
                    className="flex h-8 w-full items-center gap-1.5 rounded px-1.5 text-left text-sm font-medium text-muted hover:bg-fill hover:text-ink"
                >
                    <IconChevronLeft size={14} /> Column visibility
                </button>
                <div className="my-1 h-px bg-line-light" />
                <div className="max-h-60 overflow-y-auto">
                    <ManageList items={columns} prefs={columnPrefs} />
                </div>
            </>
        );
    }

    return (
        <>
            <MenuItem onClick={() => setShowColumns(true)}>
                <IconLayoutColumns size={16} /> Column visibility
            </MenuItem>
            {canManageCustomFields && (
                <MenuItem onClick={() => { close(); router.push("/settings/custom-fields"); }}>
                    <IconSettings size={16} /> Custom fields
                </MenuItem>
            )}
            {extraLinks?.map((link) => (
                <MenuItem key={link.href} onClick={() => { close(); router.push(link.href); }}>
                    <IconProgress size={16} /> {link.label}
                </MenuItem>
            ))}
        </>
    );
}

// ---------------------------------------------------------------------------
// The panel itself
// ---------------------------------------------------------------------------

interface FilterPanelButtonProps<TFilters> {
    /** keys the saved-filters API and the per-browser column storage by */
    entity: "lead" | "deal" | "contact";
    filters: TFilters;
    onChange: (change: Partial<TFilters>) => void;
    fields: FilterFieldDef<TFilters>[];
}

export function FilterPanelButton<TFilters extends object>(props: FilterPanelButtonProps<TFilters>) {
    const activeCount = props.fields.filter((field) => field.isActive(props.filters)).length;
    // Which filter fields show as rows — same kind of per-browser preference
    // as column visibility, so it reuses the same hook. Declared here (not
    // inside the panel's content) so it survives the panel closing.
    const fieldPrefs = useColumnPrefs(`${props.entity}-filters`, props.fields.map((field) => field.key));

    return (
        <Dropdown
            align="right"
            buttonClassName="flex h-7 items-center gap-1 rounded-lg px-2 hover:bg-fill"
            panelClassName="w-200 p-0"
            label={
                <>
                    <IconFilter size={14} />
                    Filter
                    {activeCount > 0 && (
                        <span className="flex size-4 items-center justify-center rounded-full bg-accent text-[10px] font-semibold text-on-accent">
                            {activeCount}
                        </span>
                    )}
                </>
            }
        >
            {() => <FilterPanelContent {...props} fieldPrefs={fieldPrefs} />}
        </Dropdown>
    );
}

function FilterPanelContent<TFilters extends object>({
    entity,
    filters,
    onChange,
    fields,
    fieldPrefs,
}: FilterPanelButtonProps<TFilters> & { fieldPrefs: ColumnPrefs }) {
    const [tab, setTab] = useState<"filters" | "fields">("filters");

    const queryClient = useQueryClient();

    const savedFiltersQuery = useQuery({
        queryKey: ["savedFilters", entity],
        queryFn: () =>
            api.get<{ data: SavedFilter[] }>("/saved-filters", { params: { entity } }).then((res) => res.data.data),
    });

    const saveFilter = useMutation({
        mutationFn: (name: string) => api.post("/saved-filters", { entity, name, filters }),
        onSuccess: () => {
            toast.success("Filter saved");
            queryClient.invalidateQueries({ queryKey: ["savedFilters", entity] });
        },
        onError: (error) => toast.error(errorMessage(error)),
    });

    const deleteSavedFilter = useMutation({
        mutationFn: (id: number) => api.delete(`/saved-filters/${id}`),
        onSuccess: () => {
            toast.success("Filter deleted");
            queryClient.invalidateQueries({ queryKey: ["savedFilters", entity] });
        },
        onError: (error) => toast.error(errorMessage(error)),
    });

    // A saved filter only ever contains the fields that were active when it
    // was saved, so every field resets to unset (via its own `clear`) before
    // the saved values are applied on top.
    function applySavedFilter(saved: Partial<TFilters>) {
        const reset = fields.reduce<Partial<TFilters>>((acc, field) => ({ ...acc, ...field.clear(filters) }), {});
        onChange({ ...reset, ...saved });
    }

    const visibleFields = fieldPrefs.visibleOrder
        .map((key) => fields.find((field) => field.key === key))
        .filter((field): field is FilterFieldDef<TFilters> => !!field);

    return (
        // 500px tall, or less on a short (phone) screen
        <div className="flex h-[min(31.25rem,calc(100dvh-9rem))]">
            {/* Saved filters (from a bit wider than a phone: on one, the filters themselves need the room) */}
            <div className="hidden w-45 shrink-0 flex-col border-r border-line-light p-2 sm:flex">
                <p className="px-1.5 py-1 text-xs font-semibold text-faint">Saved filters</p>
                <div className="min-h-0 flex-1 overflow-y-auto">
                    {savedFiltersQuery.data?.map((saved) => (
                        <div key={saved.id} className="group flex items-center">
                            <button
                                type="button"
                                onClick={() => applySavedFilter(saved.filters as Partial<TFilters>)}
                                className="flex h-7 flex-1 items-center truncate rounded px-1.5 text-left hover:bg-fill"
                            >
                                {saved.name}
                            </button>
                            <button
                                type="button"
                                aria-label={`Delete saved filter ${saved.name}`}
                                onClick={() => deleteSavedFilter.mutate(saved.id)}
                                className="hidden size-6 shrink-0 items-center justify-center rounded text-faint hover:bg-danger-soft hover:text-danger group-hover:flex"
                            >
                                <IconX size={12} />
                            </button>
                        </div>
                    ))}
                    {savedFiltersQuery.data?.length === 0 && (
                        <p className="px-1.5 py-2 text-faint">No saved filters yet</p>
                    )}
                </div>
            </div>

            {/* Filters / Manage fields */}
            <div className="flex min-w-0 flex-1 flex-col">
                <div className="flex h-9 shrink-0 items-center gap-1 border-b border-line-light px-2">
                    <TabButton active={tab === "filters"} onClick={() => setTab("filters")}>
                        Filters
                    </TabButton>
                    <TabButton active={tab === "fields"} onClick={() => setTab("fields")}>
                        <IconLayoutColumns size={14} /> Manage fields
                    </TabButton>
                    {/* every filter off in one go (each field knows how to clear itself) */}
                    {fields.some((field) => field.isActive(filters)) && (
                        <button
                            type="button"
                            onClick={() => onChange(fields.reduce<Partial<TFilters>>((acc, field) => ({ ...acc, ...field.clear(filters) }), {}))}
                            className="ml-auto flex h-7 items-center gap-1 rounded-lg px-2 text-sm font-medium text-muted hover:bg-fill hover:text-ink"
                        >
                            <IconX size={13} />
                            Clear all
                        </button>
                    )}
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto p-2">
                    {tab === "filters" ? (
                        <DraggableRows
                            items={visibleFields}
                            getKey={(field) => field.key}
                            onReorder={(next) => fieldPrefs.reorder(next.map((field) => field.key))}
                            renderItem={(field) => (
                                <div className="flex items-start gap-1 py-1">
                                    <span className="mt-4.5 cursor-grab text-light" title="Drag to reorder">
                                        <IconGripVertical size={14} />
                                    </span>
                                    <div className="min-w-0 flex-1">
                                        <p className="mb-1 px-0.5 text-xs font-semibold text-faint">
                                            {field.label.toUpperCase()}
                                        </p>
                                        {field.renderControl(filters, onChange)}
                                    </div>
                                    <button
                                        type="button"
                                        aria-label={`Remove ${field.label} filter`}
                                        onClick={() => {
                                            fieldPrefs.toggle(field.key);
                                            onChange(field.clear(filters));
                                        }}
                                        className="mt-4.5 flex size-6 shrink-0 items-center justify-center rounded text-faint hover:bg-fill hover:text-ink"
                                    >
                                        <IconX size={14} />
                                    </button>
                                </div>
                            )}
                        />
                    ) : (
                        <ManageList items={fields} prefs={fieldPrefs} />
                    )}
                </div>

                {tab === "filters" && fields.some((field) => field.isActive(filters)) && (
                    <div className="border-t border-line-light p-2">
                        <SaveFilterRow onSave={(name) => saveFilter.mutate(name)} pending={saveFilter.isPending} />
                    </div>
                )}
            </div>
        </div>
    );
}

// The checkbox + drag-reorder list used by both "Manage fields" sections
// (Filters and Columns) — they're the same interaction over different items.
function ManageList({ items, prefs }: { items: { key: string; label: string }[]; prefs: ColumnPrefs }) {
    return (
        <DraggableRows
            items={items.map((item) => ({ ...item, hidden: prefs.hidden.has(item.key) }))}
            getKey={(item) => item.key}
            onReorder={(next) => prefs.reorder(next.map((item) => item.key))}
            renderItem={(item) => (
                <label className="flex h-8 items-center gap-2 rounded px-1 hover:bg-fill">
                    <span className="cursor-grab text-light" title="Drag to reorder">
                        <IconGripVertical size={14} />
                    </span>
                    <input
                        type="checkbox"
                        checked={!item.hidden}
                        onChange={() => prefs.toggle(item.key)}
                        className="size-3.5 accent-accent"
                    />
                    {item.label}
                </label>
            )}
        />
    );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`flex h-7 items-center gap-1 rounded-lg px-2 font-medium
                ${active ? "bg-fill text-ink" : "text-faint hover:bg-fill hover:text-ink"}`}
        >
            {children}
        </button>
    );
}

function SaveFilterRow({ onSave, pending }: { onSave: (name: string) => void; pending: boolean }) {
    const [name, setName] = useState("");

    return (
        <form
            onSubmit={(e) => {
                e.preventDefault();
                if (name.trim()) {
                    onSave(name.trim());
                    setName("");
                }
            }}
            className="flex items-center gap-1"
        >
            <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Name this filter..."
                className="h-7 min-w-0 flex-1 rounded-lg border border-line px-2 text-sm outline-none placeholder:text-light focus:border-accent"
            />
            <button
                type="submit"
                disabled={!name.trim() || pending}
                className="flex h-7 shrink-0 items-center gap-1 rounded-lg bg-accent px-2 text-sm font-medium text-on-accent hover:bg-accent-hover disabled:opacity-60"
            >
                <IconCheck size={14} />
                Save
            </button>
        </form>
    );
}
