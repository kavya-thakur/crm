"use client";

import { useEffect, useRef, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { api, toQueryParams } from "@/lib/api/client";
import { usePaging, useUrlState } from "./useUrlState";

interface Page<T> {
    data: T[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
}

interface UseListQueryOptions<TFilters> {
    enabled?: boolean;
    // Turns the debounced search text into the filter patch to apply, so each
    // resource can decide how it represents an empty search.
    onSearch: (trimmed: string) => Partial<TFilters>;
}

// The filters saved in the URL (?filters={"stageIds":[3]}), or nothing if it's missing or garbled
function filtersFromUrl(raw: string | null): object {
    try {
        const parsed: unknown = raw ? JSON.parse(raw) : {};
        return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch {
        return {};
    }
}

// Shared by every list view: one page of rows at a time (the page and its size are picked in the
// Pagination bar), a 300ms-debounced search box, and a row-selection set that clears whenever
// the result set can change under it. The filters (search and sort included), the page and the
// page size live in the URL, so a refresh keeps them.
export function useListQuery<TItem, TFilters extends { sortBy: string; sortOrder: "asc" | "desc" }>(
    key: string,
    url: string,
    initialFilters: TFilters,
    { enabled = true, onSearch }: UseListQueryOptions<TFilters>,
) {
    const page = useUrlState();
    const [filters, setFilters] = useState<TFilters>(() => ({ ...initialFilters, ...filtersFromUrl(page.get("filters")) }));
    const [searchInput, setSearchInputState] = useState(() => String((filters as { search?: unknown }).search ?? ""));
    const [selected, setSelected] = useState<Set<number>>(new Set());

    const paging = usePaging();

    // Keep the URL in step: only what differs from the defaults, so it stays short (and a page
    // with no filters has none in its URL). Different filters match different rows, so they start
    // again from page 1; but not on the first run, or a refresh on page 3 would lose its page.
    const filtersKey = JSON.stringify(filters);
    const filtersBefore = useRef(filtersKey);
    useEffect(() => {
        const defaults = initialFilters as Record<string, unknown>;
        const changed = Object.entries(filters).filter(
            ([key, value]) => value !== undefined && value !== "" && JSON.stringify(value) !== JSON.stringify(defaults[key]),
        );
        const fresh = filtersKey !== filtersBefore.current;
        filtersBefore.current = filtersKey;
        page.set({ filters: changed.length > 0 ? JSON.stringify(Object.fromEntries(changed)) : null, ...(fresh && { page: null }) });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filtersKey]);

    function updateFilters(change: Partial<TFilters>) {
        setFilters((current) => ({ ...current, ...change }));
        // rows may disappear, so don't keep acting on ones the user can't see
        setSelected(new Set());
    }

    function setSearchInput(value: string) {
        setSearchInputState(value);
        setSelected(new Set());
    }

    // Search once typing pauses, instead of one request per key
    useEffect(() => {
        const timer = setTimeout(() => {
            setFilters((current) => ({ ...current, ...onSearch(searchInput.trim()) }));
        }, 300);
        return () => clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchInput]);

    // The page being looked at; the last one stays on screen (dimmed by the caller if it likes)
    // until the next arrives
    const query = useQuery({
        queryKey: [key, "list", filters, paging.page, paging.size],
        queryFn: () =>
            api
                .get<Page<TItem>>(url, { params: { ...toQueryParams(filters), page: paging.page, limit: paging.size } })
                .then((res) => res.data),
        placeholderData: keepPreviousData,
        enabled,
    });

    // past the last page (rows were deleted, or an old link): go to the last one there is
    const pages = query.data?.pagination.totalPages;
    useEffect(() => {
        if (pages && paging.page > pages) paging.setPage(pages);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pages, paging.page]);

    const items = query.data?.data ?? [];
    const total = query.data?.pagination.total;

    return { query, items, total, paging, filters, updateFilters, searchInput, setSearchInput, selected, setSelected };
}
