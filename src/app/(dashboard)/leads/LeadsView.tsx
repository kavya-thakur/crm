"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
    IconArrowDown,
    IconArrowUp,
    IconBuilding,
    IconChevronDown,
    IconDownload,
    IconFileSpreadsheet,
    IconGitMerge,
    IconProgress,
    IconTag,
    IconUpload,
} from "@tabler/icons-react";

import { api, errorMessage } from "@/lib/api/client";
import { Dropdown, MenuItem } from "@/components/Dropdown";
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
    exportUrl,
    downloadFile,
    toolbarButtonClassName,
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
import {
    StageLabel,
    refreshLeads,
    type Agent,
    type Lead,
    type LeadFilters,
    type LeadSource,
    type LeadStage,
    type Permissions,
} from "./shared";
import LeadsTable, { LEAD_COLUMNS, withLeadEdits } from "./LeadsTable";
import LeadsBoard from "./LeadsBoard";
import LeadPanel from "./LeadPanel";
import { MergeLeadsPanel } from "./MergeLeads";
import { startBulkJob } from "../BackgroundJobs";
import { SelectAllBar, useSelectAll } from "../shared/useSelectAll";
import { PAGE_SIZES } from "../shared/useUrlState";
import NewLeadDialog from "./NewLeadDialog";
import { useListQuery } from "../shared/useListQuery";
import { createCustomColumn, createCustomFilterField, customBulkFields, useCustomFields } from "../shared/customFields";
import { useUrlState } from "../shared/useUrlState";
import { CompanyOptions } from "../shared/CompanyPicker";


const SORT_FIELDS: { field: LeadFilters["sortBy"]; label: string }[] = [
    { field: "name", label: "Name" },
    { field: "createdAt", label: "Created" },
    { field: "updatedAt", label: "Last update" },
];

type BulkAction =
    | { action: "update"; changes: Record<string, unknown> }
    | { action: "stage"; stageId: number; lostReason?: string | null }
    | { action: "assign"; assignedToId: number | null }
    | { action: "delete" };

