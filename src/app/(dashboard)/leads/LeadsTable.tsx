"use client";

import { useEffect, useRef } from "react";
import {
    IconBuilding,
    IconCalendar,
    IconMail,
    IconPhone,
    IconPlus,
    IconProgress,
    IconTag,
    IconTargetArrow,
    IconUser,
    IconUserCircle,
} from "@tabler/icons-react";

import { Avatar } from "@/components/Avatar";
import { StageBadge } from "@/components/StageBadge";
import { DataCell, ResizableHeaderCell, type DataColumn, type EditConfig, peopleColumns } from "@/components/DataTable";
import { ErrorState } from "@/components/ErrorState";
import { SkeletonRows } from "@/components/Loader";
import type { useTableColumns } from "@/components/FilterPanel";
import type { SelectOption } from "@/components/Select";
import { formatDate } from "@/lib/format";
import {
    StageLabel,
    type Agent,
    type Lead,
    type LeadSource,
    type LeadStage,
} from "./shared";

// Every column but Name is optional — shown, hidden, reordered (drag the
// header) and resized (drag its right edge). Name stays pinned since it's
// how a row is opened.
export type LeadColumn = DataColumn<Lead>;

export const LEAD_COLUMNS: LeadColumn[] = [
    { key: "stage", label: "Stage", icon: IconProgress, width: 160, cell: (lead) => <StageLabel stage={lead.stage} /> },
    { key: "company", label: "Company", icon: IconBuilding, width: 180, cell: (lead) => lead.companyName },
    {
        key: "email", label: "Email", icon: IconMail, width: 220,
        cell: (lead) => lead.email && <a href={`mailto:${lead.email}`} className="hover:underline">{lead.email}</a>,
    },
    {
        key: "phone", label: "Phone", icon: IconPhone, width: 160,
        cell: (lead) => lead.phone && <a href={`tel:${lead.phone}`} className="hover:underline">{lead.phone}</a>,
    },
    { key: "source", label: "Source", icon: IconTag, width: 150, cell: (lead) => lead.source && <StageBadge name={lead.source.name} color={lead.source.color} /> },
    {
        key: "assignedTo", label: "Assigned to", icon: IconUserCircle, width: 180,
        cell: (lead) => lead.assignedTo && (
            <span className="flex items-center gap-1.5">
                <Avatar name={lead.assignedTo.name} />
                <span className="truncate">{lead.assignedTo.name}</span>
            </span>
        ),
    },
    { key: "createdAt", label: "Created", icon: IconCalendar, width: 150, cell: (lead) => formatDate(lead.createdAt) },
    ...peopleColumns<Lead>(),
];

// Attaches inline-edit behavior to the base columns above — kept separate
// since it needs runtime context (stage/agent options, the mutations) that
// isn't available where LEAD_COLUMNS is declared.
export function withLeadEdits(
    columns: LeadColumn[],
    context: {
        canUpdate: boolean;
        canAssign: boolean;
        stages?: LeadStage[];
        sources?: LeadSource[];
        agents?: Agent[];
        onUpdate: (lead: Lead, changes: Record<string, unknown>) => void;
        onAssign: (lead: Lead, assignedToId: number | null) => void;
    },
): LeadColumn[] {
    if (!context.canUpdate) return columns;

    const stageOptions: SelectOption[] = (context.stages ?? []).map((stage) => ({
        value: String(stage.id),
        label: stage.name,
        render: <StageLabel stage={stage} />,
    }));
    const sourceOptions: SelectOption[] = (context.sources ?? []).map((source) => ({
        value: String(source.id),
        label: source.name,
        render: <StageBadge name={source.name} color={source.color} />,
    }));
    const agentOptions: SelectOption[] = (context.agents ?? []).map((agent) => ({ value: String(agent.id), label: agent.name }));

    const edits: Record<string, EditConfig<Lead>> = {
        stage: {
            type: "select",
            getValue: (lead) => String(lead.stageId),
            options: stageOptions,
            onSave: (lead, value) => value !== undefined && context.onUpdate(lead, { stageId: Number(value) }),
        },
        company: { type: "text", getValue: (lead) => lead.companyName, onSave: (lead, value) => context.onUpdate(lead, { companyName: value }) },
        email: { type: "email", getValue: (lead) => lead.email, onSave: (lead, value) => context.onUpdate(lead, { email: value }) },
        phone: { type: "tel", getValue: (lead) => lead.phone, onSave: (lead, value) => value && context.onUpdate(lead, { phone: value }) },
        source: {
            type: "select",
            getValue: (lead) => (lead.source ? String(lead.source.id) : undefined),
            options: sourceOptions,
            onSave: (lead, value) => context.onUpdate(lead, { sourceId: value === undefined ? null : Number(value) }),
        },
        ...(context.canAssign && {
            assignedTo: {
                type: "select",
                getValue: (lead) => (lead.assignedTo ? String(lead.assignedTo.id) : undefined),
                options: agentOptions,
                onSave: (lead, value) => context.onAssign(lead, value === undefined ? null : Number(value)),
            } satisfies EditConfig<Lead>,
        }),
    };

    return columns.map((column) => (edits[column.key] ? { ...column, edit: edits[column.key] } : column));
}

