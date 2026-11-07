"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
    IconAddressBook,
    IconBriefcase,
    IconCalendar,
    IconChecklist,
    IconClock,
    IconFileDescription,
    IconMail,
    IconMailFast,
    IconBrandWhatsapp,
    IconArrowBackUp,
    IconArrowUpRight,
    IconBuilding,
    IconPhone,
    IconPlus,
    IconPoint,
    IconSettings,
    IconTrash,
    IconUserCheck,
    IconUserCircle,
    IconUserMinus,
    IconUserOff,
    IconX,
} from "@tabler/icons-react";

import { api, errorMessage } from "@/lib/api/client";
import { Dropdown, MenuItem, SearchableItems } from "@/components/Dropdown";
import { Select } from "@/components/Select";
import { ConfirmDeleteModal } from "@/components/ListPage";
import { Avatar } from "@/components/Avatar";
import { ErrorState } from "@/components/ErrorState";
import { PageLoader, SkeletonList, Spinner } from "@/components/Loader";
import { toast } from "@/components/Toast";
import { formatDate, timeAgo } from "@/lib/utils/format";
import { groupCustomFields, useCustomFields, type CustomFieldDef, isSameFieldValue } from "../shared/customFields";
import { usePanelEnter } from "../shared/usePanelEnter";
import { NotesTab } from "../shared/notes";
import { ActivitiesTab } from "../shared/activities";
import { TasksTab } from "../shared/tasks";
import { EmailsTab } from "../shared/emails";
import { WhatsAppButton } from "../shared/whatsapp";
import { CompanyPicker } from "../shared/CompanyPicker";
import { refreshContacts, type Agent, type Contact, type Paginated, type Permissions } from "./shared";

// companyName: typed in the Company row; the server finds that company (or makes it)
type ContactChanges = Partial<Pick<Contact, "name" | "email" | "phone" | "jobTitle" | "description" | "customFields">> & { companyName?: string | null };

interface TimelineEntry {
    id: number;
    type: string;
    message: string;
    createdAt: string;
    // task events carry the task they are about
    metadata: { taskId?: number } | null;
    user: { id: number; name: string; email: string };
}

const TIMELINE_ICONS: Record<string, typeof IconPlus> = {
    CREATED: IconPlus,
    ASSIGNED: IconUserCheck,
    REASSIGNED: IconUserCheck,
    UNASSIGNED: IconUserMinus,
    TASK_CREATED: IconChecklist,
    TASK_COMPLETED: IconChecklist,
    EMAIL_SENT: IconMailFast,
    WHATSAPP: IconBrandWhatsapp,
    RESTORED: IconArrowBackUp,
};

interface ContactPanelProps {
    contactId: number;
    can: Permissions;
    agents?: Agent[];
    meId: number;
    onClose: () => void;
}