export default function LeadsView({ can, meId }: { can: Permissions; meId: number }) {
    const queryClient = useQueryClient();
    const router = useRouter();

    // list or board, kept in the URL so a refresh keeps it (the list is the default)
    // The open lead lives in the URL (?open=12): a refresh reopens it, Back closes it, and a
    // link from elsewhere (the Notes feed, a notification) lands straight on it
    const page = useUrlState();
    const openLeadId = Number(page.get("open")) || null;
    const setOpenLeadId = (id: number | null) => page.set({ open: id ? String(id) : null }, "push");
    const view = page.get("view") === "board" ? "board" : "table";
    const setView = (next: "table" | "board") => page.set({ view: next === "table" ? null : next });
    const [creating, setCreating] = useState(false);
    const [confirmingDelete, setConfirmingDelete] = useState(false);
    // two leads picked in the table, being merged; the one added first (lower id) stays
    const [merging, setMerging] = useState<{ keepId: number; duplicateId: number } | null>(null);

    const {
        query: leadsQuery,
        paging,
        items: leads,
        total,
        filters,
        updateFilters,
        searchInput,
        setSearchInput,
        selected,
        setSelected,
    } = useListQuery<Lead, LeadFilters>(
        "leads",
        "/leads",
        { sortBy: "createdAt", sortOrder: "desc" },
        { onSearch: (trimmed) => ({ search: trimmed || undefined }) },
    );

    // "Select all 4,230 matching leads", and whether the selection is big enough for a background job
    const selection = useSelectAll({ endpoint: "/leads", filters, total, items: leads, selected, setSelected });

    // For the assignee filter and the assign menus
    const agents = useQuery({
        queryKey: ["agents"],
        queryFn: () => api.get<{ data: Agent[] }>("/agents").then((res) => res.data.data),
        enabled: can.seeAgents,
    });

    const customFieldsQuery = useCustomFields("lead");
    const customFields = customFieldsQuery.data ?? [];

    const stagesQuery = useQuery({
        queryKey: ["leadStage"],
        queryFn: () => api.get<{ data: LeadStage[] }>("/lead-stages").then((res) => res.data.data),
    });

    const sourcesQuery = useQuery({
        queryKey: ["leadSource"],
        queryFn: () => api.get<{ data: LeadSource[] }>("/lead-sources").then((res) => res.data.data),
    });

    // More than a couple of hundred, or every match: a background job with a progress card in the
    // corner (docs/QUEUES.md). The ids are the ticked rows, or every match.
    const bulkJob = useMutation({
        mutationFn: async (action: BulkAction) => startBulkJob(queryClient, { entity: "lead", ...action, ids: await selection.ids() }),
        onSuccess: () => {
            selection.clear();
            setConfirmingDelete(false);
        },
        onError: (error) => toast.error(errorMessage(error)),
    });

    const bulk = useMutation({
        mutationFn: (body: BulkAction) => api.patch("/leads/bulkUpdate", { ...body, leadIds: [...selected] }),
        onSuccess: (_res, body) => {
            // read before the selection is cleared below
            const count = selected.size;
            const leadsLabel = `${count} ${count === 1 ? "lead" : "leads"}`;

            toast.success(
                body.action === "delete"
                    ? `${leadsLabel} deleted`
                    : body.action === "update"
                        ? `${leadsLabel} updated`
                    : body.action === "stage"
                        ? `${leadsLabel} moved`
                        : body.assignedToId === null
                            ? `${leadsLabel} unassigned`
                            : `${leadsLabel} assigned`
            );
            setSelected(new Set());
            setConfirmingDelete(false);
            refreshLeads(queryClient);
        },
        onError: (error) => toast.error(errorMessage(error)),
    });

    // a bulk action: done in the request for a small selection, as a background job for a big one
    const runBulk = (action: BulkAction) => (selection.big ? bulkJob.mutate(action) : bulk.mutate(action));

    // Inline edits from the table — a single-row PUT, same endpoint the lead
    // panel itself uses, so both stay in sync. Assignment goes through its
    // own endpoint so it's logged to the timeline, just like everywhere else.
    const updateLead = useMutation({
        mutationFn: ({ id, changes }: { id: number; changes: Record<string, unknown> }) => api.put(`/leads/${id}`, changes),
        onSuccess: () => {
            toast.success("Lead updated");
            refreshLeads(queryClient);
        },
        onError: (error) => toast.error(errorMessage(error)),
    });

    const assignLead = useMutation({
        mutationFn: ({ id, assignedToId }: { id: number; assignedToId: number | null }) =>
            api.post(`/leads/${id}/assign`, { assignedToId }),
        onSuccess: (_res, { assignedToId }) => {
            toast.success(assignedToId === null ? "Lead unassigned" : "Lead assigned");
            refreshLeads(queryClient);
        },
        onError: (error) => toast.error(errorMessage(error)),
    });

    const isDefaultSort = filters.sortBy === "createdAt" && filters.sortOrder === "desc";

    // The only field here that's genuinely specific to Leads; assignedTo and
    // the created-date range are the exact same for every entity, so they
    // come from shared factories instead of being hand-written three times.
    // tick as many stages as you like: "New or Screening"
    const stageField = createMultiSelectField<LeadFilters>({
        key: "stage",
        label: "Stage",
        get: (f) => f.stageIds,
        set: (value) => ({ stageIds: value }),
        options: stagesQuery.data?.map((stage) => ({ value: stage.id, label: stage.name, render: <StageLabel stage={stage} /> })) ?? [],
    });

    const sourceField: FilterFieldDef<LeadFilters> = {
        key: "source",
        label: "Source",
        isActive: (f) => f.sourceId !== undefined,
        clear: () => ({ sourceId: undefined }),
        renderControl: (f, onChange) =>
            renderSelectControl(
                f.sourceId,
                (value) => onChange({ sourceId: value ? Number(value) : undefined }),
                sourcesQuery.data?.map((source) => ({ value: source.id, label: source.name })) ?? [],
                "Any source",
            ),
        renderChip: (f) => `Source: ${sourcesQuery.data?.find((source) => source.id === f.sourceId)?.name ?? "Selected"}`,
    };

    // open leads that look like the same person as another open lead, to clean up in one place
    const duplicatesField: FilterFieldDef<LeadFilters> = {
        key: "duplicates",
        label: "Possible duplicates",
        isActive: (f) => f.duplicates === true,
        clear: () => ({ duplicates: undefined }),
        renderControl: (f, onChange) =>
            renderSelectControl(
                f.duplicates ? "only" : undefined,
                (value) => onChange({ duplicates: value ? true : undefined }),
                [{ value: "only", label: "Only possible duplicates" }],
                "All leads",
            ),
        renderChip: () => "Possible duplicates",
    };

    const FILTER_FIELDS: FilterFieldDef<LeadFilters>[] = [
        stageField,
        sourceField,
        duplicatesField,
        createAssignedToField<LeadFilters>({
            get: (f) => f.assignedTo,
            set: (value) => ({ assignedTo: value }),
            agents: can.seeAgents ? agents.data : undefined,
        }),
        createPersonField<LeadFilters>({
            key: "createdBy",
            label: "Created by",
            get: (f) => f.createdBy,
            set: (value) => ({ createdBy: value }),
            agents: can.seeAgents ? agents.data : undefined,
        }),
        createPersonField<LeadFilters>({
            key: "updatedBy",
            label: "Modified by",
            get: (f) => f.updatedBy,
            set: (value) => ({ updatedBy: value }),
            agents: can.seeAgents ? agents.data : undefined,
        }),
        createCreatedRangeField<LeadFilters>(),
        createModifiedRangeField<LeadFilters>(),
        ...customFields
            .filter((field) => field.showInFilter)
            .map((field) => createCustomFilterField<LeadFilters>(field, { agents: can.seeAgents ? agents.data : undefined })),
    ];

    const hasFilterBar = FILTER_FIELDS.some((field) => field.isActive(filters)) || !isDefaultSort;

    const columns = [
        ...withLeadEdits(LEAD_COLUMNS, {
            canUpdate: can.update,
            canAssign: can.assign,
            stages: stagesQuery.data,
            sources: sourcesQuery.data,
            agents: can.seeAgents ? agents.data : undefined,
            onUpdate: (lead, changes) => updateLead.mutate({ id: lead.id, changes }),
            onAssign: (lead, assignedToId) => assignLead.mutate({ id: lead.id, assignedToId }),
        }),
        ...customFields
            .filter((field) => field.showInList)
            .map((field) => createCustomColumn<Lead>(field, (lead) => lead.customFields, {
                    agents: can.seeAgents ? agents.data : undefined,
                    onUpdate: can.update ? (lead, changes) => updateLead.mutate({ id: lead.id, changes }) : undefined,
                })),
    ];
    const { columnPrefs, visibleColumns, getWidth, resize, reorderVisible } = useTableColumns("leads-columns", columns);

    if (creating) {
        return (
            <NewLeadDialog
                open
                canAssign={can.assign}
                canLinkContact={can.canLinkContact}
                agents={agents.data}
                onClose={() => setCreating(false)}
                onCreated={(lead) => {
                    setCreating(false);
                    refreshLeads(queryClient);
                    setOpenLeadId(lead.id);
                }}
            />
        );
    }

    if (openLeadId !== null) {
        return (
            <LeadPanel
                // key: switching leads starts a fresh panel (no leftover edit state)
                key={openLeadId}
                leadId={openLeadId}
                can={can}
                agents={agents.data}
                meId={meId}
                onClose={() => setOpenLeadId(null)}
            />
        );
    }

    return (
        <div className="flex h-full flex-col">
            <ListHeader
                section="leads"
                title="Leads"
                count={total}
                createLabel="New Lead"
                onCreate={can.create ? () => setCreating(true) : undefined}
            />

            {/* View bar: view switcher on the left, search / filter / sort on the right */}
            <div className="flex h-10 shrink-0 items-center gap-1 overflow-x-auto border-b border-line-light px-2 font-medium text-muted [&>*]:shrink-0">
                <ViewSwitcher
                    view={view}
                    onChange={(next) => {
                        setView(next);
                        if (next === "board") setSelected(new Set());
                    }}
                />

                <div className="ml-auto flex items-center gap-1">
                    <SearchBox value={searchInput} ariaLabel="Search leads" onChange={setSearchInput} />

                    <FilterPanelButton
                        entity="lead"
                        filters={filters}
                        onChange={updateFilters}
                        fields={FILTER_FIELDS}
                    />

                    <SortMenu fields={SORT_FIELDS} sortBy={filters.sortBy} sortOrder={filters.sortOrder} onChange={updateFilters} />

                    {/* getting leads in and out, in one menu */}
                    {can.create ? (
                        <Dropdown
                            align="right"
                            buttonClassName={toolbarButtonClassName}
                            label={
                                <>
                                    <IconUpload size={14} />
                                    Import
                                    <IconChevronDown size={13} className="text-faint" />
                                </>
                            }
                        >
                            {(close) => (
                                <>
                                    <MenuItem onClick={() => { close(); router.push("/leads/import"); }}>
                                        <IconUpload size={15} className="text-faint" /> Import leads from CSV
                                    </MenuItem>
                                    <MenuItem onClick={() => { close(); downloadFile(exportUrl("/leads", filters)); }}>
                                        <IconDownload size={15} className="text-faint" /> Export these leads to CSV
                                    </MenuItem>
                                    <MenuItem onClick={() => { close(); downloadFile("/api/imports/sample"); }}>
                                        <IconFileSpreadsheet size={15} className="text-faint" /> Download sample CSV
                                    </MenuItem>
                                </>
                            )}
                        </Dropdown>
                    ) : (
                        <ExportButton endpoint="/leads" filters={filters} />
                    )}

                    <OptionsMenuButton
                        columns={columns}
                        columnPrefs={columnPrefs}
                        canManageCustomFields={can.manageCustomFields}
                        extraLinks={[
                            ...(can.manageLeadStages ? [{ label: "Lead stages", href: "/settings/stages" }] : []),
                            ...(can.manageLeadSources ? [{ label: "Lead sources", href: "/settings/stages" }] : []),
                        ]}
                    />
                </div>
            </div>

            {/* Active filters and sort, as removable chips */}
            <FilterBar
                show={hasFilterBar}
                onReset={() => updateFilters({
                    ...FILTER_FIELDS.reduce((acc, field) => ({ ...acc, ...field.clear(filters) }), {}),
                    sortBy: "createdAt",
                    sortOrder: "desc",
                })}
            >
                {!isDefaultSort && (
                    <FilterChip onRemove={() => updateFilters({ sortBy: "createdAt", sortOrder: "desc" })}>
                        {filters.sortOrder === "asc" ? <IconArrowUp size={14} /> : <IconArrowDown size={14} />}
                        {SORT_FIELDS.find((s) => s.field === filters.sortBy)?.label}
                    </FilterChip>
                )}
                <ActiveFilterChips fields={FILTER_FIELDS} filters={filters} onChange={updateFilters} />
            </FilterBar>

            {view === "table" && (can.update || can.delete) && <SelectAllBar selection={selection} noun="lead" />}

            <div className="relative min-h-0 flex-1 overflow-auto">
                {view === "table" ? (
                    <LeadsTable
                        leads={leads}
                        columns={visibleColumns}
                        tableColumns={{ getWidth, resize, reorderVisible }}
                        loading={leadsQuery.isPending}
                        failed={leadsQuery.isError}
                        error={leadsQuery.error}
                        onRetry={() => leadsQuery.refetch()}
                        filtered={Boolean(filters.search) || FILTER_FIELDS.some((field) => field.isActive(filters))}
                        selectable={can.update || can.delete}
                        selected={selected}
                        onSelect={selection.onSelect}
                        onOpen={setOpenLeadId}
                        onCreate={can.create ? () => setCreating(true) : undefined}
                    />
                ) : (
                    <LeadsBoard
                        filters={filters}
                        columns={visibleColumns}
                        canMove={can.update}
                        onOpen={setOpenLeadId}
                        onCreate={can.create ? () => setCreating(true) : undefined}
                    />
                )}
            </div>

            {/* which page of the list, and how many rows a page */}
            {view === "table" && <Pagination page={paging.page} size={paging.size} total={total} sizes={PAGE_SIZES} onPage={paging.setPage} onSize={paging.setSize} />}

            {/* Bulk actions, Twenty's floating bar */}
            <BulkBar
                count={selection.count}
                onClear={selection.clear}
                onDelete={can.delete ? () => setConfirmingDelete(true) : undefined}
            >
                {can.update && stagesQuery.data && (
                    <Dropdown
                        openUp
                        buttonClassName="flex h-7 items-center gap-1 rounded-lg px-2 hover:bg-fill"
                        label={<><IconProgress size={14} /> Stage</>}
                    >
                        {(close) =>
                            stagesQuery.data.map((stage) => (
                                <MenuItem
                                    key={stage.id}
                                    onClick={async () => {
                                        close();
                                        const answer = stage.isLost ? await askLostReason("lead") : {};
                                        if (answer) runBulk({ action: "stage", stageId: stage.id, ...answer });
                                    }}
                                >
                                    <StageLabel stage={stage} />
                                </MenuItem>
                            ))
                        }
                    </Dropdown>
                )}

                {can.assign && agents.data && (
                    <AssignMenu
                        agents={agents.data}
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

                {/* editing a field runs in the request, so only for a selection that fits in one */}
                {!selection.big && can.update && (
                    <BulkEditButton
                        count={selected.size}
                        noun="lead"
                        pending={bulk.isPending}
                        onApply={(changes) => bulk.mutate({ action: "update", changes })}
                        fields={[
                            ...(sourcesQuery.data
                                ? [
                                      {
                                          key: "source",
                                          label: "Source",
                                          icon: IconTag,
                                          type: "select" as const,
                                          clearable: true,
                                          options: sourcesQuery.data.map((source) => ({ value: String(source.id), label: source.name })),
                                          toChanges: (value: string) => ({ sourceId: value ? Number(value) : null }),
                                      },
                                  ]
                                : []),
                            {
                                key: "company",
                                label: "Company",
                                icon: IconBuilding,
                                type: "text",
                                clearable: true,
                                toChanges: (value) => ({ companyName: value || null }),
                                input: (value, onChange) => <CompanyOptions value={value || null} onPick={(name) => onChange(name ?? "")} />,
                            },
                            ...customBulkFields(customFields, can.seeAgents ? agents.data : undefined),
                        ]}
                    />
                )}
            </BulkBar>

            <MergeLeadsPanel
                pair={merging}
                onClose={() => setMerging(null)}
                onMerged={(keptId) => {
                    setMerging(null);
                    setSelected(new Set());
                    setOpenLeadId(keptId);
                }}
            />

            <ConfirmDeleteModal
                open={confirmingDelete}
                count={selection.count}
                noun="lead"
                description={
                    selection.big
                        ? "Their timelines, notes, tasks and activities go too. It runs in the background, so you can keep working. They can be restored from the recycle bin for 30 days."
                        : "Their timeline history is deleted too. They can be restored from the recycle bin for 30 days."
                }
                pending={bulk.isPending || bulkJob.isPending}
                onCancel={() => setConfirmingDelete(false)}
                onConfirm={() => runBulk({ action: "delete" })}
            />
        </div>
    );
}

