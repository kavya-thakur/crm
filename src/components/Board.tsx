"use client";

import { useState, type DragEvent, type ReactNode } from "react";
import { IconPencil, IconPlus } from "@tabler/icons-react";

import { renderEditor, type DataColumn } from "./DataTable";
import { ErrorState } from "./ErrorState";
import { Skeleton } from "./Loader";

/**
 * The pieces every kanban board is built from (leads, deals, tasks, activities, notes):
 * a row of columns, cards you can drag between them, and card fields you can edit in place.
 * Columns grow with their cards and the whole board scrolls, so the menus of inline edits
 * are never clipped by a column's own scroll box.
 */

// what a dragged card carries, so a column knows which card arrived and where from
const CARD_ID = "application/x-board-card";
const FROM_COLUMN = "application/x-board-column";

export function Board({ children }: { children: ReactNode }) {
    return <div className="flex min-h-full w-max items-start gap-3 bg-paper p-3">{children}</div>;
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
    shown,
    children,
}: {
    /** compared with the card's column, so dropping a card where it already is does nothing */
    id: string;
    title: ReactNode;
    count?: number;
    /** shown after the count, like a deal column's total value */
    aside?: ReactNode;
    /** leave out to make the column read-only (no dropping into it) */
    onDropCard?: (cardId: number) => void;
    onAdd?: () => void;
    loading?: boolean;
    error?: unknown;
    onRetry?: () => void;
    emptyText: string;
    /** how many cards are on screen, to say "showing 100 of 240" when there are more */
    shown?: number;
    children: ReactNode;
}) {
    const [over, setOver] = useState(false);

    function handleDragOver(event: DragEvent) {
        // only board cards can land here, not files or text
        if (!onDropCard || !event.dataTransfer.types.includes(CARD_ID)) return;
        event.preventDefault();
        setOver(true);
    }

    function handleDrop(event: DragEvent) {
        setOver(false);
        const cardId = Number(event.dataTransfer.getData(CARD_ID));
        if (onDropCard && cardId && event.dataTransfer.getData(FROM_COLUMN) !== id) onDropCard(cardId);
    }

    return (
        <section
            onDragOver={handleDragOver}
            onDragLeave={(event) => {
                // dragleave also fires when moving onto a card inside the column; ignore that
                if (!event.currentTarget.contains(event.relatedTarget as Node)) setOver(false);
            }}
            onDrop={handleDrop}
            className={`flex w-72 shrink-0 flex-col rounded-xl transition-colors ${over ? "bg-accent-faint ring-1 ring-accent/25" : ""}`}
        >
            <header className="sticky top-0 z-10 flex h-10 items-center gap-2 rounded-t-xl bg-paper/95 px-2 backdrop-blur-sm">
                <div className="flex min-w-0 items-center gap-2 font-medium">{title}</div>
                {count !== undefined && <span className="text-faint tabular-nums">{count}</span>}
                {aside}
                {onAdd && (
                    <button
                        type="button"
                        aria-label="Add here"
                        onClick={onAdd}
                        className="ml-auto flex size-6 items-center justify-center rounded-md text-faint hover:bg-fill hover:text-ink"
                    >
                        <IconPlus size={15} />
                    </button>
                )}
            </header>

            <div className="flex flex-col gap-2 px-1 pb-3">
                {loading && [0, 1, 2].map((index) => <Skeleton key={index} className="h-28 rounded-lg" delay={index * 0.08} />)}
                {!loading && error !== undefined && error !== null && (
                    <ErrorState variant="inline" title="Couldn't load this column" error={error} onRetry={onRetry} />
                )}
                {children}
                {!loading && !error && count === 0 && (
                    <p className="rounded-lg border border-dashed border-line-strong py-6 text-center text-sm text-light">
                        {onDropCard ? `${emptyText} · drop a card here` : emptyText}
                    </p>
                )}
                {count !== undefined && shown !== undefined && count > shown && (
                    <p className="py-1 text-center text-sm text-faint">
                        Showing {shown} of {count}
                    </p>
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

// A column title: a coloured dot and a name
export function ColumnTitle({ color, children }: { color: string; children: ReactNode }) {
    return (
        <span className="flex min-w-0 items-center gap-2">
            <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
            <span className="truncate">{children}</span>
        </span>
    );
}
