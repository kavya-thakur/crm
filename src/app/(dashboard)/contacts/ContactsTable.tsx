"use client";

import { useEffect, useRef } from "react";
import {
    IconAddressBook,
    IconBriefcase,
    IconCalendar,
    IconMail,
    IconPhone,
    IconPlus,
    IconUser,
    IconUserCircle,
} from "@tabler/icons-react";

import { Avatar } from "@/components/Avatar";
import { ErrorState } from "@/components/ErrorState";
import { SkeletonRows } from "@/components/Loader";
import { DataCell, ResizableHeaderCell, type DataColumn, type EditConfig } from "@/components/DataTable";
import type { useTableColumns } from "@/components/FilterPanel";
import type { SelectOption } from "@/components/Select";
import { formatDate } from "@/lib/format";
import type { Agent, Contact } from "./shared";

// Every column but Name is optional — shown, hidden, reordered (drag the
// header) and resized (drag its right edge). Name stays pinned since it's
// how a row is opened.
export type ContactColumn = DataColumn<Contact>;

export const CONTACT_COLUMNS: ContactColumn[] = [
    {
        key: "email", label: "Email", icon: IconMail, width: 220,
        cell: (contact) => contact.email && <a href={`mailto:${contact.email}`} className="hover:underline">{contact.email}</a>,
    },
    {
        key: "phone", label: "Phone", icon: IconPhone, width: 160,
        cell: (contact) => contact.phone && <a href={`tel:${contact.phone}`} className="hover:underline">{contact.phone}</a>,
    },
    { key: "jobTitle", label: "Job title", icon: IconBriefcase, width: 180, cell: (contact) => contact.jobTitle },
    {
        key: "assignedTo", label: "Assigned to", icon: IconUserCircle, width: 180,
        cell: (contact) => contact.assignedTo && (
            <span className="flex items-center gap-1.5">
                <Avatar name={contact.assignedTo.name} />
                <span className="truncate">{contact.assignedTo.name}</span>
            </span>
        ),
    },
    { key: "createdAt", label: "Created", icon: IconCalendar, width: 150, cell: (contact) => formatDate(contact.createdAt) },
];

// Attaches inline-edit behavior to the base columns above — kept separate
// since it needs runtime context (agent options, the mutations) that isn't
// available where CONTACT_COLUMNS is declared.
export function withContactEdits(
    columns: ContactColumn[],
    context: {
        canUpdate: boolean;
        canAssign: boolean;
        agents?: Agent[];
        onUpdate: (contact: Contact, changes: Record<string, unknown>) => void;
        onAssign: (contact: Contact, assignedToId: number | null) => void;
    },
): ContactColumn[] {
    if (!context.canUpdate) return columns;

    const agentOptions: SelectOption[] = (context.agents ?? []).map((agent) => ({ value: String(agent.id), label: agent.name }));

    const edits: Record<string, EditConfig<Contact>> = {
        email: { type: "email", getValue: (contact) => contact.email, onSave: (contact, value) => context.onUpdate(contact, { email: value }) },
        phone: { type: "tel", getValue: (contact) => contact.phone, onSave: (contact, value) => value && context.onUpdate(contact, { phone: value }) },
        jobTitle: { type: "text", getValue: (contact) => contact.jobTitle, onSave: (contact, value) => context.onUpdate(contact, { jobTitle: value }) },
        ...(context.canAssign && {
            assignedTo: {
                type: "select",
                getValue: (contact) => (contact.assignedTo ? String(contact.assignedTo.id) : undefined),
                options: agentOptions,
                onSave: (contact, value) => context.onAssign(contact, value === undefined ? null : Number(value)),
            } satisfies EditConfig<Contact>,
        }),
    };

    return columns.map((column) => (edits[column.key] ? { ...column, edit: edits[column.key] } : column));
}

interface ContactsTableProps {
    contacts: Contact[];
    columns: ContactColumn[];
    tableColumns: Pick<ReturnType<typeof useTableColumns<ContactColumn>>, "getWidth" | "resize" | "reorderVisible">;
    loading: boolean;
    failed: boolean;
    error: unknown;
    onRetry: () => void;
    filtered: boolean;
    hasMore: boolean;
    loadingMore: boolean;
    onLoadMore: () => void;
    selectable: boolean;
    selected: Set<number>;
    onSelect: (selected: Set<number>) => void;
    onOpen: (id: number) => void;
    onCreate?: () => void;
}

