"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
    IconAddressBook,
    IconArrowRight,
    IconBuilding,
    IconCalendar,
    IconCalendarEvent,
    IconChecklist,
    IconChevronDown,
    IconClock,
    IconFiles,
    IconForms,
    IconGitMerge,
    IconLock,
    IconMail,
    IconMailFast,
    IconPhone,
    IconPlus,
    IconPoint,
    IconProgress,
    IconSettings,
    IconTag,
    IconTargetArrow,
    IconTrash,
    IconUserCheck,
    IconUserCircle,
    IconUserMinus,
    IconUserOff,
    IconX,
    IconThumbDown,
} from "@tabler/icons-react";

import { api, errorMessage } from "@/lib/api/client";
import { Dropdown, MenuItem, SearchableItems } from "@/components/Dropdown";
import { Select } from "@/components/Select";
import { StageBadge } from "@/components/StageBadge";
import { ConfirmDeleteModal } from "@/components/ListPage";
import { ErrorState } from "@/components/ErrorState";
import { PageLoader, SkeletonList, Spinner } from "@/components/Loader";
import { toast } from "@/components/Toast";
import { Avatar } from "@/components/Avatar";
import { askLostReason, LostReasonValue } from "@/components/LostReasonPrompt";
import { formatDate, timeAgo } from "@/lib/utils/format";
import { groupCustomFields, useCustomFields, type CustomFieldDef, isSameFieldValue } from "../shared/customFields";
import { usePanelEnter } from "../shared/usePanelEnter";
import { NotesTab } from "../shared/notes";
import { ActivitiesTab } from "../shared/activities";
import { TasksTab } from "../shared/tasks";
import {
    StageLabel,
    refreshLeads,
    type Agent,
    type Lead,
    type LeadSource,
    type LeadStage,
    type Paginated,
    type Permissions,
} from "./shared";
import ConvertToDealDialog from "./ConvertToDealDialog";
import { MergeLeadsPanel, PossibleDuplicates } from "./MergeLeads";

interface TimelineEntry {
    id: number;
    type: string;
    message: string;
    createdAt: string;
    // task events carry the task they are about
    metadata: { taskId?: number } | null;
    user: { id: number; name: string };
}

const TIMELINE_ICONS: Record<string, typeof IconPlus> = {
    CREATED: IconPlus,
    STATUS_CHANGED: IconProgress,
    ASSIGNED: IconUserCheck,
    REASSIGNED: IconUserCheck,
    UNASSIGNED: IconUserMinus,
    CONVERTED: IconArrowRight,
    TASK_CREATED: IconChecklist,
    TASK_COMPLETED: IconChecklist,
    WEB_FORM: IconForms,
    MERGED: IconGitMerge,
};

type LeadChanges = Partial<Pick<Lead, "name" | "email" | "phone" | "companyName" | "stageId" | "lostReason">> & {
    sourceId?: number | null;
    customFields?: Record<string, unknown>;
};

interface LeadPanelProps {
    leadId: number;
    can: Permissions;
    agents?: Agent[];
    meId: number;
    onClose: () => void;
}

