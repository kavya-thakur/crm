"use client";

import { useSearchParams } from "next/navigation";

/**
 * Page state that lives in the URL (?view=board&open=12&filters=…), so a refresh, the Back
 * button and a pasted link all bring back the same screen. Writes go straight to the browser's
 * history, which Next.js follows (useSearchParams updates), so nothing reloads.
 *   const url = useUrlState();
 *   url.get("view");                          // "board" or null
 *   url.set({ view: "board", open: null });   // null removes it
 *   url.set({ open: "12" }, "push");          // a new history entry: Back undoes it
 */
export function useUrlState() {
    const searchParams = useSearchParams();

    return {
        get: (key: string) => searchParams.get(key),
        set: (changes: Record<string, string | null>, mode: "push" | "replace" = "replace") => {
            const params = new URLSearchParams(window.location.search);
            for (const [key, value] of Object.entries(changes)) {
                if (value === null) params.delete(key);
                else params.set(key, value);
            }
            const query = params.toString();
            // nothing changes (a list putting its default filters back as it loads): leave the
            // URL, and what's remembered, alone
            if (query === window.location.search.replace(/^\?/, "")) return;
            const url = query ? `?${query}` : window.location.pathname;
            if (mode === "push") window.history.pushState(null, "", url);
            else window.history.replaceState(null, "", url);

            // remembered for coming back to this page later (see rememberedUrl); not the open record
            try {
                params.delete("open");
                localStorage.setItem(rememberKey(window.location.pathname), params.toString());
            } catch {
                // blocked or full storage: the page just opens with its defaults next time
            }
        },
    };
}

const rememberKey = (path: string) => `flash:last-view:${path}`;

/**
 * Where to send someone back to a page: the view and filters they last chose there, in this
 * browser (e.g. /leads?view=board). Used by the sidebar and the ⌘K menu.
 */
export function rememberedUrl(path: string) {
    try {
        const query = localStorage.getItem(rememberKey(path));
        return query ? `${path}?${query}` : path;
    } catch {
        return path;
    }
}

// A value from the URL, if it's one of the allowed ones; otherwise the default
export function oneOf<T extends string>(value: string | null, allowed: readonly T[], fallback: T): T {
    return allowed.includes(value as T) ? (value as T) : fallback;
}

export const PAGE_SIZES = [25, 50, 100] as const;
const DEFAULT_PAGE_SIZE = 50;

/**
 * Which page of a list you're on and how many rows a page shows (?page=3&size=25), kept in the
 * URL like the rest, so a refresh keeps them and the size is remembered with the page.
 * Anything that changes which rows match (a filter, a tab) should go back to page 1: pass
 * `page: null` in the same url.set, or call firstPage().
 */
export function usePaging() {
    const url = useUrlState();
    const size: number = PAGE_SIZES.find((option) => String(option) === url.get("size")) ?? DEFAULT_PAGE_SIZE;
    const page = Math.max(1, Math.floor(Number(url.get("page"))) || 1);

    return {
        page,
        size,
        setPage: (next: number) => url.set({ page: next > 1 ? String(next) : null }),
        // a new size starts again from the first page
        setSize: (next: number) => url.set({ size: next === DEFAULT_PAGE_SIZE ? null : String(next), page: null }),
        firstPage: () => url.set({ page: null }),
    };
}
