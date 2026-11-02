"use client";

import { useRef, useState, type ComponentType, type ReactNode } from "react";
import { IconPencil } from "@tabler/icons-react";
import { Select, type SelectOption } from "./Select";

/**
 * Shared list-table building blocks for Leads/Deals/Contacts: a draggable,
 * resizable header cell, and a hover-pencil inline-editable body cell. Each
 * entity's table keeps its own column registry and <table> markup; only the
 * header interaction and the edit-in-place behavior live here, since they're
 * byte-for-byte identical across all three.
 */

export type EditConfig<TRecord> =
    | {
          type: "text" | "email" | "tel" | "number" | "date";
          getValue: (record: TRecord) => string | number | null;
          onSave: (record: TRecord, value: string | number | null) => void;
      }
    | {
          type: "select";
          getValue: (record: TRecord) => string | undefined;
          options: SelectOption[];
          onSave: (record: TRecord, value: string | undefined) => void;
      };

export interface DataColumn<TRecord> {
    key: string;
    label: string;
    icon: ComponentType<{ size?: number; className?: string }>;
    width?: number;
    cell: (record: TRecord) => ReactNode;
    /** lets this column be edited in place from the table, via a hover pencil */
    edit?: EditConfig<TRecord>;
}

// ---------------------------------------------------------------------------
// Header cell: drag the body to reorder, drag the right edge to resize.
// ---------------------------------------------------------------------------

export function ResizableHeaderCell<TColumn extends { key: string; label: string; icon: ComponentType<{ size?: number }> }>({
    column,
    width,
    onResize,
    onReorder,
    className,
}: {
    column: TColumn;
    width: number;
    onResize: (width: number) => void;
    onReorder: (fromKey: string, toKey: string) => void;
    className?: string;
}) {
    const [dragOver, setDragOver] = useState(false);
    const resizing = useRef(false);

    function startResize(e: React.PointerEvent) {
        e.preventDefault();
        e.stopPropagation();
        resizing.current = true;
        const startX = e.clientX;
        const startWidth = width;

        function onMove(ev: PointerEvent) {
            onResize(startWidth + (ev.clientX - startX));
        }
        function onUp() {
            resizing.current = false;
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerup", onUp);
        }
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
    }

    const Icon = column.icon;

    return (
        <th
            style={{ width }}
            draggable
            onDragStart={(e) => e.dataTransfer.setData("column-key", column.key)}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                const fromKey = e.dataTransfer.getData("column-key");
                if (fromKey) onReorder(fromKey, column.key);
            }}
            className={`relative cursor-grab ${dragOver ? "bg-accent-faint!" : ""} ${className ?? ""}`}
        >
            <span className="flex items-center gap-1 overflow-hidden">
                <Icon size={16} />
                <span className="truncate">{column.label}</span>
            </span>
            {/* resize handle — not draggable itself, so grabbing it never starts a reorder */}
            <span
                draggable
                onDragStart={(e) => e.preventDefault()}
                onPointerDown={startResize}
                onClick={(e) => e.stopPropagation()}
                className="absolute top-0 right-0 z-10 h-full w-2 cursor-col-resize hover:bg-accent/50"
            />
        </th>
    );
}

// ---------------------------------------------------------------------------
// Body cell: shows the read value; a hover pencil switches it into an editor.
// ---------------------------------------------------------------------------

export function DataCell<TRecord>({
    record,
    column,
    disabled,
}: {
    record: TRecord;
    column: DataColumn<TRecord>;
    disabled?: boolean;
}) {
    const [editing, setEditing] = useState(false);

    if (!column.edit || disabled) {
        return <td className="truncate">{column.cell(record)}</td>;
    }

    if (editing) {
        return <td className="p-0.5!">{renderEditor(column.edit, record, () => setEditing(false))}</td>;
    }

    return (
        <td className="group/cell truncate">
            <div className="flex h-full items-center gap-1">
                <span className="min-w-0 flex-1 truncate">{column.cell(record)}</span>
                <button
                    type="button"
                    aria-label={`Edit ${column.label}`}
                    onClick={(e) => { e.stopPropagation(); setEditing(true); }}
                    className="invisible flex size-6 shrink-0 items-center justify-center rounded-md border border-line bg-surface text-muted shadow-light group-hover/cell:visible hover:border-line-strong hover:bg-fill hover:text-ink"
                >
                    <IconPencil size={14} />
                </button>
            </div>
        </td>
    );
}

// The in-place editor for one field; also used on board cards
export function renderEditor<TRecord>(edit: EditConfig<TRecord>, record: TRecord, close: () => void) {
    if (edit.type === "select") {
        return (
            <Select
                value={edit.getValue(record)}
                onChange={(value) => {
                    if (value !== edit.getValue(record)) edit.onSave(record, value);
                    close();
                }}
                options={edit.options}
                placeholder="—"
            />
        );
    }

    return (
        <input
            autoFocus
            type={edit.type}
            defaultValue={edit.getValue(record) ?? ""}
            onBlur={(e) => {
                const raw = e.target.value.trim();
                // clicking away without changing anything isn't a save
                if (raw !== String(edit.getValue(record) ?? "")) {
                    edit.onSave(record, raw === "" ? null : edit.type === "number" ? Number(raw) : raw);
                }
                close();
            }}
            onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
                if (e.key === "Escape") { e.stopPropagation(); close(); }
            }}
            className="h-7 w-full rounded-lg border border-line-strong bg-surface px-1 outline-none"
        />
    );
}