// Twenty's record side panel: fields you can click to edit, then the activity timeline
export default function LeadPanel({ leadId, can, agents, meId, onClose }: LeadPanelProps) {
    const queryClient = useQueryClient();
    const [confirmingDelete, setConfirmingDelete] = useState(false);
    const [converting, setConverting] = useState(false);
    // the duplicate being merged into this lead
    const [merging, setMerging] = useState<{ keepId: number; duplicateId: number } | null>(null);
    const [tab, setTab] = useState<"timeline" | "notes" | "tasks" | "activities">("timeline");

    const leadQuery = useQuery({
        queryKey: ["lead", leadId],
        queryFn: () => api.get<{ data: Lead }>(`/leads/${leadId}`).then((res) => res.data.data),
    });

    const timelineQuery = useInfiniteQuery({
        queryKey: ["lead", leadId, "timeline"],
        queryFn: ({ pageParam }) =>
            api
                .get<Paginated<TimelineEntry>>(`/leads/${leadId}/timeline`, { params: { page: pageParam, limit: 20 } })
                .then((res) => res.data),
        initialPageParam: 1,
        getNextPageParam: ({ pagination }) =>
            pagination.page < pagination.totalPages ? pagination.page + 1 : undefined,
    });

    const update = useMutation({
        mutationFn: (changes: LeadChanges) => api.put<{ data: Lead }>(`/leads/${leadId}`, changes),
        onSuccess: (res) => {
            // show the saved value right away, then refresh lists and the timeline
            queryClient.setQueryData(["lead", leadId], res.data.data);
            toast.success("Lead updated");
            refreshLeads(queryClient);
        },
    });

    const assign = useMutation({
        mutationFn: (assignedToId: number | null) => api.post(`/leads/${leadId}/assign`, { assignedToId }),
        onSuccess: (_res, assignedToId) => {
            toast.success(assignedToId === null ? "Lead unassigned" : "Lead assigned");
            refreshLeads(queryClient);
        },
    });

    const remove = useMutation({
        mutationFn: () => api.delete(`/leads/${leadId}`),
        onSuccess: () => {
            toast.success("Lead deleted");
            queryClient.invalidateQueries({ queryKey: ["leads"] });
            onClose();
        },
    });

    // Esc closes the panel (but not while a confirm dialog is open; that one closes first)
    useEffect(() => {
        function onKeyDown(e: KeyboardEvent) {
            if (e.key === "Escape" && !document.querySelector("dialog[open]")) onClose();
        }
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [onClose]);

    const customFieldsQuery = useCustomFields("lead");

    const stagesQuery = useQuery({
        queryKey: ["leadStage"],
        queryFn: () => api.get<{ data: LeadStage[] }>("/lead-stages").then((res) => res.data.data),
        enabled: can.update,
    });

    const sourcesQuery = useQuery({
        queryKey: ["leadSource"],
        queryFn: () => api.get<{ data: LeadSource[] }>("/lead-sources").then((res) => res.data.data),
        enabled: can.update,
    });

    const lead = leadQuery.data;
    const timeline = timelineQuery.data?.pages.flatMap((page) => page.data) ?? [];
    const mutationError = update.error ?? assign.error ?? remove.error;
    const enterRef = usePanelEnter<HTMLDivElement>();

    return (
        <div ref={enterRef} className="flex h-full min-h-0 flex-col">
            <header className="flex h-12 shrink-0 items-center gap-1.5 border-b border-line bg-paper px-3">
                <IconTargetArrow size={16} className="text-accent" />
                <button type="button" onClick={onClose} className="rounded px-1 text-muted hover:bg-fill hover:text-ink">
                    Leads
                </button>
                <span className="text-faint">/</span>
                <span className="truncate rounded px-1 font-semibold">{lead?.name ?? "..."}</span>

                <div className="ml-auto flex items-center gap-0.5">
                    {can.convertToDeal && lead && !lead.stage.isConverted && (
                        <button
                            onClick={() => setConverting(true)}
                            className="flex h-7 items-center gap-1 rounded-lg px-2 font-medium text-accent hover:bg-accent-faint"
                        >
                            <IconArrowRight size={14} />
                            Convert to Deal
                        </button>
                    )}
                    {can.delete && lead && (
                        <button
                            aria-label="Delete lead"
                            onClick={() => setConfirmingDelete(true)}
                            className="flex size-7 items-center justify-center rounded-lg text-muted hover:bg-danger-soft hover:text-danger"
                        >
                            <IconTrash size={16} />
                        </button>
                    )}
                    <button
                        aria-label="Close"
                        onClick={onClose}
                        className="flex size-7 items-center justify-center rounded-lg text-muted hover:bg-fill hover:text-ink"
                    >
                        <IconX size={16} />
                    </button>
                </div>
            </header>

            {leadQuery.isPending && <PageLoader label="Loading lead" variant="record" />}
            {leadQuery.isError && (
                <ErrorState
                    title="Couldn't load lead"
                    error={leadQuery.error}
                    onRetry={() => leadQuery.refetch()}
                    retrying={leadQuery.isFetching}
                />
            )}

            {lead && (
                <div className="flex min-h-0 flex-1">
                    {/* Fields: left column, Twenty's record-page width */}
                    <div className="flex w-full max-w-sm shrink-0 flex-col overflow-y-auto border-r border-line-light">
                        {/* Identifier: avatar + name */}
                        <div className="flex items-center gap-3 border-b border-line-light px-4 py-4">
                            <Avatar name={lead.name} size="lg" />
                            <div className="min-w-0 flex-1">
                                <EditableText
                                    value={lead.name}
                                    placeholder="Name"
                                    disabled={!can.update}
                                    // name is required, so clearing it just keeps the old one
                                    onSave={(name) => name && update.mutate({ name })}
                                    className="text-lg font-semibold"
                                />
                                <p className="px-1 text-faint">Added {timeAgo(lead.createdAt)}</p>
                            </div>
                        </div>

                        {can.update && can.delete && <PossibleDuplicates lead={lead} onMerge={(duplicateId) => setMerging({ keepId: lead.id, duplicateId })} />}

                        {/* Fields */}
                        <section className="space-y-0.5 px-3 py-3">
                            <SectionLabel>Fields</SectionLabel>

                            <FieldRow icon={IconProgress} label="Stage">
                                {can.update ? (
                                    <Dropdown
                                        buttonClassName="flex h-7 items-center gap-1 rounded-lg px-1 hover:bg-fill"
                                        label={<><StageLabel stage={lead.stage} /><IconChevronDown size={14} className="text-faint" /></>}
                                    >
                                        {(close) =>
                                            (stagesQuery.data ?? []).map((stage) => (
                                                <MenuItem
                                                    key={stage.id}
                                                    selected={stage.id === lead.stageId}
                                                    onClick={async () => {
                                                        close();
                                                        if (stage.id === lead.stageId) return;
                                                        // moving to a lost stage asks why first; closing the question calls the move off
                                                        const answer = stage.isLost ? await askLostReason("lead") : {};
                                                        if (answer) update.mutate({ stageId: stage.id, ...answer });
                                                    }}
                                                >
                                                    <StageLabel stage={stage} />
                                                </MenuItem>
                                            ))
                                        }
                                    </Dropdown>
                                ) : (
                                    <span className="px-1"><StageLabel stage={lead.stage} /></span>
                                )}
                            </FieldRow>

                            {lead.stage.isLost && (
                                <FieldRow icon={IconThumbDown} label="Lost reason">
                                    <LostReasonValue what="lead" reason={lead.lostReason} editable={can.update} onChange={(lostReason) => update.mutate({ lostReason })} />
                                </FieldRow>
                            )}

                            <FieldRow icon={IconUserCircle} label="Assigned to">
                                {can.assign && agents ? (
                                    <Dropdown
                                        buttonClassName="flex h-7 max-w-full items-center gap-1.5 rounded-lg px-1 hover:bg-fill"
                                        label={<AssigneeLabel lead={lead} />}
                                    >
                                        {(close) => (
                                            <>
                                                <MenuItem
                                                    selected={!lead.assignedTo}
                                                    onClick={() => { if (lead.assignedTo) assign.mutate(null); close(); }}
                                                >
                                                    <IconUserOff size={16} /> Unassigned
                                                </MenuItem>
                                                <SearchableItems items={agents} label={(agent) => agent.name}>
                                                    {(agent) => (
                                                        <MenuItem
                                                            key={agent.id}
                                                            selected={agent.id === lead.assignedTo?.id}
                                                            onClick={() => { if (agent.id !== lead.assignedTo?.id) assign.mutate(agent.id); close(); }}
                                                        >
                                                            <Avatar name={agent.name} /> {agent.name}
                                                        </MenuItem>
                                                    )}
                                                </SearchableItems>
                                            </>
                                        )}
                                    </Dropdown>
                                ) : (
                                    <span className="flex h-7 items-center gap-1.5 px-1">
                                        <AssigneeLabel lead={lead} />
                                    </span>
                                )}
                            </FieldRow>

                            <FieldRow icon={IconBuilding} label="Company">
                                <EditableText
                                    value={lead.companyName}
                                    placeholder="Company"
                                    disabled={!can.update}
                                    onSave={(companyName) => update.mutate({ companyName })}
                                />
                            </FieldRow>

                            <FieldRow icon={IconMail} label="Email">
                                <EditableText
                                    type="email"
                                    value={lead.email}
                                    placeholder="Email"
                                    disabled={!can.update}
                                    onSave={(email) => update.mutate({ email })}
                                />
                            </FieldRow>

                            <FieldRow icon={IconPhone} label="Phone">
                                <EditableText
                                    type="tel"
                                    value={lead.phone}
                                    placeholder="Phone"
                                    disabled={!can.update}
                                    onSave={(phone) => update.mutate({ phone })}
                                />
                            </FieldRow>

                            <FieldRow icon={IconTag} label="Source">
                                {can.update ? (
                                    <Dropdown
                                        buttonClassName="flex h-7 items-center gap-1 rounded-lg px-1 hover:bg-fill"
                                        label={
                                            <>
                                                {lead.source ? <StageBadge name={lead.source.name} color={lead.source.color} /> : <span className="text-light">Empty</span>}
                                                <IconChevronDown size={14} className="text-faint" />
                                            </>
                                        }
                                    >
                                        {(close) => (
                                            <>
                                                <MenuItem
                                                    selected={!lead.sourceId}
                                                    onClick={() => { if (lead.sourceId) update.mutate({ sourceId: null }); close(); }}
                                                >
                                                    Empty
                                                </MenuItem>
                                                {(sourcesQuery.data ?? []).map((source) => (
                                                    <MenuItem
                                                        key={source.id}
                                                        selected={source.id === lead.sourceId}
                                                        onClick={() => {
                                                            if (source.id !== lead.sourceId) update.mutate({ sourceId: source.id });
                                                            close();
                                                        }}
                                                    >
                                                        <StageBadge name={source.name} color={source.color} />
                                                    </MenuItem>
                                                ))}
                                            </>
                                        )}
                                    </Dropdown>
                                ) : (
                                    <span className="px-1">
                                        {lead.source ? <StageBadge name={lead.source.name} color={lead.source.color} /> : <span className="text-light">Empty</span>}
                                    </span>
                                )}
                            </FieldRow>

                            {customFieldsQuery.data && customFieldsQuery.data.length > 0 &&
                                groupCustomFields(customFieldsQuery.data).map(({ group, fields }) => (
                                    <div key={group}>
                                        <p className="mt-2 mb-0.5 px-1 text-xs font-semibold tracking-wide text-faint uppercase">{group}</p>
                                        {fields.map((field) => (
                                            <FieldRow key={field.id} icon={IconSettings} label={field.label}>
                                                <CustomFieldControl
                                                    field={field}
                                                    value={lead.customFields?.[field.key]}
                                                    disabled={!can.update}
                                                    agents={agents}
                                                    onSave={(value) => {
                                                        if (!isSameFieldValue(value, lead.customFields?.[field.key])) {
                                                            update.mutate({ customFields: { [field.key]: value } });
                                                        }
                                                    }}
                                                />
                                            </FieldRow>
                                        ))}
                                    </div>
                                ))}

                            {lead.contact && (
                                <>
                                    <SectionLabel>Relations</SectionLabel>
                                    <FieldRow icon={IconAddressBook} label="Contact">
                                        <span className="px-1 text-muted">{lead.contact.name}</span>
                                    </FieldRow>
                                </>
                            )}

                            <SectionLabel>System</SectionLabel>

                            <FieldRow icon={IconCalendar} label="Created">
                                <span className="px-1">{formatDate(lead.createdAt)}</span>
                            </FieldRow>

                            <FieldRow icon={IconClock} label="Updated">
                                <span className="px-1">{timeAgo(lead.updatedAt)}</span>
                            </FieldRow>

                            {mutationError && <p className="px-1 pt-1 text-danger">{errorMessage(mutationError)}</p>}
                        </section>
                    </div>

                    {/* Timeline, Notes, Tasks... — Tasks/Files/Emails/Calendar aren't built yet */}
                    <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">
                        <div className="flex h-11 shrink-0 items-center gap-1 border-b border-line-light px-4">
                            <TabButton active={tab === "timeline"} onClick={() => setTab("timeline")}>Timeline</TabButton>
                            <TabButton active={tab === "notes"} onClick={() => setTab("notes")}>Notes</TabButton>
                            <TabButton active={tab === "tasks"} onClick={() => setTab("tasks")}>Tasks</TabButton>
                            <TabButton active={tab === "activities"} onClick={() => setTab("activities")}>Activities</TabButton>
                            <LockedTabButton icon={IconFiles} label="Files" />
                            <LockedTabButton icon={IconMailFast} label="Emails" />
                            <LockedTabButton icon={IconCalendarEvent} label="Calendar" />
                        </div>

                        {tab === "notes" ? (
                            <section className="px-4 py-4">
                                <NotesTab entity="lead" recordId={lead.id} agents={agents} meId={meId} />
                            </section>
                        ) : tab === "tasks" ? (
                            <section className="px-4 py-4">
                                <TasksTab entity="lead" recordId={lead.id} />
                            </section>
                        ) : tab === "activities" ? (
                            <section className="px-4 py-4">
                                <ActivitiesTab entity="lead" recordId={lead.id} />
                            </section>
                        ) : (
                            <section className="px-4 py-4">
                                {timelineQuery.isPending && <SkeletonList rows={3} />}

                                {timelineQuery.isError && (
                                    <ErrorState
                                        variant="inline"
                                        title="Couldn't load timeline"
                                        error={timelineQuery.error}
                                        onRetry={() => timelineQuery.refetch()}
                                        retrying={timelineQuery.isFetching}
                                    />
                                )}

                                {timelineQuery.isSuccess && timeline.length === 0 && (
                                    <p className="text-light">No timeline entries yet</p>
                                )}

                                <ol>
                                    {timeline.map((entry, index) => {
                                        const Icon = TIMELINE_ICONS[entry.type] ?? IconPoint;
                                        const isLast = index === timeline.length - 1;

                                        return (
                                            <li key={entry.id} className="flex gap-3">
                                                {/* icon with the vertical line that connects the events */}
                                                <div className="flex w-6.5 shrink-0 flex-col items-center">
                                                    <span className="flex size-6.5 items-center justify-center text-faint">
                                                        <Icon size={16} />
                                                    </span>
                                                    {!isLast && <span className="w-0.5 flex-1 bg-line-light" />}
                                                </div>

                                                <div className="flex min-w-0 flex-1 items-start justify-between gap-3 pt-1 pb-4">
                                                    <p className="text-muted">
                                                        {/* a web form's entries are the visitor's doing, not a teammate's */}
                                                        <span className="font-medium text-ink">{entry.type === "WEB_FORM" ? "Web form" : entry.user.name}</span>
                                                        {" · "}
                                                        {entry.metadata?.taskId ? (
                                                            <Link href={`/tasks?open=${entry.metadata.taskId}`} className="text-accent hover:underline">
                                                                {entry.message}
                                                            </Link>
                                                        ) : (
                                                            entry.message
                                                        )}
                                                    </p>
                                                    <time
                                                        dateTime={entry.createdAt}
                                                        title={new Date(entry.createdAt).toLocaleString()}
                                                        className="shrink-0 text-faint"
                                                    >
                                                        {timeAgo(entry.createdAt)}
                                                    </time>
                                                </div>
                                            </li>
                                        );
                                    })}
                                </ol>

                                {timelineQuery.hasNextPage && (
                                    <button
                                        onClick={() => timelineQuery.fetchNextPage()}
                                        disabled={timelineQuery.isFetchingNextPage}
                                        className="ml-9 rounded-lg px-1 font-medium text-faint hover:bg-fill hover:text-muted"
                                    >
                                        {timelineQuery.isFetchingNextPage ? (
                                            <span className="flex items-center gap-1.5">
                                                <Spinner size={12} /> Loading
                                            </span>
                                        ) : (
                                            "Show older entries"
                                        )}
                                    </button>
                                )}
                            </section>
                        )}
                    </div>
                </div>
            )}

            <ConfirmDeleteModal
                open={confirmingDelete}
                title={`Delete ${lead?.name}?`}
                description="Its timeline history is deleted too. This can't be undone."
                pending={remove.isPending}
                onCancel={() => setConfirmingDelete(false)}
                onConfirm={() => remove.mutate()}
            />

            {lead && (
                <ConvertToDealDialog
                    open={converting}
                    leadId={lead.id}
                    leadName={lead.name}
                    onClose={() => setConverting(false)}
                    onConverted={() => {
                        setConverting(false);
                        toast.success("Lead converted to a deal");
                        queryClient.invalidateQueries({ queryKey: ["lead", leadId] });
                        queryClient.invalidateQueries({ queryKey: ["deals"] });
                        refreshLeads(queryClient);
                    }}
                />
            )}

            <MergeLeadsPanel pair={merging} onClose={() => setMerging(null)} onMerged={() => setMerging(null)} />
        </div>
    );
}

// Groups rows within the Fields section — Twenty splits a record's panel
// into Fields / Relations / System the same way.
function SectionLabel({ children }: { children: React.ReactNode }) {
    return <p className="mt-2 mb-0.5 px-1 text-xs font-semibold tracking-wide text-faint uppercase first:mt-0">{children}</p>;
}

function TabButton({ active, onClick, children }: { active?: boolean; onClick: () => void; children: React.ReactNode }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`flex h-8 items-center border-b-2 px-2 text-sm font-medium ${active ? "border-accent text-ink" : "border-transparent text-faint hover:text-muted"}`}
        >
            {children}
        </button>
    );
}

