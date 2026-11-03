"use client";

import {
    IconCalendar,
    IconCurrencyRupee,
    IconPlus,
    IconTargetArrow,
    IconMail,
    IconPhone,
    IconUser,
    IconUserCircle,
    IconThumbDown,
} from "@tabler/icons-react";

import { Avatar } from "@/components/Avatar";
import { ErrorState } from "@/components/ErrorState";
import { SkeletonRows } from "@/components/Loader";
import { StageBadge } from "@/components/StageBadge";
import { DataCell, ResizableHeaderCell, type DataColumn, type EditConfig, peopleColumns } from "@/components/DataTable";
import type { useTableColumns } from "@/components/FilterPanel";
import type { SelectOption } from "@/components/Select";
import { askLostReason } from "@/components/LostReasonPrompt";
import { formatDate } from "@/lib/utils/format";
import { StageLabel, formatDealAmount, type Deal, type DealUser, type PipelineStage } from "./shared";

// Every column but Deal (title) is optional — shown, hidden, reordered (drag
// the header) and resized (drag its right edge). Deal stays pinned since
// it's how a row is opened.
export type DealColumn = DataColumn<Deal>;

export const DEAL_COLUMNS: DealColumn[] = [
    { key: "amount", label: "Amount", icon: IconCurrencyRupee, width: 150, cell: (deal) => <span className="font-medium tabular-nums">{formatDealAmount(deal.amount)}</span> },
    {
        key: "pipelineStage", label: "Pipeline stage", icon: IconTargetArrow, width: 180,
        cell: (deal) => <StageBadge name={deal.pipelineStage.name} color={deal.pipelineStage.color} />,
    },
    { key: "lead", label: "Lead", icon: IconUser, width: 180, cell: (deal) => (deal.lead?.name ? <span className="text-muted">{deal.lead.name}</span> : <span className="text-light">Empty</span>) },
    // how to reach the person: their lead's phone and email
    {
        key: "phone", label: "Phone", icon: IconPhone, width: 160,
        cell: (deal) => deal.lead?.phone ? <a href={`tel:${deal.lead.phone}`} className="hover:underline">{deal.lead.phone}</a> : <span className="text-light">Empty</span>,
    },
    {
        key: "email", label: "Email", icon: IconMail, width: 220,
        cell: (deal) => deal.lead?.email ? <a href={`mailto:${deal.lead.email}`} className="hover:underline">{deal.lead.email}</a> : <span className="text-light">Empty</span>,
    },
    {
        key: "assignedTo", label: "Assigned to", icon: IconUserCircle, width: 180,
        cell: (deal) => deal.assignedTo ? (
            <span className="flex items-center gap-1.5">
                <Avatar name={deal.assignedTo.name} />
                <span className="truncate">{deal.assignedTo.name}</span>
            </span>
        ) : <span className="text-light">Empty</span>,
    },
    {
        key: "probability", label: "Probability", icon: IconTargetArrow, width: 150,
        cell: (deal) => (
            <span className="inline-flex items-center gap-1.5">
                <span className="h-1.5 w-12 overflow-hidden rounded-full bg-fill">
                    <span className="block h-full rounded-full bg-accent" style={{ width: `${Math.min(100, Math.max(0, deal.probability))}%` }} />
                </span>
                <span>{deal.probability}%</span>
            </span>
        ),
    },
    {
        key: "expectedCloseDate", label: "Expected close", icon: IconCalendar, width: 170,
        cell: (deal) => deal.expectedCloseDate ? <span className="text-muted">{formatDate(deal.expectedCloseDate)}</span> : <span className="text-light">Empty</span>,
    },
    { key: "lostReason", label: "Lost reason", icon: IconThumbDown, width: 180, hiddenByDefault: true, cell: (deal) => deal.pipelineStage.isLost && deal.lostReason },
    ...peopleColumns<Deal>(),
];

// Attaches inline-edit behavior to the base columns above — kept separate
// since it needs runtime context (stage/agent options, the mutations) that
// isn't available where DEAL_COLUMNS is declared.
export function withDealEdits(
    columns: DealColumn[],
    context: {
        canUpdate: boolean;
        canAssign: boolean;
        stages?: PipelineStage[];
        agents?: DealUser[];
        onUpdate: (deal: Deal, changes: Record<string, unknown>) => void;
        onAssign: (deal: Deal, assignedToId: number | null) => void;
    },
): DealColumn[] {
    if (!context.canUpdate) return columns;

    const stageOptions: SelectOption[] = (context.stages ?? []).map((stage) => ({
        value: String(stage.id),
        label: stage.name,
        render: <StageLabel stage={stage} />,
    }));
    const agentOptions: SelectOption[] = (context.agents ?? []).map((agent) => ({ value: String(agent.id), label: agent.name }));

    const edits: Record<string, EditConfig<Deal>> = {
        amount: { type: "number", getValue: (deal) => Number(deal.amount), onSave: (deal, value) => context.onUpdate(deal, { amount: value ?? 0 }) },
        pipelineStage: {
            type: "select",
            getValue: (deal) => String(deal.pipelineStageId),
            options: stageOptions,
            onSave: async (deal, value) => {
                const stage = context.stages?.find((item) => String(item.id) === value);
                if (!stage) return;
                // moving to a lost stage asks why first; closing the question calls the move off
                const answer = stage.isLost ? await askLostReason("deal") : {};
                if (answer) context.onUpdate(deal, { pipelineStageId: stage.id, ...answer });
            },
        },
        probability: { type: "number", getValue: (deal) => deal.probability, onSave: (deal, value) => context.onUpdate(deal, { probability: value ?? 0 }) },
        expectedCloseDate: {
            type: "date",
            getValue: (deal) => (deal.expectedCloseDate ? deal.expectedCloseDate.slice(0, 10) : null),
            onSave: (deal, value) => context.onUpdate(deal, { expectedCloseDate: value ? new Date(`${value}T12:00:00`).toISOString() : null }),
        },
        ...(context.canAssign && {
            assignedTo: {
                type: "select",
                getValue: (deal) => (deal.assignedTo ? String(deal.assignedTo.id) : undefined),
                options: agentOptions,
                onSave: (deal, value) => context.onAssign(deal, value === undefined ? null : Number(value)),
            } satisfies EditConfig<Deal>,
        }),
    };

    return columns.map((column) => (edits[column.key] ? { ...column, edit: edits[column.key] } : column));
}

