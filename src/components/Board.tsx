"use client";

import { useEffect, useRef, useState, type DragEvent, type ReactNode } from "react";
import { keepPreviousData, useInfiniteQuery } from "@tanstack/react-query";
import { IconPencil, IconPlus } from "@tabler/icons-react";

import { api, toQueryParams } from "@/lib/api/client";
import { renderEditor, type DataColumn } from "./DataTable";
import { ErrorState } from "./ErrorState";
import { Skeleton, Spinner } from "./Loader";

/**
 * The pieces every kanban board is built from (leads, deals, tasks, activities, notes):
 * a row of columns, cards you can drag between them, and card fields you can edit in place.
 * Columns grow with their cards and the whole board scrolls, so the menus of inline edits
 * are never clipped by a column's own scroll box.
 */

// what a dragged card carries, so a column knows which card arrived and where from
const CARD_ID = "application/x-board-card";
const FROM_COLUMN = "application/x-board-column";

const PAGE_SIZE = 25;

interface ColumnPage<T> {
    data: T[];
    pagination: { page: number; total: number; totalPages: number };
    /** deals only: the whole column's value, sent with the first page */
    totalAmount?: number;
}

// One column's cards, a page at a time: 25 to start, 25 more each time you near the end.
// However big the column, the browser only ever holds what's been scrolled to.
export function useBoardColumn<T>(queryKey: unknown[], endpoint: string, params: Record<string, unknown>) {
    const query = useInfiniteQuery({
        queryKey,
        queryFn: ({ pageParam, signal }) =>
            api.get<ColumnPage<T>>(endpoint, { params: { ...toQueryParams(params), page: pageParam, limit: PAGE_SIZE }, signal }).then((res) => res.data),
        initialPageParam: 1,
        getNextPageParam: ({ pagination }) => (pagination.page < pagination.totalPages ? pagination.page + 1 : undefined),
        placeholderData: keepPreviousData,
    });

    const items = query.data?.pages.flatMap((page) => page.data) ?? [];
    const first = query.data?.pages[0];

    return {
        items,
        total: first?.pagination.total,
        totalAmount: first?.totalAmount,
        loading: query.isPending,
        error: query.error,
        retry: () => query.refetch(),
        more: {
            left: (first?.pagination.total ?? 0) - items.length,
            loading: query.isFetchingNextPage,
            load: () => {
                if (query.hasNextPage && !query.isFetchingNextPage) query.fetchNextPage();
            },
        },
    };
}

export function Board({ children }: { children: ReactNode }) {
    return <div className="flex min-h-full w-max items-start gap-3 bg-surface p-3">{children}</div>;
}

export function BoardColumn({
    id,
    title,
    count,
    aside,
    onDropCard,
    onAdd,
    loading,
    error,
    onRetry,
    emptyText,
    more,
    children,
}: {
    /** compared with the card's column, so dropping a card where it already is does nothing */
    id: string;
    title: ReactNode;
    count?: number;
    /** shown after the count, like a deal column's total value */
    aside?: ReactNode;
    /** leave out to make the column read-only (no dropping into it) */
    // with the column it came from
    onDropCard?: (cardId: number, fromColumn: string) => void;
    onAdd?: () => void;
    loading?: boolean;
    error?: unknown;
    onRetry?: () => void;
    emptyText: string;
    /** the next page of cards, when there is one (see useBoardColumn) */
    more?: { left: number; loading: boolean; load: () => void };
    children: ReactNode;
}) {
    const [over, setOver] = useState(false);
    const moreRef = useRef<HTMLButtonElement>(null);
    const canLoad = Boolean(more && more.left > 0 && !more.loading);

    // The next page loads by itself as the end of the column scrolls into view (a little
    // before, so it's usually there by the time you reach it); the button is the fallback
    useEffect(() => {
        const button = moreRef.current;
        if (!button || !canLoad) return;
        const observer = new IntersectionObserver(([entry]) => entry.isIntersecting && more?.load(), { rootMargin: "300px" });
        observer.observe(button);
        return () => observer.disconnect();
    }, [canLoad, more]);

    function handleDragOver(event: DragEvent) {
        // only board cards can land here, not files or text
        if (!onDropCard || !event.dataTransfer.types.includes(CARD_ID)) return;
        event.preventDefault();
        setOver(true);
    }

    function handleDrop(event: DragEvent) {
        setOver(false);
        const cardId = Number(event.dataTransfer.getData(CARD_ID));
        const from = event.dataTransfer.getData(FROM_COLUMN);
        if (onDropCard && cardId && from !== id) onDropCard(cardId, from);
    }

    return (
        <section
            onDragOver={handleDragOver}
            onDragLeave={(event) => {
                // dragleave also fires when moving onto a card inside the column; ignore that
                if (!event.currentTarget.contains(event.relatedTarget as Node)) setOver(false);
            }}
            onDrop={handleDrop}
            // a soft grey lane, so the white cards stand out on it; it tints while a card is dragged over
            className={`group/column flex w-72 shrink-0 flex-col rounded-xl transition-colors ${
                over ? "bg-accent-faint ring-1 ring-accent/30 ring-inset" : "bg-lane"
            }`}
        >
            {/* stays put while the board scrolls; bg-inherit keeps it the lane's colour underneath */}
            <header className="sticky top-0 z-10 flex h-11 items-center gap-2 rounded-t-xl bg-inherit px-2.5">
                <div className="flex min-w-0 items-center">{title}</div>
                {count !== undefined && (
                    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-black/5 px-1.5 text-xs font-medium text-muted tabular-nums">
                        {count}
                    </span>
                )}
                <div className="ml-auto flex items-center gap-1">
                    {aside}
                    {/* only shown when you're over the column, so the headers stay quiet */}
                    {onAdd && (
                        <button
                            type="button"
                            aria-label="Add here"
                            onClick={onAdd}
                            className="flex size-6 items-center justify-center rounded-md text-faint opacity-0 transition-opacity group-hover/column:opacity-100 hover:bg-black/5 hover:text-ink focus-visible:opacity-100"
                        >
                            <IconPlus size={15} />
                        </button>
                    )}
                </div>
            </header>

            <div className="flex flex-col gap-2 px-2 pb-2">
                {loading && [0, 1, 2].map((index) => <Skeleton key={index} className="h-28 rounded-lg" delay={index * 0.08} />)}
                {!loading && error !== undefined && error !== null && (
                    <ErrorState variant="inline" title="Couldn't load this column" error={error} onRetry={onRetry} />
                )}
                {children}
                {!loading && !error && count === 0 && (
                    <p className="rounded-lg border border-dashed border-black/10 py-6 text-center text-sm text-faint">
                        {onDropCard ? `${emptyText} · drop a card here` : emptyText}
                    </p>
                )}
                {more && more.left > 0 && (
                    <button
                        ref={moreRef}
                        type="button"
                        onClick={more.load}
                        disabled={more.loading}
                        className="flex h-8 items-center justify-center gap-1.5 rounded-lg text-sm text-muted hover:bg-black/5 hover:text-ink disabled:opacity-70"
                    >
                        {more.loading ? <Spinner size={14} /> : null}
                        {more.loading ? "Loading…" : `Load ${more.left} more`}
                    </button>
                )}
            </div>
        </section>
    );
}

