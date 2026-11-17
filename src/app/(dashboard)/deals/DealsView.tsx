"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
    IconArrowDown,
    IconArrowUp,
    IconCalendarDue,
    IconChevronDown,
    IconCoin,
    IconGitMerge,
    IconPercentage,
    IconTargetArrow,
    IconTimeline,
} from "@tabler/icons-react";

import { Dropdown, MenuItem } from "@/components/Dropdown";
import { ErrorState } from "@/components/ErrorState";
import { PageLoader } from "@/components/Loader";
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
    Pagination,
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
    renderSelectControl,
    useTableColumns,
    type FilterFieldDef,
} from "@/components/FilterPanel";
import { api, errorMessage } from "@/lib/api/client";
import {
    StageLabel,
    refreshDeals,
    usePipelines,
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
import { startBulkJob } from "../BackgroundJobs";
import { SelectAllBar, useSelectAll } from "../shared/useSelectAll";
import { PAGE_SIZES } from "../shared/useUrlState";
import NewDealDialog from "./NewDealDialog";
import { useListQuery } from "../shared/useListQuery";
import { createCustomColumn, createCustomFilterField, customBulkFields, useCustomFields } from "../shared/customFields";
import { useUrlState } from "../shared/useUrlState";


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

// The pipeline last picked on the deals page, in this browser
const PIPELINE_KEY = "flash:deals-pipeline";

export default function DealsView({ can, meId }: { can: Permissions; meId: number }) {
    const queryClient = useQueryClient();
    // list or board, kept in the URL so a refresh keeps it (the list is the default)
    // The open deal lives in the URL (?open=12): a refresh reopens it, Back closes it, and a
    // link from elsewhere (the Notes feed, a notification) lands straight on it
    const page = useUrlState();
    const selectedDealId = Number(page.get("open")) || null;
    const setSelectedDealId = (id: number | null) => page.set({ open: id ? String(id) : null }, "push");
    const view = page.get("view") === "board" ? "board" : "table";
    const setView = (next: "table" | "board") => page.set({ view: next === "table" ? null : next });
    const [creating, setCreating] = useState(false);
    const [confirmingDelete, setConfirmingDelete] = useState(false);
    // two deals picked in the table, being merged; the one added first (lower id) stays
    const [merging, setMerging] = useState<{ keepId: number; duplicateId: number } | null>(null);
    // the deals wait until it's settled which pipeline's to show, so another pipeline's never flash up
    const [pipelineReady, setPipelineReady] = useState(false);
    const pipelinesQuery = usePipelines(can.read);

    const {
        query: dealsQuery,
        paging,
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
        { enabled: can.read && pipelineReady, onSearch: (trimmed) => ({ search: trimmed }) },
    );

    // Only with two or more pipelines does the page pick one; with one it shows every deal, as it always has
    const pipelines = pipelinesQuery.data ?? [];
    const pipeline = pipelines.length > 1 ? pipelines.find((item) => item.id === filters.pipelineId) : undefined;

    // Shows another pipeline's deals. A stage filter keeps just the stages that pipeline has.
    function showPipeline(pipelineId: number | undefined) {
        const stages = pipelines.find((item) => item.id === pipelineId)?.stages;
        const stageIds = stages ? filters.pipelineStageIds?.filter((id) => stages.some((stage) => stage.id === id)) : filters.pipelineStageIds;
        updateFilters({ pipelineId, pipelineStageIds: stageIds?.length ? stageIds : undefined });
    }

    // Once the pipelines are known: the one in the link, else the one last picked in this browser,
    // else the first (also when the remembered one has been deleted). In an effect, because the
    // server has no localStorage.
    useEffect(() => {
        if (pipelinesQuery.isPending) return;
        const ids = pipelinesQuery.data?.map((item) => item.id);
        if (ids) {
            let remembered: number | undefined;
            try {
                remembered = Number(localStorage.getItem(PIPELINE_KEY)) || undefined;
            } catch {
                // blocked storage: start from the first pipeline
            }
            const next = ids.length > 1 ? ([filters.pipelineId, remembered].find((id) => id !== undefined && ids.includes(id)) ?? ids[0]) : undefined;
            if (next !== filters.pipelineId) showPipeline(next);
        }
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setPipelineReady(true);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pipelinesQuery.isPending, pipelinesQuery.data, filters.pipelineId]);

    function pickPipeline(pipelineId: number) {
        showPipeline(pipelineId);
        try {
            localStorage.setItem(PIPELINE_KEY, String(pipelineId));
        } catch {
            // storage blocked or full: the page just opens on the first pipeline next time
        }
    }

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

    // the stages of the pipeline on screen (with one pipeline, simply all of them)
    const stages = stagesQuery.data?.filter((stage) => filters.pipelineId === undefined || stage.pipelineId === filters.pipelineId);

    const customFieldsQuery = useCustomFields("deal");
    const customFields = customFieldsQuery.data ?? [];

    // "Select all 4,230 matching deals", and whether the selection is big enough for a background job
    const selection = useSelectAll({ endpoint: "/deals", filters, total, items: deals, selected, setSelected });

    // More than a couple of hundred, or every match: a background job with a progress card in the
    // corner (docs/QUEUES.md). A job names its stage "stageId", for leads and deals alike.
    const bulkJob = useMutation({
        mutationFn: async (action: BulkAction) => {
            const { pipelineStageId, ...rest } = action as BulkAction & { pipelineStageId?: number };
            return startBulkJob(queryClient, { entity: "deal", ...rest, ...(pipelineStageId && { stageId: pipelineStageId }), ids: await selection.ids() });
        },
        onSuccess: () => {
            selection.clear();
            setConfirmingDelete(false);
        },
        onError: (error) => toast.error(errorMessage(error)),
    });

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

    // a bulk action: done in the request for a small selection, as a background job for a big one
    const runBulk = (action: BulkAction) => (selection.big ? bulkJob.mutate(action) : bulk.mutate(action));

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
        options: stages?.map((stage) => ({ value: stage.id, label: stage.name, render: <StageLabel stage={stage} /> })) ?? [],
    });

    // open deals nobody has planned anything for: the dashboard's "Deals with no next step"
    const noNextStepField: FilterFieldDef<DealFilters> = {
        key: "noNextStep",
        label: "No next step",
        isActive: (f) => f.noNextStep === true,
        clear: () => ({ noNextStep: undefined }),
        renderControl: (f, onChange) =>
            renderSelectControl(
                f.noNextStep ? "only" : undefined,
                (value) => onChange({ noNextStep: value ? true : undefined }),
                [{ value: "only", label: "Open, no task or call planned" }],
                "All deals",
            ),
        renderChip: () => "No next step",
    };

    const FILTER_FIELDS: FilterFieldDef<DealFilters>[] = [
        pipelineStageField,
        noNextStepField,
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
            stages,
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
                pipelineId={filters.pipelineId}
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
                can={{ update: can.update, delete: can.delete, assign: can.assign, linkLead: can.readLeads, manageProducts: can.manageProducts }}
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

            <div className="flex h-10 shrink-0 items-center gap-1 overflow-x-auto border-b border-line-light px-2 font-medium text-muted [&>*]:shrink-0">
                <ViewSwitcher
                    view={view}
                    onChange={(next) => {
                        setView(next);
                        if (next === "board") setSelected(new Set());
                    }}
                />

                {pipeline && (
                    <Dropdown
                        buttonClassName="flex h-7 items-center gap-1 rounded-lg px-2 hover:bg-fill"
                        label={
                            <>
                                <IconTimeline size={16} />
                                {pipeline.name}
                                <IconChevronDown size={14} className="text-faint" />
                            </>
                        }
                    >
                        {(close) =>
                            pipelines.map((item) => (
                                <MenuItem
                                    key={item.id}
                                    selected={item.id === pipeline.id}
                                    onClick={() => {
                                        close();
                                        if (item.id !== pipeline.id) pickPipeline(item.id);
                                    }}
                                >
                                    {item.name}
                                </MenuItem>
                            ))
                        }
                    </Dropdown>
                )}

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
                        extraLinks={can.managePipeline ? [{ label: "Pipelines & stages", href: "/settings/pipelines" }] : undefined}
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

            {can.read && (stagesQuery.isError || pipelinesQuery.isError) && (
                <div className="border-b border-line-light px-3 py-2">
                    <ErrorState
                        variant="inline"
                        title="Couldn't load the pipeline"
                        error={stagesQuery.error ?? pipelinesQuery.error}
                        onRetry={() => {
                            if (stagesQuery.isError) void stagesQuery.refetch();
                            if (pipelinesQuery.isError) void pipelinesQuery.refetch();
                        }}
                        retrying={stagesQuery.isFetching || pipelinesQuery.isFetching}
                    />
                </div>
            )}

            {view === "table" && (can.update || can.delete) && <SelectAllBar selection={selection} noun="deal" />}

            <div className="relative min-h-0 flex-1 overflow-auto">
                {!can.read ? (
                    <p className="p-4 text-danger">You don&apos;t have permission to view deals.</p>
                ) : view === "table" ? (
                    <DealsTable
                        deals={deals}
                        columns={visibleColumns}
                        tableColumns={{ getWidth, resize, reorderVisible }}
                        loading={dealsQuery.isPending}
                        failed={dealsQuery.isError}
                        error={dealsQuery.error}
                        onRetry={() => dealsQuery.refetch()}
                        retrying={dealsQuery.isFetching}
                        filtered={Boolean(filters.search) || FILTER_FIELDS.some((field) => field.isActive(filters))}
                        selectable={can.update || can.delete}
                        selected={selected}
                        onSelect={selection.onSelect}
                        onOpen={setSelectedDealId}
                        onCreate={can.create ? () => setCreating(true) : undefined}
                    />
                ) : !pipelineReady ? (
                    <PageLoader label="Loading pipeline" variant="board" />
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

            {/* which page of the list, and how many rows a page */}
            {view === "table" && can.read && <Pagination page={paging.page} size={paging.size} total={total} sizes={PAGE_SIZES} onPage={paging.setPage} onSize={paging.setSize} />}

            <BulkBar
                count={selection.count}
                onClear={selection.clear}
                onDelete={can.delete ? () => setConfirmingDelete(true) : undefined}
            >
                {can.update && stages && (
                    <Dropdown
                        openUp
                        buttonClassName="flex h-7 items-center gap-1 rounded-lg px-2 hover:bg-fill"
                        label={<><IconTargetArrow size={14} /> Stage</>}
                    >
                        {(close) => stages.map((stage) => (
                            <MenuItem
                                key={stage.id}
                                onClick={async () => {
                                    close();
                                    const answer = stage.isLost ? await askLostReason("deal") : {};
                                    if (answer) runBulk({ action: "stage", pipelineStageId: stage.id, ...answer });
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
                        onAssign={(assignedToId) => runBulk({ action: "assign", assignedToId })}
                    />
                )}

                {!selection.allMatching && can.update && can.delete && selected.size === 2 && (
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

                {/* in the request for a small selection, a background job for a big one (like the others) */}
                {can.update && (
                    <BulkEditButton
                        count={selection.count}
                        noun="deal"
                        pending={bulk.isPending || bulkJob.isPending}
                        onApply={(changes) => runBulk({ action: "update", changes })}
                        fields={[
                            { key: "amount", label: "Amount", icon: IconCoin, type: "number", toChanges: (value) => ({ amount: Number(value) }) },
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
                count={selection.count}
                noun="deal"
                description={selection.big ? "It runs in the background, so you can keep working. They can be restored from the recycle bin for 30 days." : undefined}
                pending={bulk.isPending || bulkJob.isPending}
                onCancel={() => setConfirmingDelete(false)}
                onConfirm={() => runBulk({ action: "delete" })}
            />
        </div>
    );
}

