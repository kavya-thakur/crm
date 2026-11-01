"use client";

import { useEffect, useState } from "react";
import { keepPreviousData, useInfiniteQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";

interface Page<T> {
    data: T[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
}

// Custom-field filter values travel as a plain object in `filters.customFields`
// (when a page has any), but the API expects one JSON-encoded query param —
// handled generically here so no page needs to know about it.
function toQueryParams<TFilters extends object>(filters: TFilters, page: number, limit: number) {
    const params: Record<string, unknown> = { ...filters, page, limit };
    const customFields = (filters as Record<string, unknown>).customFields;

    if (customFields && typeof customFields === "object" && Object.keys(customFields).length > 0) {
        params.customFields = JSON.stringify(customFields);
    } else {
        delete params.customFields;
    }

    return params;
}

interface UseListQueryOptions<TFilters> {
    pageSize?: number;
    enabled?: boolean;
    // Turns the debounced search text into the filter patch to apply, so each
    // resource can decide how it represents an empty search.
    onSearch: (trimmed: string) => Partial<TFilters>;
}

// Shared by every list view: paged fetching, a 300ms-debounced search box, and
// a row-selection set that clears whenever the result set can change under it.
export function useListQuery<TItem, TFilters extends { sortBy: string; sortOrder: "asc" | "desc" }>(
    key: string,
    url: string,
    initialFilters: TFilters,
    { pageSize = 50, enabled = true, onSearch }: UseListQueryOptions<TFilters>,
) {
    const [searchInput, setSearchInputState] = useState("");
    const [filters, setFilters] = useState<TFilters>(initialFilters);
    const [selected, setSelected] = useState<Set<number>>(new Set());

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

    // Pages of `pageSize`, the caller asks for the next one when it scrolls to the bottom
    const query = useInfiniteQuery({
        queryKey: [key, "list", filters],
        queryFn: ({ pageParam }) =>
            api
                .get<Page<TItem>>(url, { params: toQueryParams(filters, pageParam, pageSize) })
                .then((res) => res.data),
        initialPageParam: 1,
        getNextPageParam: ({ pagination }) =>
            pagination.page < pagination.totalPages ? pagination.page + 1 : undefined,
        placeholderData: keepPreviousData,
        enabled,
    });

    const items = query.data?.pages.flatMap((page) => page.data) ?? [];
    const total = query.data?.pages[0]?.pagination.total;

    return { query, items, total, filters, updateFilters, searchInput, setSearchInput, selected, setSelected };
}