interface DealsTableProps {
    deals: Deal[];
    columns: DealColumn[];
    tableColumns: Pick<ReturnType<typeof useTableColumns<DealColumn>>, "getWidth" | "resize" | "reorderVisible">;
    loading: boolean;
    failed: boolean;
    error: unknown;
    onRetry: () => void;
    retrying: boolean;
    filtered: boolean;
    selectable: boolean;
    selected: Set<number>;
    onSelect: (selected: Set<number>) => void;
    onOpen: (id: number) => void;
    onCreate?: () => void;
}

export default function DealsTable({
    deals,
    columns,
    tableColumns,
    loading,
    failed,
    error,
    onRetry,
    retrying,
    filtered,
    selectable,
    selected,
    onSelect,
    onOpen,
    onCreate,
}: DealsTableProps) {

    const allSelected = deals.length > 0 && deals.every((deal) => selected.has(deal.id));
    const colSpan = columns.length + 3;

    function toggle(id: number) {
        const next = new Set(selected);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        onSelect(next);
    }

    if (failed) {
        return <ErrorState title="Couldn't load deals" error={error} onRetry={onRetry} retrying={retrying} />;
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
                                    aria-label="Select all deals"
                                    checked={allSelected}
                                    onChange={() => onSelect(allSelected ? new Set() : new Set(deals.map((deal) => deal.id)))}
                                    className="size-3.5 accent-accent"
                                />
                            )}
                        </th>
                        <th className="left-8 z-20! w-60">
                            <span className="flex items-center gap-1">
                                <IconTargetArrow size={16} />
                                Deal
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
                        <th className="border-r-0!" />
                    </tr>
                </thead>

                <tbody>
                    {deals.map((deal) => {
                        const isSelected = selected.has(deal.id);
                        return (
                            <tr
                                key={deal.id}
                                className={`[&>td]:h-8 [&>td]:border-r [&>td]:border-b [&>td]:border-line-light [&>td]:px-2 [&>td]:whitespace-nowrap
                                    ${isSelected ? "[&>td]:bg-accent-faint" : "[&>td]:bg-surface hover:[&>td]:bg-[#fbfaff]"} animate-[fade-in_0.25s_ease-out]`}
                            >
                                <td className="sticky left-0 z-1 px-0! text-center">
                                    {selectable && (
                                        <input
                                            type="checkbox"
                                            aria-label={`Select ${deal.title}`}
                                            checked={isSelected}
                                            onChange={() => toggle(deal.id)}
                                            className="size-3.5 accent-accent"
                                        />
                                    )}
                                </td>
                                <td className="sticky left-8 z-1 px-1!">
                                    <button
                                        type="button"
                                        onClick={() => onOpen(deal.id)}
                                        className="flex max-w-full items-center gap-1.5 rounded px-1 py-0.5 text-left hover:bg-fill"
                                    >
                                        <Avatar name={deal.title} />
                                        <span className="truncate font-medium">{deal.title}</span>
                                    </button>
                                </td>
                                {columns.map((column) => (
                                    <DataCell key={column.key} record={deal} column={column} />
                                ))}
                                <td className="border-r-0!" />
                            </tr>
                        );
                    })}

                    {loading && <SkeletonRows colSpan={colSpan} />}

                    {onCreate && !loading && (
                        <tr>
                            <td colSpan={colSpan} className="border-b border-line-light p-0">
                                <button
                                    type="button"
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

            {!loading && deals.length === 0 && (
                <div className="flex flex-col items-center gap-3 py-20 text-center">
                    <span className="flex size-10 items-center justify-center rounded-lg border border-line bg-paper text-faint">
                        <IconTargetArrow size={20} />
                    </span>
                    <div>
                        <p className="font-medium">{filtered ? "No deals match" : "Add your first deal"}</p>
                        <p className="mt-1 text-faint">
                            {filtered ? "Try a different search or remove a filter." : "Deals you create or are assigned to show up here."}
                        </p>
                    </div>
                </div>
            )}

        </>
    );
}