export function BoardCard({
    id,
    columnId,
    draggable = false,
    onOpen,
    children,
}: {
    id: number;
    columnId: string;
    draggable?: boolean;
    onOpen?: () => void;
    children: ReactNode;
}) {
    const [dragging, setDragging] = useState(false);

    return (
        <article
            draggable={draggable}
            onDragStart={(event) => {
                event.dataTransfer.setData(CARD_ID, String(id));
                event.dataTransfer.setData(FROM_COLUMN, columnId);
                event.dataTransfer.effectAllowed = "move";
                setDragging(true);
            }}
            onDragEnd={() => setDragging(false)}
            onClick={onOpen}
            className={`group/card rounded-lg border border-line bg-surface p-3 shadow-[0_1px_2px_rgb(0_0_0/0.04)] transition hover:border-line-strong hover:shadow-light
                ${onOpen ? "cursor-pointer" : ""} ${draggable ? "active:cursor-grabbing" : ""} ${dragging ? "opacity-40" : ""}`}
        >
            {children}
        </article>
    );
}

// The fields under a card's title: the same columns the table shows, each with its icon,
// editable in place (hover, then the pencil) wherever the table allows it
export function CardFields<TRecord>({ record, columns }: { record: TRecord; columns: DataColumn<TRecord>[] }) {
    if (columns.length === 0) return null;

    return (
        <div className="mt-2 flex flex-col">
            {columns.map((column) => (
                <CardField key={column.key} record={record} column={column} />
            ))}
        </div>
    );
}

function CardField<TRecord>({ record, column }: { record: TRecord; column: DataColumn<TRecord> }) {
    const [editing, setEditing] = useState(false);
    const value = column.cell(record);
    const empty = value === null || value === undefined || value === false || value === "";

    return (
        <div
            title={column.label}
            // while editing, clicks inside (and on the menu's backdrop) mustn't open the card,
            // and neither should following a link in the field, like a task's linked lead
            onClick={(event) => {
                if (editing || (event.target as HTMLElement).closest("a")) event.stopPropagation();
            }}
            className="group/field -mx-1 flex h-7 items-center gap-2 rounded-md px-1 text-muted hover:bg-paper"
        >
            <column.icon size={14} className="shrink-0 text-faint" />
            {editing && column.edit ? (
                <div className="min-w-0 flex-1">{renderEditor(column.edit, record, () => setEditing(false))}</div>
            ) : (
                <>
                    <span className="min-w-0 flex-1 truncate">{empty ? <span className="text-light">{column.label}</span> : value}</span>
                    {column.edit && (
                        <button
                            type="button"
                            aria-label={`Edit ${column.label}`}
                            onClick={(event) => {
                                event.stopPropagation();
                                setEditing(true);
                            }}
                            className="invisible flex size-6 shrink-0 items-center justify-center rounded-md text-faint group-hover/field:visible hover:bg-fill hover:text-ink focus-visible:visible"
                        >
                            <IconPencil size={13} />
                        </button>
                    )}
                </>
            )}
        </div>
    );
}

// Wraps a control placed on a card (a checkbox, a menu) so using it doesn't also open the card
export function CardControl({ children, className = "" }: { children: ReactNode; className?: string }) {
    return (
        <div onClick={(event) => event.stopPropagation()} className={className}>
            {children}
        </div>
    );
}

// A column title: the name in a pill tinted with its own colour, the same look as a stage
// badge in the table, so a stage reads the same everywhere
export function ColumnTitle({ color, children }: { color: string; children: ReactNode }) {
    return (
        <span
            className="inline-flex h-6 max-w-44 items-center rounded-md px-2 text-[13px] font-medium"
            style={{ backgroundColor: `${color}1a`, color }}
        >
            <span className="truncate">{children}</span>
        </span>
    );
}
