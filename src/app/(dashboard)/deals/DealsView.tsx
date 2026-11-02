"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { IconArrowDown, IconArrowUp, IconCalendarDue, IconCurrencyRupee, IconGitMerge, IconPercentage, IconTargetArrow } from "@tabler/icons-react";

import { Dropdown, MenuItem } from "@/components/Dropdown";
import { ErrorState } from "@/components/ErrorState";
import { toast } from "@/components/Toast";
import { askLostReason } from "@/components/LostReasonPrompt";
import {
    AssignMenu,
    BulkEditButton,
    BulkBar,
    ConfirmDeleteModal,
    FilterBar,
    FilterChip,
    ListHeader,
    ExportButton,
    SearchBox,
    SortMenu,
    ViewSwitcher,
} from "@/components/ListPage";
import {
    ActiveFilterChips,
    FilterPanelButton,
    OptionsMenuButton,
    createAssignedToField,
    createCreatedRangeField,
    createModifiedRangeField,
    createMultiSelectField,
    createPersonField,
    useTableColumns,
    type FilterFieldDef,
} from "@/components/FilterPanel";
import { api, errorMessage } from "@/lib/api/client";
import {
    StageLabel,
    refreshDeals,
    type Deal,
    type DealFilters,
    type DealUser,
    type Permissions,
    type PipelineStage,
} from "./shared";
import DealsBoard from "./DealsBoard";
import DealsTable, { DEAL_COLUMNS, withDealEdits } from "./DealsTable";
import DealPanel from "./DealPanel";
import { MergeDealsPanel } from "./MergeDeals";
import NewDealDialog from "./NewDealDialog";
import { useListQuery } from "../shared/useListQuery";
import { createCustomColumn, createCustomFilterField, customBulkFields, useCustomFields } from "../shared/customFields";

const PAGE_SIZE = 50;

const SORT_FIELDS: { field: DealFilters["sortBy"]; label: string }[] = [
    { field: "title", label: "Title" },
    { field: "amount", label: "Amount" },
    { field: "expectedCloseDate", label: "Expected close" },
    { field: "createdAt", label: "Created" },
    { field: "updatedAt", label: "Last update" },
];

type BulkAction =
    | { action: "update"; changes: Record<string, unknown> }
    | { action: "stage"; pipelineStageId: number; lostReason?: string | null }
    | { action: "assign"; assignedToId: number | null }
    | { action: "delete" };

interface OptionsResponse<T> {
    ok: boolean;
    data: T[];
}