interface LeadsTableProps {
    leads: Lead[];
    columns: LeadColumn[];
    tableColumns: Pick<ReturnType<typeof useTableColumns<LeadColumn>>, "getWidth" | "resize" | "reorderVisible">;
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

export default function LeadsTable({
    leads, columns, tableColumns, loading, failed, error, onRetry, filtered, hasMore, loadingMore, onLoadMore,
    selectable, selected, onSelect, onOpen, onCreate,
}: LeadsTableProps) {
    // Infinite scroll: when this invisible div at the bottom comes into view, load the next page
    const bottomRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const bottom = bottomRef.current;
        if (!bottom || !hasMore || loadingMore) return;

        const observer = new IntersectionObserver(([entry]) => entry.isIntersecting && onLoadMore());
        observer.observe(bottom);
        return () => observer.disconnect();
    }, [hasMore, loadingMore, onLoadMore]);

    const allSelected = leads.length > 0 && leads.every((lead) => selected.has(lead.id));
    // checkbox + name (pinned) + the chosen columns + the trailing filler column
    const colSpan = columns.length + 3;

    function toggle(id: number) {
        const next = new Set(selected);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        onSelect(next);
    }

    if (failed) {
        return <ErrorState title="Couldn't load leads" error={error} onRetry={onRetry} />;
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
                                    onChange={() => onSelect(allSelected ? new Set() : new Set(leads.map((lead) => lead.id)))}
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
                    {leads.map((lead) => {
                        const isSelected = selected.has(lead.id);

                        return (
                            <tr
                                key={lead.id}
                                className={`[&>td]:h-8 [&>td]:border-r [&>td]:border-b [&>td]:border-line-light [&>td]:px-2 [&>td]:whitespace-nowrap
                                    ${isSelected ? "[&>td]:bg-accent-faint" : "[&>td]:bg-surface hover:[&>td]:bg-[#fbfaff]"} animate-[fade-in_0.25s_ease-out]`}
                            >
                                <td className="sticky left-0 z-1 px-0! text-center">
                                    {selectable && (
                                        <input
                                            type="checkbox"
                                            aria-label={`Select ${lead.name}`}
                                            checked={isSelected}
                                            onChange={() => toggle(lead.id)}
                                            className="size-3.5 accent-accent"
                                        />
                                    )}
                                </td>
                                <td className="sticky left-8 z-1 px-1!">
                                    <button
                                        onClick={() => onOpen(lead.id)}
                                        className="flex max-w-full items-center gap-1.5 rounded px-1 py-0.5 hover:bg-fill"
                                    >
                                        <Avatar name={lead.name} />
                                        <span className="truncate">{lead.name}</span>
                                    </button>
                                </td>
                                {columns.map((column) => (
                                    <DataCell key={column.key} record={lead} column={column} />
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

            {!loading && leads.length === 0 && (
                <div className="flex flex-col items-center gap-3 py-20 text-center">
                    <span className="flex size-10 items-center justify-center rounded-lg border border-line bg-paper text-faint">
                        <IconTargetArrow size={20} />
                    </span>
                    <div>
                        <p className="font-medium">{filtered ? "No leads match" : "Add your first lead"}</p>
                        <p className="mt-1 text-faint">
                            {filtered ? "Try a different search or remove a filter." : "Leads you create or are assigned to show up here."}
                        </p>
                    </div>
                </div>
            )}

            <div ref={bottomRef} className="h-px" />
        </>
    );
}