// A tab that needs functionality not built yet (Tasks/Notes/Files/Emails/Calendar)
function LockedTabButton({ icon: Icon, label }: { icon: typeof IconMail; label: string }) {
    return (
        <span className="flex h-8 items-center gap-1 border-b-2 border-transparent px-2 text-sm text-light" title={`${label} isn't available yet`}>
            <Icon size={14} />
            {label}
            <IconLock size={10} />
        </span>
    );
}

function FieldRow({ icon: Icon, label, children }: { icon: typeof IconMail; label: string; children: React.ReactNode }) {
    return (
        <div className="flex min-h-8 items-center gap-1">
            <span className="flex w-24 shrink-0 items-center gap-1 text-sm text-faint">
                <Icon size={16} />
                {label}
            </span>
            <div className="min-w-0 flex-1">{children}</div>
        </div>
    );
}

function AssigneeLabel({ lead }: { lead: Lead }) {
    if (!lead.assignedTo) return <span className="text-light">Unassigned</span>;

    return (
        <>
            <Avatar name={lead.assignedTo.name} />
            <span className="truncate">{lead.assignedTo.name}</span>
        </>
    );
}

interface EditableTextProps {
    value: string | null;
    placeholder: string;
    onSave: (value: string | null) => void;
    disabled?: boolean;
    type?: "text" | "email" | "tel" | "number" | "date";
    className?: string;
}