// Twenty's record side panel: fields you can click to edit, then the activity timeline
export default function ContactPanel({ contactId, can, agents, meId, onClose }: ContactPanelProps) {
    const queryClient = useQueryClient();
    const [confirmingDelete, setConfirmingDelete] = useState(false);
    const [tab, setTab] = useState<"timeline" | "notes" | "tasks" | "activities" | "emails">("timeline");

    const contactQuery = useQuery({
        queryKey: ["contact", contactId],
        queryFn: () => api.get<{ data: Contact }>(`/contacts/${contactId}`).then((res) => res.data.data),
    });

    const timelineQuery = useInfiniteQuery({
        queryKey: ["contact", contactId, "timeline"],
        queryFn: ({ pageParam }) =>
            api
                .get<Paginated<TimelineEntry>>(`/contacts/${contactId}/timeline`, { params: { page: pageParam, limit: 20 } })
                .then((res) => res.data),
        initialPageParam: 1,
        getNextPageParam: ({ pagination }) =>
            pagination.page < pagination.totalPages ? pagination.page + 1 : undefined,
        placeholderData: keepPreviousData,
    });

    const customFieldsQuery = useCustomFields("contact");

    const update = useMutation({
        mutationFn: (changes: ContactChanges) => api.put<{ data: Contact }>(`/contacts/${contactId}`, changes),
        onSuccess: (res) => {
            toast.success("Contact updated");
            // show the saved value right away, then refresh the list
            queryClient.setQueryData(["contact", contactId], res.data.data);
            refreshContacts(queryClient);
        },
    });

    const assign = useMutation({
        mutationFn: (assignedToId: number | null) => api.post(`/contacts/${contactId}/assign`, { assignedToId }),
        onSuccess: async (_, assignedToId) => {
            toast.success(assignedToId === null ? "Contact unassigned" : "Contact assigned");
            await refreshContacts(queryClient);
            queryClient.invalidateQueries({ queryKey: ["contact", contactId] });
        },
    });

    const remove = useMutation({
        mutationFn: () => api.delete(`/contacts/${contactId}`),
        onSuccess: () => {
            toast.success("Contact deleted");
            queryClient.invalidateQueries({ queryKey: ["contacts"] });
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

    const contact = contactQuery.data;
    const timeline = timelineQuery.data?.pages.flatMap((page) => page.data) ?? [];
    const mutationError = update.error ?? assign.error ?? remove.error;
    const enterRef = usePanelEnter<HTMLDivElement>();

    return (
        <div ref={enterRef} className="flex h-full min-h-0 flex-col">
            <header className="flex h-12 shrink-0 items-center gap-1.5 border-b border-line bg-paper px-3">
                <IconAddressBook size={16} className="text-accent" />
                <button type="button" onClick={onClose} className="rounded px-1 text-muted hover:bg-fill hover:text-ink">
                    Contacts
                </button>
                <span className="text-faint">/</span>
                <span className="truncate rounded px-1 font-semibold">{contact?.name ?? "..."}</span>

                <div className="ml-auto flex items-center gap-0.5">
                    {can.delete && contact && (
                        <button
                            type="button"
                            aria-label="Delete contact"
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

            {contactQuery.isPending && <PageLoader label="Loading contact" variant="record" />}
            {contactQuery.isError && (
                <ErrorState
                    title="Couldn't load contact"
                    error={contactQuery.error}
                    onRetry={() => contactQuery.refetch()}
                    retrying={contactQuery.isFetching}
                />
            )}

            {contact && (
                <div className="flex min-h-0 flex-1 flex-col overflow-y-auto md:flex-row md:overflow-hidden">
                    {/* Fields: left column, Twenty's record-page width */}
                    <div className="flex w-full shrink-0 flex-col border-b border-line-light md:max-w-sm md:overflow-y-auto md:border-r md:border-b-0">
                        {/* Identifier: avatar + name */}
                        <div className="flex items-center gap-3 border-b border-line-light px-4 py-4">
                            <Avatar name={contact.name} size="lg" />
                            <div className="min-w-0 flex-1">
                                <EditableText
                                    value={contact.name}
                                    placeholder="Name"
                                    disabled={!can.update}
                                    // name is required, so clearing it just keeps the old one
                                    onSave={(name) => name && update.mutate({ name })}
                                    className="text-lg font-semibold"
                                />
                                <p className="px-1 text-faint">Added {timeAgo(contact.createdAt)}</p>
                            </div>
                        </div>

                        {/* Fields */}
                        <section className="space-y-0.5 px-3 py-3">
                            <SectionLabel>Fields</SectionLabel>

                            <FieldRow icon={IconUserCircle} label="Assigned to">
                                {can.assign && agents ? (
                                    <Dropdown
                                        buttonClassName="flex h-7 max-w-full items-center gap-1.5 rounded-lg px-1 hover:bg-fill"
                                        label={<AssigneeLabel contact={contact} />}
                                    >
                                        {(close) => (
                                            <>
                                                <MenuItem
                                                    selected={!contact.assignedTo}
                                                    onClick={() => { if (contact.assignedTo) assign.mutate(null); close(); }}
                                                >
                                                    <IconUserOff size={16} /> Unassigned
                                                </MenuItem>
                                                <SearchableItems items={agents} label={(agent) => agent.name}>
                                                    {(agent) => (
                                                        <MenuItem
                                                            key={agent.id}
                                                            selected={agent.id === contact.assignedTo?.id}
                                                            onClick={() => { if (agent.id !== contact.assignedTo?.id) assign.mutate(agent.id); close(); }}
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
                                        <AssigneeLabel contact={contact} />
                                    </span>
                                )}
                            </FieldRow>

                            <FieldRow icon={IconMail} label="Email">
                                <EditableText
                                    type="email"
                                    value={contact.email}
                                    placeholder="Email"
                                    disabled={!can.update}
                                    onSave={(email) => update.mutate({ email })}
                                />
                            </FieldRow>

                            <FieldRow icon={IconPhone} label="Phone">
                                <div className="flex items-center gap-1">
                                    <div className="min-w-0 flex-1">
                                        <EditableText
                                            type="tel"
                                            value={contact.phone}
                                            placeholder="Phone"
                                            disabled={!can.update}
                                            // phone is required, so clearing it just keeps the old one
                                            onSave={(phone) => phone && update.mutate({ phone })}
                                        />
                                    </div>
                                    <WhatsAppButton
                                        phone={contact.phone}
                                        entity="contact"
                                        recordId={contact.id}
                                        values={{ "lead.firstName": contact.name.split(" ")[0], "lead.name": contact.name }}
                                    />
                                </div>
                            </FieldRow>

                            <FieldRow icon={IconBuilding} label="Company">
                                <div className="flex items-center gap-1">
                                    <div className="min-w-0 flex-1">
                                        <CompanyPicker value={contact.company?.name ?? null} disabled={!can.update} onChange={(companyName) => update.mutate({ companyName })} />
                                    </div>
                                    {contact.company && (
                                        <Link
                                            href={`/companies?open=${contact.company.id}`}
                                            aria-label={`Open ${contact.company.name}`}
                                            className="flex size-7 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-fill hover:text-ink"
                                        >
                                            <IconArrowUpRight size={16} />
                                        </Link>
                                    )}
                                </div>
                            </FieldRow>

                            <FieldRow icon={IconBriefcase} label="Job title">
                                <EditableText
                                    value={contact.jobTitle}
                                    placeholder="Job title"
                                    disabled={!can.update}
                                    onSave={(jobTitle) => update.mutate({ jobTitle })}
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
                                                    value={contact.customFields?.[field.key]}
                                                    disabled={!can.update}
                                                    agents={agents}
                                                    onSave={(value) => {
                                                        if (!isSameFieldValue(value, contact.customFields?.[field.key])) {
                                                            update.mutate({ customFields: { [field.key]: value } });
                                                        }
                                                    }}
                                                />
                                            </FieldRow>
                                        ))}
                                    </div>
                                ))}

                            <SectionLabel>System</SectionLabel>

                            <FieldRow icon={IconCalendar} label="Created">
                                <span className="px-1">{formatDate(contact.createdAt)}</span>
                            </FieldRow>

                            <FieldRow icon={IconClock} label="Updated">
                                <span className="px-1">{timeAgo(contact.updatedAt)}</span>
                            </FieldRow>

                            {mutationError && <p role="alert" className="px-1 pt-1 text-danger">{errorMessage(mutationError)}</p>}
                        </section>

                        {/* Description */}
                        <section className="border-t border-line-light px-4 py-4">
                            <h2 className="mb-2 flex items-center gap-1.5 font-medium">
                                <IconFileDescription size={16} className="text-faint" />
                                Description
                            </h2>
                            <EditableTextarea
                                value={contact.description}
                                placeholder="Add a description..."
                                disabled={!can.update}
                                onSave={(description) => update.mutate({ description })}
                            />
                        </section>
                    </div>

                    {/* Timeline, Notes, Tasks... — Tasks/Files/Emails/Calendar aren't built yet */}
                    <div className="flex min-w-0 flex-1 flex-col md:overflow-y-auto">
                        <div className="flex h-11 shrink-0 items-center gap-1 border-b border-line-light px-4">
                            <TabButton active={tab === "timeline"} onClick={() => setTab("timeline")}>Timeline</TabButton>
                            <TabButton active={tab === "notes"} onClick={() => setTab("notes")}>Notes</TabButton>
                            <TabButton active={tab === "tasks"} onClick={() => setTab("tasks")}>Tasks</TabButton>
                            <TabButton active={tab === "activities"} onClick={() => setTab("activities")}>Activities</TabButton>
                            <TabButton active={tab === "emails"} onClick={() => setTab("emails")}>Emails</TabButton>
                        </div>

                        {tab === "notes" ? (
                            <section className="px-4 py-4">
                                <NotesTab entity="contact" recordId={contact.id} agents={agents} meId={meId} />
                            </section>
                        ) : tab === "tasks" ? (
                            <section className="px-4 py-4">
                                <TasksTab entity="contact" recordId={contact.id} />
                            </section>
                        ) : tab === "activities" ? (
                            <section className="px-4 py-4">
                                <ActivitiesTab entity="contact" recordId={contact.id} />
                            </section>
                        ) : tab === "emails" ? (
                            <section className="px-4 py-4">
                                <EmailsTab
                                    entity="contact"
                                    recordId={contact.id}
                                    to={contact.email}
                                    values={{ "lead.firstName": contact.name.split(" ")[0], "lead.name": contact.name }}
                                />
                            </section>
                        ) : (
                            <section className="px-4 py-4">
                                {timelineQuery.isError && (
                                    <ErrorState
                                        variant="inline"
                                        title="Couldn't load timeline"
                                        error={timelineQuery.error}
                                        onRetry={() => timelineQuery.refetch()}
                                        retrying={timelineQuery.isFetching}
                                    />
                                )}

                                {timelineQuery.isPending && <SkeletonList rows={3} />}

                                {timelineQuery.isSuccess && timeline.length === 0 && (
                                    <p className="text-light">No timeline entries yet</p>
                                )}

                                <ol>
                                    {timeline.map((entry, index) => {
                                        const Icon = TIMELINE_ICONS[entry.type] ?? IconPoint;
                                        const isLast = index === timeline.length - 1;

                                        return (
                                            <li key={entry.id} className="flex gap-3">
                                                <div className="flex w-6.5 shrink-0 flex-col items-center">
                                                    <span className="flex size-6.5 items-center justify-center text-faint">
                                                        <Icon size={16} />
                                                    </span>
                                                    {!isLast && <span className="w-0.5 flex-1 bg-line-light" />}
                                                </div>

                                                <div className="flex min-w-0 flex-1 items-start justify-between gap-3 pt-1 pb-4">
                                                    <p className="text-muted">
                                                        <span className="font-medium text-ink">{entry.user.name}</span>
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
                title={`Delete ${contact?.name}?`}
                pending={remove.isPending}
                onCancel={() => setConfirmingDelete(false)}
                onConfirm={() => remove.mutate()}
            />
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

function AssigneeLabel({ contact }: { contact: Contact }) {
    if (!contact.assignedTo) return <span className="text-light">Unassigned</span>;

    return (
        <>
            <Avatar name={contact.assignedTo.name} />
            <span className="truncate">{contact.assignedTo.name}</span>
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

// Same as EditableText but multi-line: Enter inserts a newline instead of saving
function EditableTextarea({ value, placeholder, onSave, disabled }: Omit<EditableTextProps, "type">) {
    const [editing, setEditing] = useState(false);

    if (editing) {
        return (
            <textarea
                autoFocus
                rows={4}
                defaultValue={value ?? ""}
                placeholder={placeholder}
                onBlur={(e) => {
                    setEditing(false);
                    const next = e.target.value.trim();
                    if (next !== (value ?? "")) onSave(next || null);
                }}
                onKeyDown={(e) => {
                    if (e.key === "Escape") {
                        e.stopPropagation(); // cancel the edit, don't close the panel
                        e.currentTarget.value = value ?? "";
                        e.currentTarget.blur();
                    }
                }}
                className="w-full rounded-lg border border-line-strong bg-surface px-2 py-1.5 outline-none"
            />
        );
    }

    return (
        <button
            type="button"
            disabled={disabled}
            onClick={() => setEditing(true)}
            className={`w-full rounded-lg px-2 py-1.5 text-left whitespace-pre-wrap enabled:hover:bg-fill ${value ? "" : "text-light"}`}
        >
            {value || placeholder}
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
