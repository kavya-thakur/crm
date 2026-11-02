"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
    keepPreviousData,
    useInfiniteQuery,
    useMutation,
    useQuery,
    useQueryClient,
} from "@tanstack/react-query";
import {
    IconCalendar,
    IconCalendarEvent,
    IconChecklist,
    IconChevronDown,
    IconClock,
    IconCurrencyRupee,
    IconFileDescription,
    IconFiles,
    IconLock,
    IconMailFast,
    IconPercentage,
    IconPoint,
    IconProgress,
    IconSettings,
    IconTargetArrow,
    IconTrash,
    IconUser,
    IconUserCircle,
    IconUserOff,
    IconX,
    IconThumbDown,
    IconGitMerge,
    IconLinkOff,
    IconMail,
    IconPhone,
} from "@tabler/icons-react";

import { api, errorMessage } from "@/lib/api/client";
import { Dropdown, MenuItem, SearchableItems } from "@/components/Dropdown";
import { ErrorState } from "@/components/ErrorState";
import { PageLoader, SkeletonList, Spinner } from "@/components/Loader";
import { Select } from "@/components/Select";
import { ConfirmDeleteModal } from "@/components/ListPage";
import { Avatar } from "@/components/Avatar";
import { askLostReason, LostReasonValue } from "@/components/LostReasonPrompt";
import { MergeDealsPanel, PossibleDuplicateDeals } from "./MergeDeals";
import { toast } from "@/components/Toast";
import { formatDate, timeAgo } from "@/lib/utils/format";
import { groupCustomFields, useCustomFields, type CustomFieldDef, isSameFieldValue } from "../shared/customFields";
import { usePanelEnter } from "../shared/usePanelEnter";
import { NotesTab } from "../shared/notes";
import { ActivitiesTab } from "../shared/activities";
import { TasksTab } from "../shared/tasks";
import {
    StageLabel,
    formatDealAmount,
    refreshDeals,
    type Deal,
    type DealLead,
    type DealUser,
    type Paginated,
    type PipelineStage,
} from "./shared";

interface TimelineEntry {
    id: number;
    type: string;
    message: string;
    createdAt: string;
    // task events carry the task they are about
    metadata: { taskId?: number } | null;
    user: {
        id: number;
        name: string;
        email: string;
    };
}

const TIMELINE_ICONS: Record<string, typeof IconTargetArrow> = {
    CREATED: IconTargetArrow,
    STAGE_CHANGED: IconProgress,
    UPDATED: IconFileDescription,
    ASSIGNED: IconUserCircle,
    REASSIGNED: IconUserCircle,
    UNASSIGNED: IconUserCircle,
    TASK_CREATED: IconChecklist,
    TASK_COMPLETED: IconChecklist,
    MERGED: IconGitMerge,
};

type DealChanges = Partial<
    Pick<
        Deal,
        | "title"
        | "amount"
        | "probability"
        | "pipelineStageId"
        | "leadId"
        | "expectedCloseDate"
        | "description"
        | "customFields"
        | "lostReason"
    >
>;

interface DealPanelProps {
    dealId: number;
    can: {
        update: boolean;
        delete: boolean;
        assign: boolean;
        // picking the lead lists the leads, which needs lead:read
        linkLead: boolean;
    };
    agents?: DealUser[];
    meId: number;
    onClose: () => void;
}

interface StagesResponse {
    ok: boolean;
    data: PipelineStage[];
}