// Shows the value; click it to get an input. Enter or clicking away saves, Esc cancels.
function EditableText({ value, placeholder, onSave, disabled, type = "text", className = "" }: EditableTextProps) {
    const [editing, setEditing] = useState(false);

    if (editing) {
        return (
            <input
                autoFocus
                type={type}
                defaultValue={value ?? ""}
                placeholder={placeholder}
                onBlur={(e) => {
                    setEditing(false);
                    const next = e.target.value.trim();
                    // empty = clear the field (null), unchanged = no request
                    if (next !== (value ?? "")) onSave(next || null);
                }}
                onKeyDown={(e) => {
                    if (e.key === "Enter") e.currentTarget.blur();
                    if (e.key === "Escape") {
                        e.stopPropagation(); // cancel the edit, don't close the panel
                        e.currentTarget.value = value ?? "";
                        e.currentTarget.blur();
                    }
                }}
                className={`h-7 w-full rounded-lg border border-line-strong bg-surface px-1 outline-none ${className}`}
            />
        );
    }

    return (
        <button
            type="button"
            disabled={disabled}
            onClick={() => setEditing(true)}
            className={`flex h-7 w-full items-center rounded-lg px-1 text-left enabled:hover:bg-fill ${value ? "" : "text-light"} ${className}`}
        >
            <span className="truncate">{value || placeholder}</span>
        </button>
    );
}