export default function ContactsTable({
    contacts, columns, tableColumns, loading, failed, error, onRetry, filtered, hasMore, loadingMore, onLoadMore,
    selectable, selected, onSelect, onOpen, onCreate,
}: ContactsTableProps) {
    // Infinite scroll: when this invisible div at the bottom comes into view, load the next page
    const bottomRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const bottom = bottomRef.current;
        if (!bottom || !hasMore || loadingMore) return;

        const observer = new IntersectionObserver(([entry]) => entry.isIntersecting && onLoadMore());
        observer.observe(bottom);
        return () => observer.disconnect();
    }, [hasMore, loadingMore, onLoadMore]);

    const allSelected = contacts.length > 0 && contacts.every((contact) => selected.has(contact.id));
    const colSpan = columns.length + 3;

    function toggle(id: number) {
        const next = new Set(selected);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        onSelect(next);
    }

    if (failed) {
        return <ErrorState title="Couldn't load contacts" error={error} onRetry={onRetry} />;
    }

    return (
        <>
            <table className="w-max min-w-full table-fixed border-separate border-spacing-0">
                <thead>
                    <tr className="[&>th]:sticky [&>th]:top-0 [&>th]:z-10 [&>th]:h-8 [&>th]:border-r [&>th]:border-b [&>th]:border-line-light [&>th]:bg-surface [&>th]:px-2 [&>th]:text-left [&>th]:font-medium [&>th]:text-faint">
                        <th className="left-0 z-20! w-8 px-0! text-center!">
                            {selectable && (
                                <input
                                    type="checkbox"
                                    aria-label="Select all"
                                    checked={allSelected}
                                    onChange={() => onSelect(allSelected ? new Set() : new Set(contacts.map((contact) => contact.id)))}
                                    className="size-3.5 accent-accent"
                                />
                            )}
                        </th>
                        <th className="left-8 z-20! w-60">
                            <span className="flex items-center gap-1">
                                <IconUser size={16} />
                                Name
                            </span>
                        </th>
                        {columns.map((column) => (
                            <ResizableHeaderCell
                                key={column.key}
                                column={column}
                                width={tableColumns.getWidth(column)}
                                onResize={(width) => tableColumns.resize(column.key, width)}
                                onReorder={tableColumns.reorderVisible}
                            />
                        ))}
                        {/* empty column that takes the leftover width, like Twenty */}
                        <th className="border-r-0!" />
                    </tr>
                </thead>

                <tbody>
                    {contacts.map((contact) => {
                        const isSelected = selected.has(contact.id);

                        return (
                            <tr
                                key={contact.id}
                                className={`[&>td]:h-8 [&>td]:border-r [&>td]:border-b [&>td]:border-line-light [&>td]:px-2 [&>td]:whitespace-nowrap
                                    ${isSelected ? "[&>td]:bg-accent-faint" : "[&>td]:bg-surface"}`}
                            >
                                <td className="sticky left-0 z-1 px-0! text-center">
                                    {selectable && (
                                        <input
                                            type="checkbox"
                                            aria-label={`Select ${contact.name}`}
                                            checked={isSelected}
                                            onChange={() => toggle(contact.id)}
                                            className="size-3.5 accent-accent"
                                        />
                                    )}
                                </td>
                                <td className="sticky left-8 z-1 px-1!">
                                    <button
                                        onClick={() => onOpen(contact.id)}
                                        className="flex max-w-full items-center gap-1.5 rounded px-1 py-0.5 hover:bg-fill"
                                    >
                                        <Avatar name={contact.name} />
                                        <span className="truncate">{contact.name}</span>
                                    </button>
                                </td>
                                {columns.map((column) => (
                                    <DataCell key={column.key} record={contact} column={column} />
                                ))}
                                <td className="border-r-0!" />
                            </tr>
                        );
                    })}

                    {/* Loading placeholders, the same height as real rows so nothing jumps */}
                    {(loading || loadingMore) && <SkeletonRows colSpan={colSpan} />}

                    {onCreate && !loading && (
                        <tr>
                            <td colSpan={colSpan} className="border-b border-line-light p-0">
                                <button
                                    onClick={onCreate}
                                    className="sticky left-0 flex h-8 w-full items-center gap-2 px-2 text-faint hover:bg-paper"
                                >
                                    <IconPlus size={16} className="text-muted" />
                                    Add New
                                </button>
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>

            {!loading && contacts.length === 0 && (
                <div className="flex flex-col items-center gap-3 py-20 text-center">
                    <span className="flex size-10 items-center justify-center rounded-lg border border-line bg-paper text-faint">
                        <IconAddressBook size={20} />
                    </span>
                    <div>
                        <p className="font-medium">{filtered ? "No contacts match" : "Add your first contact"}</p>
                        <p className="mt-1 text-faint">
                            {filtered ? "Try a different search or remove a filter." : "Contacts you create or are assigned to show up here."}
                        </p>
                    </div>
                </div>
            )}

            <div ref={bottomRef} className="h-px" />
        </>
    );
}
