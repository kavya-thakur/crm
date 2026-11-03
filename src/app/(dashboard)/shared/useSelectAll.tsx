"use client";

import { useState } from "react";

import { api, toQueryParams } from "@/lib/api/client";
import { INSTANT_BULK_LIMIT } from "@/lib/validations/common";

/**
 * "Select all 4,230 matching": on top of the rows ticked in a list, every record the filters
 * match. Used by the leads, deals and contacts lists.
 *  - `big`: the selection is too large to change in one request, so bulk actions run as a
 *    background job (startBulkJob) instead of the list's bulkUpdate route
 *  - `ids()`: the ids to act on: every match (asked of the list endpoint with ?format=ids, so
 *    the same filters and permissions) or just the ticked rows
 * Changing the filters changes what "all" means, so it's dropped then.
 */
export function useSelectAll({
    endpoint,
    filters,
    total,
    items,
    selected,
    setSelected,
}: {
    endpoint: string;
    filters: object;
    total: number | undefined;
    items: { id: number }[];
    selected: Set<number>;
    setSelected: (next: Set<number>) => void;
}) {
    const [allMatching, setAllMatching] = useState(false);
    const filtersKey = JSON.stringify(filters);
    const [filtersWhenAll, setFiltersWhenAll] = useState(filtersKey);
    if (filtersKey !== filtersWhenAll) {
        setFiltersWhenAll(filtersKey);
        if (allMatching) setAllMatching(false);
    }

    return {
        allMatching,
        count: allMatching ? (total ?? selected.size) : selected.size,
        big: allMatching || selected.size > INSTANT_BULK_LIMIT,
        // everything loaded is ticked, but the filters match more
        canSelectAll: items.length > 0 && items.every((item) => selected.has(item.id)) && (total ?? 0) > items.length,
        total: total ?? 0,
        loaded: items.length,
        selectAll: () => setAllMatching(true),
        clear: () => {
            setAllMatching(false);
            setSelected(new Set());
        },
        // unticking a row means it's no longer "all of them"
        onSelect: (next: Set<number>) => {
            setAllMatching(false);
            setSelected(next);
        },
        ids: async () =>
            allMatching ? (await api.get<{ data: number[] }>(endpoint, { params: { ...toQueryParams(filters), format: "ids" } })).data.data : [...selected],
    };
}

export type Selection = ReturnType<typeof useSelectAll>;

// The bar above a list that offers "Select all 4,230 matching leads"
export function SelectAllBar({ selection, noun }: { selection: Selection; noun: string }) {
    if (!selection.allMatching && !selection.canSelectAll) return null;

    return (
        <div className="flex h-9 shrink-0 items-center justify-center gap-2 border-b border-line-light bg-accent-faint text-sm text-ink">
            {selection.allMatching ? (
                <>
                    All {selection.total.toLocaleString()} {noun}s matching your filters are selected.
                    <button type="button" onClick={selection.clear} className="font-medium text-accent hover:underline">
                        Clear selection
                    </button>
                </>
            ) : (
                <>
                    All {selection.loaded.toLocaleString()} {noun}s shown are selected.
                    <button type="button" onClick={selection.selectAll} className="font-medium text-accent hover:underline">
                        Select all {selection.total.toLocaleString()} matching {noun}s
                    </button>
                </>
            )}
        </div>
    );
}
