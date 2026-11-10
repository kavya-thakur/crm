"use client";

import { useEffect, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { IconSearch } from "@tabler/icons-react";

import { api } from "@/lib/api/client";
import { ErrorState } from "@/components/ErrorState";
import { SkeletonList } from "@/components/Loader";
import { Pill } from "@/components/Pill";
import { formatDate } from "@/lib/utils/format";
import { PRO_PLANS, type BillingCycle } from "@/lib/billing/plans";

// What the site admin tabs share: a list with search and pages, and its pieces

export interface Page<T> {
    data: T[];
    total: number;
    pageSize: number;
    // payments: the total of every one matching, in rupees
    sum?: number;
}

export const count = (value: number) => value.toLocaleString("en-IN");

// A list with search and pages: what the tabs share
export function useSearchPage<T>(key: string, endpoint: string, extra: Record<string, unknown> = {}) {
    const [typed, setTyped] = useState("");
    const [search, setSearch] = useState("");
    const [page, setPage] = useState(1);
    // a filter changed: back to the first page (React's "adjust state while rendering" pattern)
    const filters = JSON.stringify(extra);
    const [lastFilters, setLastFilters] = useState(filters);
    if (filters !== lastFilters) {
        setLastFilters(filters);
        setPage(1);
    }

    // search once typing pauses
    useEffect(() => {
        const timer = setTimeout(() => {
            setSearch(typed.trim());
            setPage(1);
        }, 300);
        return () => clearTimeout(timer);
    }, [typed]);

    const query = useQuery({
        queryKey: ["site-admin", key, search, page, extra],
        queryFn: () => api.get<Page<T>>(endpoint, { params: { search: search || undefined, page, ...extra } }).then((res) => res.data),
        placeholderData: keepPreviousData,
    });
    return { typed, setTyped, search, page, setPage, query };
}

export function SearchInput({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) {
    return (
        <label className="flex h-8 items-center gap-1.5 rounded-lg border border-line bg-surface px-2 focus-within:border-accent sm:w-80">
            <IconSearch size={14} className="shrink-0 text-faint" />
            <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-light" />
        </label>
    );
}

// A row of options where one is on: a plan, a payment method, a month
export function Chips<T extends string>({ label, value, onChange, options }: { label: string; value: T | undefined; onChange: (value: T | undefined) => void; options: { value: T | undefined; label: string }[] }) {
    return (
        <div role="group" aria-label={label} className="flex shrink-0 gap-0.5 self-start rounded-lg border border-line bg-surface p-0.5 sm:self-auto">
            {options.map((option) => (
                <button
                    key={option.label}
                    type="button"
                    aria-pressed={value === option.value}
                    onClick={() => onChange(option.value)}
                    className={`h-7 rounded-md px-2.5 text-sm font-medium whitespace-nowrap ${value === option.value ? "bg-fill text-ink" : "text-muted hover:bg-app hover:text-ink"}`}
                >
                    {option.label}
                </button>
            ))}
        </div>
    );
}

// Loading, failed, empty, or the rows
export function Results<T>({
    query,
    empty,
    children,
}: {
    query: ReturnType<typeof useQuery<Page<T>>>;
    empty: string;
    children: (rows: T[]) => React.ReactNode;
}) {
    if (query.isPending)
        return (
            <div className="mt-4">
                <SkeletonList rows={8} />
            </div>
        );
    if (query.isError) return <ErrorState title="Couldn't load this" error={query.error} onRetry={() => query.refetch()} retrying={query.isFetching} />;
    if (query.data.total === 0) return <p className="mt-4 rounded-xl border border-dashed border-line-strong px-4 py-10 text-center text-faint">{empty}</p>;
    return <div className={`mt-3 rounded-xl border border-line bg-surface ${query.isPlaceholderData ? "opacity-60" : ""}`}>{children(query.data.data)}</div>;
}

export function Pager<T>({ page, setPage, data }: { page: number; setPage: (page: number) => void; data: Page<T> | undefined }) {
    if (!data || data.total <= data.pageSize) return null;
    const pages = Math.ceil(data.total / data.pageSize);
    const button = "h-8 rounded-lg border border-line px-3 font-medium text-muted hover:bg-fill disabled:opacity-50";
    return (
        <div className="mt-3 flex items-center justify-between gap-2 text-sm text-muted">
            <span className="tabular-nums">
                {count((page - 1) * data.pageSize + 1)}–{count(Math.min(page * data.pageSize, data.total))} of {count(data.total)}
            </span>
            <div className="flex gap-2">
                <button type="button" disabled={page === 1} onClick={() => setPage(page - 1)} className={button}>
                    Previous
                </button>
                <button type="button" disabled={page >= pages} onClick={() => setPage(page + 1)} className={button}>
                    Next
                </button>
            </div>
        </div>
    );
}

// Trial (days left), Pro (until when), or ended; and a waiting request
export function PlanCell({ workspace }: { workspace: { access: { state: "trial" | "pro" | "ended"; endsAt: string | null; daysLeft: number }; planRequest: string | null } }) {
    const { state, endsAt, daysLeft } = workspace.access;
    return (
        <div className="flex flex-col items-start gap-0.5">
            {state === "pro" ? (
                <span className="text-sm">
                    <Pill tone="green">Pro</Pill> <span className="text-faint">until {endsAt && formatDate(endsAt)}</span>
                </span>
            ) : state === "trial" ? (
                <span className="text-sm">
                    <Pill tone="blue">Trial</Pill> <span className="text-faint">{daysLeft}d left</span>
                </span>
            ) : (
                <Pill tone="red">Ended</Pill>
            )}
            {workspace.planRequest && (
                <span className="text-sm font-medium text-accent">Wants Pro {PRO_PLANS[workspace.planRequest as BillingCycle]?.label.toLowerCase()}</span>
            )}
        </div>
    );
}