export default function DealsView({ can, meId }: { can: Permissions; meId: number }) {
    const queryClient = useQueryClient();
    const [view, setView] = useState<"table" | "board">("table");
    const searchParams = useSearchParams();
    // Lets a link elsewhere (the Notes feed, a notification) land straight on a deal's panel,
    // including one followed while this page is already open
    const openParam = searchParams.get("open");
    const [selectedDealId, setSelectedDealId] = useState<number | null>(openParam ? Number(openParam) : null);
    const [followedParam, setFollowedParam] = useState(openParam);
    if (openParam !== followedParam) {
        setFollowedParam(openParam);
        if (openParam) setSelectedDealId(Number(openParam));
    }
    const [creating, setCreating] = useState(false);
    const [confirmingDelete, setConfirmingDelete] = useState(false);
    // two deals picked in the table, being merged; the one added first (lower id) stays
    const [merging, setMerging] = useState<{ keepId: number; duplicateId: number } | null>(null);

    const {
        query: dealsQuery,
        items: deals,
        total,
        filters,
        updateFilters,
        searchInput,
        setSearchInput,
        selected,
        setSelected,
    } = useListQuery<Deal, DealFilters>(
        "deals",
        "/deals",
        { sortBy: "createdAt", sortOrder: "desc", search: "" },
        { pageSize: PAGE_SIZE, enabled: can.read, onSearch: (trimmed) => ({ search: trimmed }) },
    );

    const agentsQuery = useQuery({
        queryKey: ["agents"],
        queryFn: () =>
            api.get<OptionsResponse<DealUser>>("/agents").then((response) => response.data.data),
        enabled: can.read && can.seeAgents,
    });

    const stagesQuery = useQuery({
        queryKey: ["pipelineStage"],
        queryFn: () =>
            api
                .get<OptionsResponse<PipelineStage>>("/pipeline-stages")
                .then((response) => response.data.data),
        enabled: can.read,
    });

    const customFieldsQuery = useCustomFields("deal");
    const customFields = customFieldsQuery.data ?? [];

    const bulk = useMutation({
        // the count rides along with the action, since the selection is cleared on success
        mutationFn: (action: BulkAction) =>
            api.patch("/deals/bulkUpdate", { ...action, dealIds: [...selected] }).then(() => ({ action, count: selected.size })),
        onSuccess: async ({ action, count }) => {
            const deals = `${count} ${count === 1 ? "deal" : "deals"}`;
            toast.success(
                action.action === "delete"
                    ? `${deals} deleted`
                    : action.action === "assign"
                      ? `${deals} assigned`
                      : action.action === "update"
                        ? `${deals} updated`
                        : `${deals} moved`
            );
            setSelected(new Set());
            setConfirmingDelete(false);
            await refreshDeals(queryClient);
        },
        onError: (error) => toast.error(errorMessage(error)),
    });

    // Inline edits from the table — a single-row PUT, same endpoint the deal
    // panel itself uses. Assignment goes through its own endpoint so it's
    // logged to the timeline, just like everywhere else.
    const updateDeal = useMutation({
        mutationFn: ({ id, changes }: { id: number; changes: Record<string, unknown> }) => api.put(`/deals/${id}`, changes),
        onSuccess: () => {
            toast.success("Deal updated");
            return refreshDeals(queryClient);
        },
        onError: (error) => toast.error(errorMessage(error)),
    });

    const assignDeal = useMutation({
        mutationFn: ({ id, assignedToId }: { id: number; assignedToId: number | null }) =>
            api.post(`/deals/${id}/assign`, { assignedToId }).then(() => assignedToId),
        onSuccess: (assignedToId) => {
            toast.success(assignedToId === null ? "Deal unassigned" : "Deal assigned");
            return refreshDeals(queryClient);
        },
        onError: (error) => toast.error(errorMessage(error)),
    });

    const defaultSort = filters.sortBy === "createdAt" && filters.sortOrder === "desc";

    // The only field here that's genuinely specific to Deals; assignedTo and
    // the created-date range are the exact same for every entity, so they
    // come from shared factories instead of being hand-written three times.
    // tick as many stages as you like: "Proposal or Negotiation"
    const pipelineStageField = createMultiSelectField<DealFilters>({
        key: "pipelineStage",
        label: "Pipeline stage",
        get: (f) => f.pipelineStageIds,
        set: (value) => ({ pipelineStageIds: value }),
        options: stagesQuery.data?.map((stage) => ({ value: stage.id, label: stage.name, render: <StageLabel stage={stage} /> })) ?? [],
    });

    const FILTER_FIELDS: FilterFieldDef<DealFilters>[] = [
        pipelineStageField,
        createAssignedToField<DealFilters>({
            get: (f) => (f.assignedTo !== undefined ? String(f.assignedTo) : undefined),
            set: (value) => ({
                assignedTo: value === undefined || value === "me" || value === "unassigned" ? value : Number(value),
            }),
            agents: can.seeAgents ? agentsQuery.data : undefined,
        }),
        createPersonField<DealFilters>({
            key: "createdBy",
            label: "Created by",
            get: (f) => f.createdBy,
            set: (value) => ({ createdBy: value }),
            agents: can.seeAgents ? agentsQuery.data : undefined,
        }),
        createPersonField<DealFilters>({
            key: "updatedBy",
            label: "Modified by",
            get: (f) => f.updatedBy,
            set: (value) => ({ updatedBy: value }),
            agents: can.seeAgents ? agentsQuery.data : undefined,
        }),
        createCreatedRangeField<DealFilters>(),
        createModifiedRangeField<DealFilters>(),
        ...customFields
            .filter((field) => field.showInFilter)
            .map((field) => createCustomFilterField<DealFilters>(field, { agents: can.seeAgents ? agentsQuery.data : undefined })),
    ];

    const hasFilterBar = FILTER_FIELDS.some((field) => field.isActive(filters)) || !defaultSort;

    const dealColumns = [
        ...withDealEdits(DEAL_COLUMNS, {
            canUpdate: can.update,
            canAssign: can.assign,
            stages: stagesQuery.data,
            agents: can.seeAgents ? agentsQuery.data : undefined,
            onUpdate: (deal, changes) => updateDeal.mutate({ id: deal.id, changes }),
            onAssign: (deal, assignedToId) => assignDeal.mutate({ id: deal.id, assignedToId }),
        }),
        ...customFields
            .filter((field) => field.showInList)
            .map((field) => createCustomColumn<Deal>(field, (deal) => deal.customFields, {
                    agents: can.seeAgents ? agentsQuery.data : undefined,
                    onUpdate: can.update ? (deal, changes) => updateDeal.mutate({ id: deal.id, changes }) : undefined,
                })),
    ];
    const { columnPrefs, visibleColumns, getWidth, resize, reorderVisible } = useTableColumns("deals-columns", dealColumns);

    if (creating) {
        return (
            <NewDealDialog
                open
                // picking who it's for needs the right to give deals to others, and to see the team
                canAssign={can.assign && can.seeAgents}
                canLinkLead={can.readLeads}
                onClose={() => setCreating(false)}
                onCreated={() => setCreating(false)}
            />
        );
    }

    if (selectedDealId !== null) {
        return (
            <DealPanel
                // key: switching deals starts a fresh panel (no leftover edit state)
                key={selectedDealId}
                dealId={selectedDealId}
                can={{ update: can.update, delete: can.delete, assign: can.assign, linkLead: can.readLeads }}
                agents={can.seeAgents ? agentsQuery.data : undefined}
                meId={meId}
                onClose={() => setSelectedDealId(null)}
            />
        );
    }

    return (
        <div className="flex h-full min-h-0 flex-col">
            <ListHeader
                section="deals"
                title="Deals"
                count={total}
                createLabel="New Deal"
                onCreate={can.create ? () => setCreating(true) : undefined}
            />

            <div className="flex h-10 shrink-0 items-center gap-1 border-b border-line-light px-2 font-medium text-muted">
                <ViewSwitcher
                    view={view}
                    onChange={(next) => {
                        setView(next);
                        if (next === "board") setSelected(new Set());
                    }}
                />

                <div className="ml-auto flex items-center gap-1">
                    <SearchBox value={searchInput} ariaLabel="Search deals" onChange={setSearchInput} />

                    <FilterPanelButton
                        entity="deal"
                        filters={filters}
                        onChange={updateFilters}
                        fields={FILTER_FIELDS}
                    />

                    <SortMenu fields={SORT_FIELDS} sortBy={filters.sortBy} sortOrder={filters.sortOrder} onChange={updateFilters} />

                    <ExportButton endpoint="/deals" filters={filters} />

                    <OptionsMenuButton
                        columns={dealColumns}
                        columnPrefs={columnPrefs}
                        canManageCustomFields={can.manageCustomFields}
                        extraLinks={can.managePipeline ? [{ label: "Pipeline stages", href: "/settings/stages" }] : undefined}
                    />
                </div>
            </div>

            <FilterBar
                show={hasFilterBar}
                onReset={() => updateFilters({
                    ...FILTER_FIELDS.reduce((acc, field) => ({ ...acc, ...field.clear(filters) }), {}),
                    sortBy: "createdAt",
                    sortOrder: "desc",
                })}
            >
                {!defaultSort && (
                    <FilterChip onRemove={() => updateFilters({ sortBy: "createdAt", sortOrder: "desc" })}>
                        {filters.sortOrder === "asc" ? <IconArrowUp size={14} /> : <IconArrowDown size={14} />}
                        {SORT_FIELDS.find((item) => item.field === filters.sortBy)?.label}
                    </FilterChip>
                )}
                <ActiveFilterChips fields={FILTER_FIELDS} filters={filters} onChange={updateFilters} />
            </FilterBar>

            {can.read && stagesQuery.isError && (
                <div className="border-b border-line-light px-3 py-2">
                    <ErrorState
                        variant="inline"
                        title="Couldn't load pipeline stages"
                        error={stagesQuery.error}
                        onRetry={() => stagesQuery.refetch()}
                        retrying={stagesQuery.isFetching}
                    />
                </div>
            )}

            <div className="relative min-h-0 flex-1 overflow-auto">
                {!can.read ? (
                    <p className="p-4 text-danger">You don&apos;t have permission to view deals.</p>
                ) : view === "table" ? (
                    <DealsTable
                        deals={deals}
                        columns={visibleColumns}
                        tableColumns={{ getWidth, resize, reorderVisible }}
                        loading={dealsQuery.isPending}
                        loadingMore={dealsQuery.isFetchingNextPage}
                        failed={dealsQuery.isError}
                        error={dealsQuery.error}
                        onRetry={() => dealsQuery.refetch()}
                        retrying={dealsQuery.isFetching}
                        filtered={Boolean(filters.search) || FILTER_FIELDS.some((field) => field.isActive(filters))}
                        hasMore={dealsQuery.hasNextPage}
                        onLoadMore={dealsQuery.fetchNextPage}
                        selectable={can.update || can.delete}
                        selected={selected}
                        onSelect={setSelected}
                        onOpen={setSelectedDealId}
                        onCreate={can.create ? () => setCreating(true) : undefined}
                    />
                ) : (
                    <DealsBoard
                        filters={filters}
                        columns={visibleColumns}
                        canMove={can.update}
                        onOpen={setSelectedDealId}
                        onCreate={can.create ? () => setCreating(true) : undefined}
                    />
                )}
            </div>

            <BulkBar
                count={selected.size}
                onClear={() => setSelected(new Set())}
                onDelete={can.delete ? () => setConfirmingDelete(true) : undefined}
            >
                {can.update && stagesQuery.data && (
                    <Dropdown
                        openUp
                        buttonClassName="flex h-7 items-center gap-1 rounded-lg px-2 hover:bg-fill"
                        label={<><IconTargetArrow size={14} /> Stage</>}
                    >
                        {(close) => stagesQuery.data.map((stage) => (
                            <MenuItem
                                key={stage.id}
                                onClick={async () => {
                                    close();
                                    const answer = stage.isLost ? await askLostReason("deal") : {};
                                    if (answer) bulk.mutate({ action: "stage", pipelineStageId: stage.id, ...answer });
                                }}
                            >
                                <StageLabel stage={stage} />
                            </MenuItem>
                        ))}
                    </Dropdown>
                )}

                {can.assign && agentsQuery.data && (
                    <AssignMenu
                        agents={agentsQuery.data}
                        onAssign={(assignedToId) => bulk.mutate({ action: "assign", assignedToId })}
                    />
                )}

                {can.update && can.delete && selected.size === 2 && (
                    <button
                        type="button"
                        onClick={() => {
                            const [first, second] = [...selected].sort((a, b) => a - b);
                            setMerging({ keepId: first, duplicateId: second });
                        }}
                        className="flex h-7 items-center gap-1 rounded-lg px-2 hover:bg-fill"
                    >
                        <IconGitMerge size={14} /> Merge
                    </button>
                )}

                {can.update && (
                    <BulkEditButton
                        count={selected.size}
                        noun="deal"
                        pending={bulk.isPending}
                        onApply={(changes) => bulk.mutate({ action: "update", changes })}
                        fields={[
                            { key: "amount", label: "Amount", icon: IconCurrencyRupee, type: "number", toChanges: (value) => ({ amount: Number(value) }) },
                            { key: "probability", label: "Probability (%)", icon: IconPercentage, type: "number", toChanges: (value) => ({ probability: Math.round(Number(value)) }) },
                            {
                                key: "expectedCloseDate",
                                label: "Expected close date",
                                icon: IconCalendarDue,
                                type: "date",
                                clearable: true,
                                // the API stores a moment; a picked day is midnight UTC of that day
                                toChanges: (value) => ({ expectedCloseDate: value ? new Date(`${value}T00:00:00.000Z`).toISOString() : null }),
                            },
                            ...customBulkFields(customFields, can.seeAgents ? agentsQuery.data : undefined),
                        ]}
                    />
                )}
            </BulkBar>

            <MergeDealsPanel
                pair={merging}
                onClose={() => setMerging(null)}
                onMerged={(keptId) => {
                    setMerging(null);
                    setSelected(new Set());
                    setSelectedDealId(keptId);
                }}
            />

            <ConfirmDeleteModal
                open={confirmingDelete}
                count={selected.size}
                noun="deal"
                pending={bulk.isPending}
                onCancel={() => setConfirmingDelete(false)}
                onConfirm={() => bulk.mutate({ action: "delete" })}
            />
        </div>
    );
}