// Twenty's record side panel: fields you can click to edit, then the activity timeline
export default function DealPanel({ dealId, can, agents, meId, onClose }: DealPanelProps) {
    const queryClient = useQueryClient();
    const [confirmingDelete, setConfirmingDelete] = useState(false);
    // a duplicate being merged into this deal
    const [merging, setMerging] = useState<{ keepId: number; duplicateId: number } | null>(null);
    const [tab, setTab] = useState<"timeline" | "notes" | "tasks" | "activities">("timeline");

    const dealQuery = useQuery({
        queryKey: ["deal", dealId],
        queryFn: () =>
            api.get<{ data: Deal }>(`/deals/${dealId}`).then((res) => res.data.data),
    });

    const timelineQuery = useInfiniteQuery({
        queryKey: ["deal", dealId, "timeline"],
        queryFn: ({ pageParam }) =>
            api
                .get<Paginated<TimelineEntry>>(`/deals/${dealId}/timeline`, {
                    params: { page: pageParam, limit: 20 },
                })
                .then((res) => res.data),
        initialPageParam: 1,
        getNextPageParam: ({ pagination }) =>
            pagination.page < pagination.totalPages
                ? pagination.page + 1
                : undefined,
        placeholderData: keepPreviousData,
    });

    const customFieldsQuery = useCustomFields("deal");

    const stagesQuery = useQuery({
        queryKey: ["pipelineStage"],
        queryFn: () =>
            api.get<StagesResponse>("/pipeline-stages").then((res) => res.data.data),
        enabled: can.update,
    });

    const update = useMutation({
        mutationFn: (changes: DealChanges) =>
            api.put<{ data: Deal }>(`/deals/${dealId}`, changes),
        onSuccess: async (res) => {
            toast.success("Deal updated");
            queryClient.setQueryData(["deal", dealId], res.data.data);
            await refreshDeals(queryClient);
        },
    });

    const assign = useMutation({
        mutationFn: (assignedToId: number | null) =>
            api.post(`/deals/${dealId}/assign`, { assignedToId }),
        onSuccess: async (_data, assignedToId) => {
            toast.success(assignedToId === null ? "Deal unassigned" : "Deal assigned");
            await refreshDeals(queryClient);
            queryClient.invalidateQueries({ queryKey: ["deal", dealId] });
        },
    });

    const remove = useMutation({
        mutationFn: () => api.delete(`/deals/${dealId}`),
        onSuccess: async () => {
            toast.success("Deal deleted");
            await refreshDeals(queryClient);
            onClose();
        },
    });

    // Esc closes the panel (but not while a confirm dialog is open; that one closes first)
    useEffect(() => {
        function onKeyDown(event: KeyboardEvent) {
            if (event.key === "Escape" && !document.querySelector("dialog[open]")) {
                onClose();
            }
        }

        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [onClose]);

    const deal = dealQuery.data;
    const timeline =
        timelineQuery.data?.pages.flatMap((page) => page.data) ?? [];
    const mutationError = update.error ?? assign.error ?? remove.error;
    const enterRef = usePanelEnter<HTMLDivElement>();

    return (
        <div ref={enterRef} className="flex h-full min-h-0 flex-col">
            <header className="flex h-12 shrink-0 items-center gap-1.5 border-b border-line bg-paper px-3">
                <IconTargetArrow size={16} className="text-accent" />
                <button type="button" onClick={onClose} className="rounded px-1 text-muted hover:bg-fill hover:text-ink">
                    Deals
                </button>
                <span className="text-faint">/</span>
                <span className="truncate rounded px-1 font-semibold">{deal?.title ?? "..."}</span>

                <div className="ml-auto flex items-center gap-0.5">
                    {can.delete && deal && (
                        <button
                            type="button"
                            aria-label="Delete deal"
                            onClick={() => setConfirmingDelete(true)}
                            className="flex size-7 items-center justify-center rounded-lg text-muted hover:bg-danger-soft hover:text-danger"
                        >
                            <IconTrash size={16} />
                        </button>
                    )}

                    <button
                        type="button"
                        aria-label="Close"
                        onClick={onClose}
                        className="flex size-7 items-center justify-center rounded-lg text-muted hover:bg-fill hover:text-ink"
                    >
                        <IconX size={16} />
                    </button>
                </div>
            </header>

            {dealQuery.isPending && <PageLoader label="Loading deal" variant="record" />}

            {dealQuery.isError && (
                <ErrorState
                    title="Couldn't load this deal"
                    error={dealQuery.error}
                    onRetry={() => dealQuery.refetch()}
                    retrying={dealQuery.isFetching}
                />
            )}

            {deal && (
                <div className="flex min-h-0 flex-1">
                    {/* Fields: left column, Twenty's record-page width */}
                    <div className="flex w-full max-w-sm shrink-0 flex-col overflow-y-auto border-r border-line-light">
                        {/* Identifier */}
                        <div className="flex items-center gap-3 border-b border-line-light px-4 py-4">
                            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
                                <IconTargetArrow size={20} />
                            </span>

                            <div className="min-w-0 flex-1">
                                <EditableText
                                    value={deal.title}
                                    placeholder="Deal title"
                                    disabled={!can.update}
                                    className="text-lg font-semibold"
                                    onSave={(title) => {
                                        if (title) update.mutate({ title });
                                    }}
                                />

                                <p className="px-1 text-faint">
                                    Created {timeAgo(deal.createdAt)}
                                </p>
                            </div>
                        </div>

                        {can.update && can.delete && (
                            <PossibleDuplicateDeals deal={deal} onMerge={(duplicateId) => setMerging({ keepId: deal.id, duplicateId })} />
                        )}

                        {/* Fields */}
                        <section className="space-y-0.5 px-3 py-3">
                            <SectionLabel>Fields</SectionLabel>

                            <FieldRow icon={IconProgress} label="Stage">
                                {can.update ? (
                                    <Dropdown
                                        buttonClassName="flex h-7 items-center gap-1 rounded-lg px-1 hover:bg-fill"
                                        label={
                                            <>
                                                <StageLabel stage={deal.pipelineStage} />
                                                <IconChevronDown size={14} className="text-faint" />
                                            </>
                                        }
                                    >
                                        {(close) =>
                                            (stagesQuery.data ?? []).map((stage) => (
                                                <MenuItem
                                                    key={stage.id}
                                                    selected={stage.id === deal.pipelineStageId}
                                                    onClick={async () => {
                                                        close();
                                                        if (stage.id === deal.pipelineStageId) return;
                                                        // moving to a lost stage asks why first; closing the question calls the move off
                                                        const answer = stage.isLost ? await askLostReason("deal") : {};
                                                        if (answer) update.mutate({ pipelineStageId: stage.id, ...answer });
                                                    }}
                                                >
                                                    <StageLabel stage={stage} />
                                                </MenuItem>
                                            ))
                                        }
                                    </Dropdown>
                                ) : (
                                    <span className="px-1">
                                        <StageLabel stage={deal.pipelineStage} />
                                    </span>
                                )}
                            </FieldRow>

                            {deal.pipelineStage.isLost && (
                                <FieldRow icon={IconThumbDown} label="Lost reason">
                                    <LostReasonValue what="deal" reason={deal.lostReason} editable={can.update} onChange={(lostReason) => update.mutate({ lostReason })} />
                                </FieldRow>
                            )}

                            <FieldRow icon={IconCurrencyRupee} label="Amount">
                                <EditableText
                                    value={String(deal.amount)}
                                    placeholder="Amount"
                                    type="number"
                                    disabled={!can.update}
                                    onSave={(value) => {
                                        if (value !== null && value !== "") {
                                            const amount = Number(value);
                                            if (Number.isFinite(amount) && amount >= 0) {
                                                update.mutate({ amount });
                                            }
                                        }
                                    }}
                                />
                            </FieldRow>

                            <FieldRow icon={IconPercentage} label="Probability">
                                <EditableText
                                    value={String(deal.probability)}
                                    placeholder="Probability"
                                    type="number"
                                    disabled={!can.update}
                                    onSave={(value) => {
                                        if (value !== null && value !== "") {
                                            const probability = Number(value);
                                            if (
                                                Number.isInteger(probability) &&
                                                probability >= 0 &&
                                                probability <= 100
                                            ) {
                                                update.mutate({ probability });
                                            }
                                        }
                                    }}
                                />
                            </FieldRow>

                            <FieldRow icon={IconUserCircle} label="Assigned to">
                                {can.assign && agents ? (
                                    <Dropdown
                                        buttonClassName="flex h-7 max-w-full items-center gap-1.5 rounded-lg px-1 hover:bg-fill"
                                        label={<AssigneeLabel deal={deal} />}
                                    >
                                        {(close) => (
                                            <>
                                                <MenuItem
                                                    selected={!deal.assignedTo}
                                                    onClick={() => { if (deal.assignedTo) assign.mutate(null); close(); }}
                                                >
                                                    <IconUserOff size={16} /> Unassigned
                                                </MenuItem>
                                                <SearchableItems items={agents} label={(agent) => agent.name}>
                                                    {(agent) => (
                                                        <MenuItem
                                                            key={agent.id}
                                                            selected={agent.id === deal.assignedTo?.id}
                                                            onClick={() => { if (agent.id !== deal.assignedTo?.id) assign.mutate(agent.id); close(); }}
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
                                        <AssigneeLabel deal={deal} />
                                    </span>
                                )}
                            </FieldRow>

                            <FieldRow icon={IconCalendar} label="Expected close">
                                <EditableText
                                    value={deal.expectedCloseDate?.slice(0, 10) ?? ""}
                                    placeholder="No close date"
                                    type="date"
                                    disabled={!can.update}
                                    onSave={(value) =>
                                        update.mutate({
                                            expectedCloseDate: value
                                                ? new Date(
                                                    `${value}T12:00:00.000Z`,
                                                ).toISOString()
                                                : null,
                                        })
                                    }
                                />
                            </FieldRow>

                            <FieldRow icon={IconFileDescription} label="Description">
                                <EditableText
                                    value={deal.description}
                                    placeholder="Add description"
                                    disabled={!can.update}
                                    onSave={(description) =>
                                        update.mutate({ description })
                                    }
                                />
                            </FieldRow>

                            {customFieldsQuery.data && customFieldsQuery.data.length > 0 &&
                                groupCustomFields(customFieldsQuery.data).map(({ group, fields }) => (
                                    <div key={group}>
                                        <p className="mt-2 mb-0.5 px-1 text-xs font-semibold tracking-wide text-faint uppercase">{group}</p>
                                        {fields.map((field) => (
                                            <FieldRow key={field.id} icon={IconSettings} label={field.label}>
                                                <CustomFieldControl
                                                    field={field}
                                                    value={deal.customFields?.[field.key]}
                                                    disabled={!can.update}
                                                    agents={agents}
                                                    onSave={(value) => {
                                                        if (!isSameFieldValue(value, deal.customFields?.[field.key])) {
                                                            update.mutate({ customFields: { [field.key]: value } });
                                                        }
                                                    }}
                                                />
                                            </FieldRow>
                                        ))}
                                    </div>
                                ))}

                            {/* who the deal is with, and how to reach them (their lead's phone and email) */}
                            <SectionLabel>Contact</SectionLabel>
                            <FieldRow icon={IconUser} label="Lead">
                                {can.update && can.linkLead ? (
                                    <LeadPicker lead={deal.lead} onPick={(leadId) => update.mutate({ leadId })} />
                                ) : deal.lead ? (
                                    <span className="truncate px-1 text-muted">{deal.lead.name}</span>
                                ) : (
                                    <span className="px-1 text-light">No lead linked</span>
                                )}
                            </FieldRow>
                            {deal.lead && (
                                <>
                                    <FieldRow icon={IconPhone} label="Phone">
                                        {deal.lead.phone ? (
                                            <a href={`tel:${deal.lead.phone}`} className="truncate px-1 text-accent hover:underline">{deal.lead.phone}</a>
                                        ) : (
                                            <span className="px-1 text-light">Empty</span>
                                        )}
                                    </FieldRow>
                                    <FieldRow icon={IconMail} label="Email">
                                        {deal.lead.email ? (
                                            <a href={`mailto:${deal.lead.email}`} className="truncate px-1 text-accent hover:underline">{deal.lead.email}</a>
                                        ) : (
                                            <span className="px-1 text-light">Empty</span>
                                        )}
                                    </FieldRow>
                                </>
                            )}

                            <SectionLabel>System</SectionLabel>

                            <FieldRow icon={IconCalendar} label="Created">
                                <span className="px-1">
                                    {formatDate(deal.createdAt)}
                                </span>
                            </FieldRow>

                            <FieldRow icon={IconClock} label="Updated">
                                <span className="px-1">
                                    {timeAgo(deal.updatedAt)}
                                </span>
                            </FieldRow>

                            {mutationError && (
                                <p role="alert" className="px-1 pt-1 text-danger">
                                    {errorMessage(mutationError)}
                                </p>
                            )}
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
                                <NotesTab entity="deal" recordId={deal.id} agents={agents} meId={meId} />
                            </section>
                        ) : tab === "tasks" ? (
                            <section className="px-4 py-4">
                                <TasksTab entity="deal" recordId={deal.id} />
                            </section>
                        ) : tab === "activities" ? (
                            <section className="px-4 py-4">
                                <ActivitiesTab entity="deal" recordId={deal.id} />
                            </section>
                        ) : (
                            <section className="px-4 py-4">
                                {timelineQuery.isError && (
                                    <div className="mb-3">
                                        <ErrorState
                                            variant="inline"
                                            title="Couldn't load the timeline"
                                            error={timelineQuery.error}
                                            onRetry={() => timelineQuery.refetch()}
                                            retrying={timelineQuery.isFetching}
                                        />
                                    </div>
                                )}

                                {timelineQuery.isPending && <SkeletonList rows={3} />}

                                {timelineQuery.isSuccess && timeline.length === 0 && (
                                    <p className="text-light">No timeline entries yet</p>
                                )}

                                <ol>
                                    {timeline.map((entry, index) => {
                                        const Icon =
                                            TIMELINE_ICONS[entry.type] ?? IconPoint;

                                        return (
                                            <li key={entry.id} className="flex gap-3">
                                                <div className="flex w-6.5 shrink-0 flex-col items-center">
                                                    <span className="flex size-6.5 items-center justify-center text-faint">
                                                        <Icon size={16} />
                                                    </span>

                                                    {index < timeline.length - 1 && (
                                                        <span className="w-0.5 flex-1 bg-line-light" />
                                                    )}
                                                </div>

                                                <div className="flex min-w-0 flex-1 items-start justify-between gap-3 pt-1 pb-4">
                                                    <p className="text-muted">
                                                        <span className="font-medium text-ink">
                                                            {entry.user.name}
                                                        </span>
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
                                                        title={new Date(
                                                            entry.createdAt,
                                                        ).toLocaleString()}
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
                                        type="button"
                                        onClick={() => timelineQuery.fetchNextPage()}
                                        disabled={timelineQuery.isFetchingNextPage}
                                        className="ml-9 rounded-lg px-1 font-medium text-faint hover:bg-fill hover:text-muted disabled:opacity-60"
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
                title={`Delete ${deal?.title}?`}
                description="This action cannot be undone."
                error={remove.isError ? errorMessage(remove.error) : undefined}
                pending={remove.isPending}
                onCancel={() => setConfirmingDelete(false)}
                onConfirm={() => remove.mutate()}
            />

            <MergeDealsPanel pair={merging} onClose={() => setMerging(null)} onMerged={() => setMerging(null)} />
        </div>
    );
}

// Which lead (person) the deal is with. The list loads only once the menu opens.
function LeadPicker({ lead, onPick }: { lead: DealLead | null; onPick: (leadId: number | null) => void }) {
    return (
        <Dropdown
            buttonClassName="flex h-7 max-w-full items-center gap-1 rounded-lg px-1 hover:bg-fill"
            label={
                <>
                    {lead ? <span className="truncate">{lead.name}</span> : <span className="text-light">Link a lead</span>}
                    <IconChevronDown size={14} className="shrink-0 text-faint" />
                </>
            }
        >
            {(close) => <LeadOptions selectedId={lead?.id} onPick={(leadId) => { close(); if (leadId !== (lead?.id ?? null)) onPick(leadId); }} />}
        </Dropdown>
    );
}

function LeadOptions({ selectedId, onPick }: { selectedId?: number; onPick: (leadId: number | null) => void }) {
    // the same list (and cache) as the New deal form: the first 100 leads by name, searchable
    const leadsQuery = useQuery({
        queryKey: ["leads", "deal-options"],
        queryFn: () =>
            api
                .get<{ data: { id: number; name: string }[] }>("/leads", { params: { page: 1, limit: 100, sortBy: "name", sortOrder: "asc" } })
                .then((res) => res.data.data),
    });

    if (leadsQuery.isPending) return <p className="px-2 py-1.5 text-sm text-faint">Loading leads…</p>;
    if (leadsQuery.isError) return <p className="px-2 py-1.5 text-sm text-danger">{errorMessage(leadsQuery.error)}</p>;

    return (
        <>
            {selectedId !== undefined && (
                <MenuItem onClick={() => onPick(null)}>
                    <IconLinkOff size={16} /> Unlink lead
                </MenuItem>
            )}
            <SearchableItems items={leadsQuery.data} label={(item) => item.name}>
                {(item) => (
                    <MenuItem key={item.id} selected={item.id === selectedId} onClick={() => onPick(item.id)}>
                        {item.name}
                    </MenuItem>
                )}
            </SearchableItems>
        </>
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

// A tab that needs functionality not built yet (Tasks/Files/Emails/Calendar)
function LockedTabButton({ icon: Icon, label }: { icon: typeof IconFileDescription; label: string }) {
    return (
        <span className="flex h-8 items-center gap-1 border-b-2 border-transparent px-2 text-sm text-light" title={`${label} isn't available yet`}>
            <Icon size={14} />
            {label}
            <IconLock size={10} />
        </span>
    );
}

function FieldRow({
    icon: Icon,
    label,
    children,
}: {
    icon: typeof IconCurrencyRupee;
    label: string;
    children: React.ReactNode;
}) {
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

function AssigneeLabel({ deal }: { deal: Deal }) {
    if (!deal.assignedTo) return <span className="text-light">Unassigned</span>;

    return (
        <>
            <Avatar name={deal.assignedTo.name} />
            <span className="truncate">{deal.assignedTo.name}</span>
        </>
    );
}

interface EditableTextProps {
    value: string | null;
    placeholder: string;
    onSave: (value: string | null) => void;
    disabled?: boolean;
    type?: "text" | "number" | "date";
    className?: string;
}

function EditableText({
    value,
    placeholder,
    onSave,
    disabled,
    type = "text",
    className = "",
}: EditableTextProps) {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(value ?? "");

    useEffect(() => {
        if (!editing) setDraft(value ?? "");
    }, [value, editing]);

    if (editing) {
        return (
            <input
                autoFocus
                type={type}
                value={draft}
                min={type === "number" ? 0 : undefined}
                max={type === "number" && placeholder === "Probability" ? 100 : undefined}
                onChange={(event) => setDraft(event.target.value)}
                onBlur={() => {
                    setEditing(false);

                    const next = draft.trim();
                    const current = value ?? "";

                    if (next !== current) {
                        onSave(next || null);
                    }
                }}
                onKeyDown={(event) => {
                    if (event.key === "Enter") event.currentTarget.blur();

                    if (event.key === "Escape") {
                        event.stopPropagation();
                        setDraft(value ?? "");
                        setEditing(false);
                    }
                }}
                placeholder={placeholder}
                className={`h-7 w-full rounded-lg border border-line-strong bg-surface px-1 outline-none ${className}`}
            />
        );
    }

    return (
        <button
            type="button"
            disabled={disabled}
            onClick={() => {
                setDraft(value ?? "");
                setEditing(true);
            }}
            className={`flex h-7 w-full items-center rounded-lg px-1 text-left enabled:hover:bg-fill ${value ? "" : "text-light"
                } ${className}`}
        >
            {type === "number" && value !== null && value !== "" && placeholder === "Amount" ? (
                <span className="truncate">{formatDealAmount(value)}</span>
            ) : (
                <span className="truncate">{value || placeholder}</span>
            )}
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
    agents?: DealUser[];
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
