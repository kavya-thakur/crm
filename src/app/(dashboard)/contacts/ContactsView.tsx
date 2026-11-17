"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { IconArrowDown, IconArrowUp, IconBriefcase, IconBuilding } from "@tabler/icons-react";

import { api, errorMessage } from "@/lib/api/client";
import { toast } from "@/components/Toast";
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
    Pagination,
} from "@/components/ListPage";
import {
    ActiveFilterChips,
    FilterPanelButton,
    OptionsMenuButton,
    createAssignedToField,
    createCreatedRangeField,
    createModifiedRangeField,
    createPersonField,
    useTableColumns,
} from "@/components/FilterPanel";
import {
    refreshContacts,
    type Agent,
    type Contact,
    type ContactFilters,
    type Permissions,
} from "./shared";
import ContactsTable, { CONTACT_COLUMNS, withContactEdits } from "./ContactsTable";
import ContactPanel from "./ContactPanel";
import NewContactDialog from "./NewContactDialog";
import { startBulkJob } from "../BackgroundJobs";
import { SelectAllBar, useSelectAll } from "../shared/useSelectAll";
import { PAGE_SIZES } from "../shared/useUrlState";
import { useListQuery } from "../shared/useListQuery";
import { createCustomColumn, createCustomFilterField, customBulkFields, useCustomFields } from "../shared/customFields";
import { useUrlState } from "../shared/useUrlState";
import { CompanyOptions } from "../shared/CompanyPicker";


const SORT_FIELDS: { field: ContactFilters["sortBy"]; label: string }[] = [
    { field: "name", label: "Name" },
    { field: "email", label: "Email" },
    { field: "createdAt", label: "Created" },
    { field: "updatedAt", label: "Last update" },
];

type BulkAction =
    | { action: "update"; changes: Record<string, unknown> }
    | { action: "assign"; assignedToId: number | null }
    | { action: "delete" };

