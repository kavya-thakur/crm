"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { IconArrowDown, IconArrowUp, IconTargetArrow } from "@tabler/icons-react";

import { Dropdown, MenuItem } from "@/components/Dropdown";
import { ErrorState } from "@/components/ErrorState";
import { toast } from "@/components/Toast";
import {
    AssignMenu,
    BulkBar,
    ConfirmDeleteModal,
    FilterBar,
    FilterChip,
    ListHeader,
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
    renderSelectControl,
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
import NewDealDialog from "./NewDealDialog";
import { useListQuery } from "../shared/useListQuery";
import { createCustomColumn, createCustomFilterField, useCustomFields } from "../shared/customFields";
import { usePanelEnter } from "../shared/usePanelEnter";

const PAGE_SIZE = 50;

const SORT_FIELDS: { field: DealFilters["sortBy"]; label: string }[] = [
    { field: "title", label: "Title" },
    { field: "amount", label: "Amount" },
    { field: "expectedCloseDate", label: "Expected close" },
    { field: "createdAt", label: "Created" },
    { field: "updatedAt", label: "Last update" },
];

type BulkAction =
    | { action: "stage"; pipelineStageId: number }
    | { action: "assign"; assignedToId: number | null }
    | { action: "delete" };

interface OptionsResponse<T> {
    ok: boolean;
    data: T[];
}

export default function DealsView({ can, meId }: { can: Permissions; meId: number }) {
    const queryClient = useQueryClient();
    const enterRef = usePanelEnter<HTMLDivElement>();
    const [view, setView] = useState<"table" | "board">("table");
    const searchParams = useSearchParams();
    // Lets a link elsewhere (e.g. the Notes feed) land straight on a deal's panel
    const [selectedDealId, setSelectedDealId] = useState<number | null>(() => {
        const param = searchParams.get("open");
        return param ? Number(param) : null;
    });
    const [creating, setCreating] = useState(false);
    const [confirmingDelete, setConfirmingDelete] = useState(false);

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
                action.action === "delete" ? `${deals} deleted` : action.action === "assign" ? `${deals} assigned` : `${deals} moved`
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
    const pipelineStageField: FilterFieldDef<DealFilters> = {
        key: "pipelineStage",
        label: "Pipeline stage",
        isActive: (f) => f.pipelineStageId !== undefined,
        clear: () => ({ pipelineStageId: undefined }),
        renderControl: (f, onChange) =>
            renderSelectControl(
                f.pipelineStageId,
                (value) => onChange({ pipelineStageId: value ? Number(value) : undefined }),
                stagesQuery.data?.map((stage) => ({ value: stage.id, label: stage.name })) ?? [],
                "Any stage",
            ),
        renderChip: (f) => `Stage: ${stagesQuery.data?.find((stage) => stage.id === f.pipelineStageId)?.name ?? "Selected"}`,
    };

    const FILTER_FIELDS: FilterFieldDef<DealFilters>[] = [
        pipelineStageField,
        createAssignedToField<DealFilters>({
            get: (f) => (f.assignedTo !== undefined ? String(f.assignedTo) : undefined),
            set: (value) => ({
                assignedTo: value === undefined || value === "me" || value === "unassigned" ? value : Number(value),
            }),
            agents: can.seeAgents ? agentsQuery.data : undefined,
        }),
        createCreatedRangeField<DealFilters>(),
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
                canAssign={can.update}
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
                can={{ update: can.update, delete: can.delete, assign: can.assign }}
                agents={can.seeAgents ? agentsQuery.data : undefined}
                meId={meId}
                onClose={() => setSelectedDealId(null)}
            />
        );
    }

    return (
        <div ref={enterRef} className="flex h-full min-h-0 flex-col">
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
                    tableLabel="All deals"
                    boardLabel="By stage"
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
                            <MenuItem key={stage.id} onClick={() => { bulk.mutate({ action: "stage", pipelineStageId: stage.id }); close(); }}>
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
            </BulkBar>

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