// Picks the right editor for a custom field's type. Select/Yes-No save
// instantly on change; the rest reuse EditableText's click-to-edit pattern.
function CustomFieldControl({
    field,
    value,
    disabled,
    agents,
    onSave,
}: {
    field: CustomFieldDef;
    value: unknown;
    disabled: boolean;
    agents?: Agent[];
    onSave: (value: unknown) => void;
}) {
    if (field.type === "AGENT") {
        return (
            <Select
                disabled={disabled}
                value={value === undefined || value === null ? undefined : String(value)}
                onChange={(next) => onSave(next === undefined ? null : Number(next))}
                placeholder="—"
                options={agents?.map((agent) => ({ value: String(agent.id), label: agent.name })) ?? []}
            />
        );
    }

    if (field.type === "SELECT") {
        return (
            <Select
                disabled={disabled}
                value={(value as string | undefined) ?? undefined}
                onChange={(next) => onSave(next ?? null)}
                placeholder="—"
                options={(field.options ?? []).map((option) => ({ value: option, label: option }))}
            />
        );
    }

    if (field.type === "BOOLEAN") {
        return (
            <Select
                disabled={disabled}
                value={value === undefined || value === null ? undefined : value ? "true" : "false"}
                onChange={(next) => onSave(next === undefined ? null : next === "true")}
                placeholder="—"
                options={[{ value: "true", label: "Yes" }, { value: "false", label: "No" }]}
            />
        );
    }

    if (field.type === "NUMBER") {
        return (
            <EditableText
                type="number"
                value={value === undefined || value === null ? null : String(value)}
                placeholder={field.label}
                disabled={disabled}
                onSave={(next) => onSave(next === null ? null : Number(next))}
            />
        );
    }

    if (field.type === "DATE") {
        return (
            <EditableText
                type="date"
                value={value ? String(value).slice(0, 10) : null}
                placeholder={field.label}
                disabled={disabled}
                onSave={onSave}
            />
        );
    }

    return (
        <EditableText
            value={value === undefined || value === null ? null : String(value)}
            placeholder={field.label}
            disabled={disabled}
            onSave={onSave}
        />
    );
}