export default function ContactsView({ can, meId }: { can: Permissions; meId: number }) {
    const queryClient = useQueryClient();

    // The open contact lives in the URL (?open=12): a refresh reopens it, Back closes it, and a
    // link from elsewhere (the Notes feed, a notification) lands straight on it
    const page = useUrlState();
    const openContactId = Number(page.get("open")) || null;
    const setOpenContactId = (id: number | null) => page.set({ open: id ? String(id) : null }, "push");
    const [creating, setCreating] = useState(false);
    const [confirmingDelete, setConfirmingDelete] = useState(false);

    const {
        query: contactsQuery,
        paging,
        items: contacts,
        total,
        filters,
        updateFilters,
        searchInput,
        setSearchInput,
        selected,
        setSelected,
    } = useListQuery<Contact, ContactFilters>(
        "contacts",
        "/contacts",
        { sortBy: "createdAt", sortOrder: "desc" },
        { onSearch: (trimmed) => ({ search: trimmed || undefined }) },
    );

    // For the assignee filter and the assign menus
    const agents = useQuery({
        queryKey: ["agents"],
        queryFn: () => api.get<{ data: Agent[] }>("/agents").then((res) => res.data.data),
        enabled: can.seeAgents,
    });

    const customFieldsQuery = useCustomFields("contact");
    const customFields = customFieldsQuery.data ?? [];

    // "Select all 4,230 matching contacts", and whether the selection is big enough for a background job
    const selection = useSelectAll({ endpoint: "/contacts", filters, total, items: contacts, selected, setSelected });

    // More than a couple of hundred, or every match: a background job with a progress card in the
    // corner (docs/QUEUES.md)
    const bulkJob = useMutation({
        mutationFn: async (action: BulkAction) => startBulkJob(queryClient, { entity: "contact", ...action, ids: await selection.ids() }),
        onSuccess: () => {
            selection.clear();
            setConfirmingDelete(false);
        },
        onError: (error) => toast.error(errorMessage(error)),
    });

    const bulk = useMutation({
        mutationFn: (body: BulkAction) => api.patch("/contacts/bulkUpdate", { ...body, contactIds: [...selected] }),
        onSuccess: (_, body) => {
            const count = selected.size;
            const noun = count === 1 ? "contact" : "contacts";
            toast.success(
                body.action === "delete"
                    ? `${count} ${noun} deleted`
                    : body.action === "update"
                        ? `${count} ${noun} updated`
                    : body.assignedToId === null
                        ? `${count} ${noun} unassigned`
                        : `${count} ${noun} assigned`
            );
            setSelected(new Set());
            setConfirmingDelete(false);
            refreshContacts(queryClient);
        },
        onError: (error) => toast.error(errorMessage(error)),
    });

    // a bulk action: done in the request for a small selection, as a background job for a big one
    const runBulk = (action: BulkAction) => (selection.big ? bulkJob.mutate(action) : bulk.mutate(action));

    // Inline edits from the table — a single-row PUT, same endpoint the
    // contact panel itself uses. Assignment goes through its own endpoint so
    // it's logged to the timeline, just like everywhere else.
    const updateContact = useMutation({
        mutationFn: ({ id, changes }: { id: number; changes: Record<string, unknown> }) => api.put(`/contacts/${id}`, changes),
        onSuccess: () => {
            toast.success("Contact updated");
            refreshContacts(queryClient);
        },
        onError: (error) => toast.error(errorMessage(error)),
    });

    const assignContact = useMutation({
        mutationFn: ({ id, assignedToId }: { id: number; assignedToId: number | null }) =>
            api.post(`/contacts/${id}/assign`, { assignedToId }),
        onSuccess: (_, { assignedToId }) => {
            toast.success(assignedToId === null ? "Contact unassigned" : "Contact assigned");
            refreshContacts(queryClient);
        },
        onError: (error) => toast.error(errorMessage(error)),
    });

    const isDefaultSort = filters.sortBy === "createdAt" && filters.sortOrder === "desc";

    const FILTER_FIELDS = [
        // the company they're at, searched like the company picker, or no company at all
        {
            key: "company",
            label: "Company",
            isActive: (f: ContactFilters) => !!f.company,
            clear: () => ({ company: undefined }),
            renderControl: (f: ContactFilters, onChange: (change: Partial<ContactFilters>) => void) => (
                <CompanyOptions value={f.company && f.company !== "none" ? f.company : null} onPick={(name) => onChange({ company: name ?? "none" })} canAdd={false} noneLabel="Without a company" />
            ),
            renderChip: (f: ContactFilters) => (f.company === "none" ? "Without a company" : `Company: ${f.company}`),
        },
        createAssignedToField<ContactFilters>({
            get: (f) => f.assignedTo,
            set: (value) => ({ assignedTo: value }),
            agents: can.seeAgents ? agents.data : undefined,
        }),
        createPersonField<ContactFilters>({
            key: "createdBy",
            label: "Created by",
            get: (f) => f.createdBy,
            set: (value) => ({ createdBy: value }),
            agents: can.seeAgents ? agents.data : undefined,
        }),
        createPersonField<ContactFilters>({
            key: "updatedBy",
            label: "Modified by",
            get: (f) => f.updatedBy,
            set: (value) => ({ updatedBy: value }),
            agents: can.seeAgents ? agents.data : undefined,
        }),
        createCreatedRangeField<ContactFilters>(),
        createModifiedRangeField<ContactFilters>(),
        ...customFields
            .filter((field) => field.showInFilter)
            .map((field) => createCustomFilterField<ContactFilters>(field, { agents: can.seeAgents ? agents.data : undefined })),
    ];

    const hasFilterBar = FILTER_FIELDS.some((field) => field.isActive(filters)) || !isDefaultSort;

    const contactColumns = [
        ...withContactEdits(CONTACT_COLUMNS, {
            canUpdate: can.update,
            canAssign: can.assign,
            agents: can.seeAgents ? agents.data : undefined,
            onUpdate: (contact, changes) => updateContact.mutate({ id: contact.id, changes }),
            onAssign: (contact, assignedToId) => assignContact.mutate({ id: contact.id, assignedToId }),
        }),
        ...customFields
            .filter((field) => field.showInList)
            .map((field) => createCustomColumn<Contact>(field, (contact) => contact.customFields, {
                    agents: can.seeAgents ? agents.data : undefined,
                    onUpdate: can.update ? (contact, changes) => updateContact.mutate({ id: contact.id, changes }) : undefined,
                })),
    ];
    const { columnPrefs, visibleColumns, getWidth, resize, reorderVisible } = useTableColumns("contacts-columns", contactColumns);

    if (creating) {
        return (
            <NewContactDialog
                open
                canAssign={can.assign}
                agents={agents.data}
                onClose={() => setCreating(false)}
                onCreated={(contact) => {
                    setCreating(false);
                    refreshContacts(queryClient);
                    setOpenContactId(contact.id);
                }}
            />
        );
    }

    if (openContactId !== null) {
        return (
            <ContactPanel
                // key: switching contacts starts a fresh panel (no leftover edit state)
                key={openContactId}
                contactId={openContactId}
                can={can}
                agents={agents.data}
                meId={meId}
                onClose={() => setOpenContactId(null)}
            />
        );
    }

    return (
        <div className="flex h-full flex-col">
            <ListHeader
                section="contacts"
                title="Contacts"
                count={total}
                createLabel="New Contact"
                onCreate={can.create ? () => setCreating(true) : undefined}
            />

            {/* Search / filter / sort */}
            <div className="flex h-10 shrink-0 items-center gap-1 overflow-x-auto border-b border-line-light px-2 font-medium text-muted [&>*]:shrink-0 [&>*:first-child]:ml-auto">
                <SearchBox value={searchInput} ariaLabel="Search contacts" onChange={setSearchInput} />

                <FilterPanelButton
                    entity="contact"
                    filters={filters}
                    onChange={updateFilters}
                    fields={FILTER_FIELDS}
                />

                <SortMenu fields={SORT_FIELDS} sortBy={filters.sortBy} sortOrder={filters.sortOrder} onChange={updateFilters} />

                <ExportButton endpoint="/contacts" filters={filters} />

                <OptionsMenuButton columns={contactColumns} columnPrefs={columnPrefs} canManageCustomFields={can.manageCustomFields} />
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

            {(can.update || can.delete) && <SelectAllBar selection={selection} noun="contact" />}

            <div className="relative min-h-0 flex-1 overflow-auto">
                <ContactsTable
                    contacts={contacts}
                    columns={visibleColumns}
                    tableColumns={{ getWidth, resize, reorderVisible }}
                    loading={contactsQuery.isPending}
                    failed={contactsQuery.isError}
                    error={contactsQuery.error}
                    onRetry={() => contactsQuery.refetch()}
                    filtered={Boolean(filters.search) || FILTER_FIELDS.some((field) => field.isActive(filters))}
                    selectable={can.update || can.delete}
                    selected={selected}
                    onSelect={selection.onSelect}
                    onOpen={setOpenContactId}
                    onCreate={can.create ? () => setCreating(true) : undefined}
                />
            </div>

            {/* which page of the list, and how many rows a page */}
            <Pagination page={paging.page} size={paging.size} total={total} sizes={PAGE_SIZES} onPage={paging.setPage} onSize={paging.setSize} />

            {/* Bulk actions, Twenty's floating bar */}
            <BulkBar
                count={selection.count}
                onClear={selection.clear}
                onDelete={can.delete ? () => setConfirmingDelete(true) : undefined}
            >
                {can.assign && agents.data && (
                    <AssignMenu
                        agents={agents.data}
                        onAssign={(assignedToId) => runBulk({ action: "assign", assignedToId })}
                    />
                )}

                {/* in the request for a small selection, a background job for a big one (like the others) */}
                {can.update && (
                    <BulkEditButton
                        count={selection.count}
                        noun="contact"
                        pending={bulk.isPending || bulkJob.isPending}
                        onApply={(changes) => runBulk({ action: "update", changes })}
                        fields={[
                            {
                                key: "company",
                                label: "Company",
                                icon: IconBuilding,
                                type: "text",
                                clearable: true,
                                toChanges: (value) => ({ companyName: value || null }),
                                input: (value, onChange) => <CompanyOptions value={value || null} onPick={(name) => onChange(name ?? "")} />,
                            },
                            { key: "jobTitle", label: "Job title", icon: IconBriefcase, type: "text", clearable: true, toChanges: (value) => ({ jobTitle: value || null }) },
                            ...customBulkFields(customFields, can.seeAgents ? agents.data : undefined),
                        ]}
                    />
                )}
            </BulkBar>

            <ConfirmDeleteModal
                open={confirmingDelete}
                count={selection.count}
                noun="contact"
                description={selection.big ? "It runs in the background, so you can keep working. They can be restored from the recycle bin for 30 days." : undefined}
                pending={bulk.isPending || bulkJob.isPending}
                onCancel={() => setConfirmingDelete(false)}
                onConfirm={() => runBulk({ action: "delete" })}
            />
        </div>
    );
}
