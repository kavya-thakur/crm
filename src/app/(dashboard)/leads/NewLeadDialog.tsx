"use client";

import { useEffect, useState } from "react";
import { Controller, useForm, useWatch, type Control } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
    IconAddressBook,
    IconAlertTriangle,
    IconExternalLink,
    IconInfoCircle,
    IconMail,
    IconPhone,
    IconProgress,
    IconTag,
    IconTargetArrow,
    IconUserCircle,
    IconX,
} from "@tabler/icons-react";

import { api, errorMessage } from "@/lib/api/client";
import { InlineLoader } from "@/components/Loader";
import { Select } from "@/components/Select";
import { StageBadge } from "@/components/StageBadge";
import { toast } from "@/components/Toast";
import { createLeadSchema } from "@/lib/validations/leads";
import { FormFieldRow, FormIdentityHeader, FormSection, RecordFormShell } from "../shared/FullPageForm";
import { CustomFieldsFormSection, useCustomFields } from "../shared/customFields";
import { CompanyPicker } from "../shared/CompanyPicker";
import {
    StageLabel,
    type Agent,
    type Lead,
    type LeadSource,
    type LeadStage,
    type SimilarLead,
} from "./shared";

const inputClassName =
    "h-8 w-full rounded-lg border border-line bg-surface px-2 outline-none placeholder:text-light focus:border-accent focus:ring-3 focus:ring-accent-soft";

interface NewLeadDialogProps {
    open: boolean;
    canAssign: boolean;
    canLinkContact: boolean;
    agents?: Agent[];
    onClose: () => void;
    onCreated: (lead: Lead) => void;
}

export default function NewLeadDialog({ open, ...props }: NewLeadDialogProps) {
    if (!open) return null;
    return <NewLeadForm {...props} />;
}

function NewLeadForm({ canAssign, canLinkContact, agents, onClose, onCreated }: Omit<NewLeadDialogProps, "open">) {
    const {
        register,
        control,
        handleSubmit,
        setValue,
        formState: { errors },
    } = useForm({
        // the same schema POST /api/leads validates with
        resolver: zodResolver(createLeadSchema),
    });

    const create = useMutation({
        mutationFn: (values: unknown) => api.post<{ data: Lead }>("/leads", values).then((res) => res.data.data),
        onSuccess: (lead) => {
            toast.success("Lead created");
            onCreated(lead);
        },
    });

    const customFieldsQuery = useCustomFields("lead");

    const stagesQuery = useQuery({
        queryKey: ["leadStage"],
        queryFn: () => api.get<{ data: LeadStage[] }>("/lead-stages").then((res) => res.data.data),
    });

    const sourcesQuery = useQuery({
        queryKey: ["leadSource"],
        queryFn: () => api.get<{ data: LeadSource[] }>("/lead-sources").then((res) => res.data.data),
    });

    // Defaults to the first stage once it loads, same as Deal's pipeline stage picker
    useEffect(() => {
        if (stagesQuery.data?.length) setValue("stageId", stagesQuery.data[0].id);
    }, [stagesQuery.data, setValue]);

    const [contact, setContact] = useState<ContactOption | null>(null);
    // checked as these are typed: is this person already a lead?
    const [email, phone] = useWatch({ control, name: ["email", "phone"] });
    const similar = useSimilarLeads(String(email ?? ""), String(phone ?? ""));
    // one open lead per person, so an open one already there stops a second (the API refuses it too)
    const openCopy = similar.find((lead) => lead.open);

    return (
        <RecordFormShell
            icon={IconTargetArrow}
            entityLabel="Leads"
            noun="lead"
            formId="new-lead-form"
            onCancel={onClose}
            onSubmit={handleSubmit((values) => create.mutate(values))}
            submitDisabled={create.isPending || !stagesQuery.data?.length || Boolean(openCopy)}
        >
            <FormIdentityHeader placeholder="Lead name *" error={errors.name?.message} registerProps={register("name")} />

            <FormSection title="Lead Details">
                <FormFieldRow icon={IconProgress} label="Stage" required>
                    <Controller
                        name="stageId"
                        control={control}
                        render={({ field }) => (
                            <Select
                                disabled={!stagesQuery.data?.length}
                                value={field.value !== undefined ? String(field.value) : undefined}
                                onChange={(value) => field.onChange(value === undefined ? undefined : Number(value))}
                                placeholder="Select..."
                                options={(stagesQuery.data ?? []).map((stage) => ({
                                    value: String(stage.id),
                                    label: stage.name,
                                    render: <StageLabel stage={stage} />,
                                }))}
                            />
                        )}
                    />
                </FormFieldRow>

                <FormFieldRow icon={IconTag} label="Source">
                    <Controller
                        name="sourceId"
                        control={control}
                        render={({ field }) => (
                            <Select
                                value={field.value ? String(field.value) : undefined}
                                onChange={(value) => field.onChange(value === undefined ? undefined : Number(value))}
                                placeholder="Select..."
                                options={(sourcesQuery.data ?? []).map((source) => ({
                                    value: String(source.id),
                                    label: source.name,
                                    render: <StageBadge name={source.name} color={source.color} />,
                                }))}
                            />
                        )}
                    />
                </FormFieldRow>

                <FormFieldRow icon={IconTargetArrow} label="Company">
                    <Controller
                        name="companyName"
                        control={control}
                        render={({ field }) => (
                            <CompanyPicker
                                value={(field.value as string | null | undefined) || null}
                                onChange={(name) => field.onChange(name ?? "")}
                                placeholder="Pick or add a company"
                                buttonClassName="flex h-8 w-full items-center gap-1 rounded-lg border border-line bg-surface px-2 text-left outline-none focus:border-accent focus:ring-3 focus:ring-accent-soft"
                            />
                        )}
                    />
                </FormFieldRow>
            </FormSection>

            <FormSection title="Contact Details">
                <FormFieldRow icon={IconMail} label="Email">
                    <input type="email" placeholder="jane@acme.com" aria-invalid={!!errors.email} {...register("email")} className={inputClassName} />
                </FormFieldRow>

                <FormFieldRow icon={IconPhone} label="Phone" required>
                    <input type="tel" placeholder="+91 555 0100" aria-invalid={!!errors.phone} {...register("phone")} className={inputClassName} />
                </FormFieldRow>

                <DuplicateNotice openCopy={openCopy} earlier={similar.filter((lead) => !lead.open)} />
            </FormSection>

            {canLinkContact && (
                <FormSection title="Contact">
                    <FormFieldRow icon={IconAddressBook} label="Link to">
                        <ContactPicker
                            selected={contact}
                            onSelect={(picked) => {
                                setContact(picked);
                                setValue("contactId", picked.id);
                                setValue("name", picked.name);
                                if (picked.phone) setValue("phone", picked.phone);
                                if (picked.email) setValue("email", picked.email);
                            }}
                            onClear={() => {
                                setContact(null);
                                setValue("contactId", undefined);
                            }}
                        />
                    </FormFieldRow>
                    <p className="px-1 pt-1 text-sm text-faint">
                        {contact
                            ? "This lead will link to the selected contact."
                            : "Leave empty to create a new contact — an existing contact with the same phone is reused automatically."}
                    </p>
                </FormSection>
            )}

            {canAssign && agents && (
                <FormSection title="Assigned Agent">
                    <FormFieldRow icon={IconUserCircle} label="Agent">
                        <Controller
                            name="assignedToId"
                            control={control}
                            render={({ field }) => (
                                <Select
                                    // "" = leave it to the API (assigns to you), "none" = nobody, otherwise an agent id
                                    value={field.value === undefined ? "" : field.value === null ? "none" : String(field.value)}
                                    onChange={(value) => field.onChange(value === "" || value === undefined ? undefined : value === "none" ? null : Number(value))}
                                    placeholder="Me"
                                    options={[
                                        { value: "", label: "Me" },
                                        { value: "none", label: "Unassigned" },
                                        ...agents.map((agent) => ({ value: String(agent.id), label: agent.name })),
                                    ]}
                                />
                            )}
                        />
                    </FormFieldRow>
                </FormSection>
            )}

            <CustomFieldsFormSection
                fields={customFieldsQuery.data ?? []}
                register={register}
                control={control as Control<any>}
                agents={agents}
            />

            {create.isError && (
                <p role="alert" className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-danger">
                    {errorMessage(create.error)}
                </p>
            )}
        </RecordFormShell>
    );
}

// Leads with the same email or phone as the one being typed, checked once typing pauses
function useSimilarLeads(email: string, phone: string) {
    const [typed, setTyped] = useState({ email: "", phone: "" });

    useEffect(() => {
        const timer = setTimeout(() => setTyped({ email: email.trim(), phone: phone.trim() }), 400);
        return () => clearTimeout(timer);
    }, [email, phone]);

    const similarQuery = useQuery({
        queryKey: ["lead-duplicates", typed.email, typed.phone],
        queryFn: () =>
            api.get<{ data: SimilarLead[] }>("/leads/duplicates", { params: { email: typed.email || undefined, phone: typed.phone || undefined } }).then((res) => res.data.data),
        // the API ignores half-typed values anyway; this just skips the request
        enabled: typed.email.includes("@") || typed.phone.replace(/\D/g, "").length >= 7,
        staleTime: 30_000,
    });

    return similarQuery.data ?? [];
}

// Under the email and phone: either "already an open lead" (which stops the form), or a
// note that they were a lead before, lost or converted, so this one is a new opportunity
function DuplicateNotice({ openCopy, earlier }: { openCopy?: SimilarLead; earlier: SimilarLead[] }) {
    if (openCopy) {
        return (
            <div role="alert" className="mt-2 flex items-start gap-2 rounded-lg border border-[#f5d090] bg-[#fff8eb] p-3 text-[#8a5a00]">
                <IconAlertTriangle size={16} className="mt-0.5 shrink-0" />
                <p className="min-w-0 flex-1">
                    <span className="font-medium">{openCopy.name}</span> is already an open lead with the same {openCopy.matchedOn}
                    {openCopy.owner ? `, owned by ${openCopy.owner}` : ""}. Work on that one instead of adding a second.
                </p>
                {openCopy.canOpen && (
                    // a new tab, so this form isn't lost
                    <a
                        href={`/leads?open=${openCopy.id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="flex shrink-0 items-center gap-1 text-sm font-medium text-accent hover:underline"
                    >
                        Open <IconExternalLink size={13} />
                    </a>
                )}
            </div>
        );
    }

    if (earlier.length === 0) return null;
    const [last] = earlier;

    return (
        <p role="status" className="mt-2 flex items-center gap-1.5 rounded-lg bg-paper px-3 py-2 text-sm text-muted">
            <IconInfoCircle size={15} className="shrink-0 text-faint" />
            <span className="min-w-0">
                Was a lead before: <span className="font-medium text-ink">{last.name}</span> ({last.stage.name}). This starts a new opportunity for them.
            </span>
        </p>
    );
}

interface ContactOption {
    id: number;
    name: string;
    phone: string | null;
    email: string | null;
}

// Search-to-link: typing finds existing contacts by name or phone; picking
// one fills contactId (and name/phone/email) instead of creating a new one.
function ContactPicker({
    selected,
    onSelect,
    onClear,
}: {
    selected: ContactOption | null;
    onSelect: (contact: ContactOption) => void;
    onClear: () => void;
}) {
    const [query, setQuery] = useState("");
    const [debounced, setDebounced] = useState("");

    useEffect(() => {
        const timer = setTimeout(() => setDebounced(query.trim()), 300);
        return () => clearTimeout(timer);
    }, [query]);

    const searchQuery = useQuery({
        queryKey: ["contacts", "search", debounced],
        queryFn: () =>
            api.get<{ data: ContactOption[] }>("/contacts", { params: { search: debounced, limit: 5 } }).then((res) => res.data.data),
        enabled: debounced.length > 0,
    });

    if (selected) {
        return (
            <div className="flex h-8 items-center justify-between rounded-lg border border-line bg-app px-2">
                <span className="truncate text-sm">
                    {selected.name}
                    {selected.phone && <span className="text-faint"> · {selected.phone}</span>}
                </span>
                <button type="button" onClick={onClear} aria-label="Clear linked contact" className="text-faint hover:text-ink">
                    <IconX size={14} />
                </button>
            </div>
        );
    }

    return (
        <div className="relative">
            <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name or phone..."
                className={inputClassName}
            />
            {debounced && (
                <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-line bg-surface shadow-strong">
                    {searchQuery.isLoading && <InlineLoader label="Searching" className="py-2!" />}
                    {searchQuery.data?.length === 0 && (
                        <p className="px-2 py-1.5 text-sm text-faint">No match — a new contact will be created</p>
                    )}
                    {searchQuery.data?.map((option) => (
                        <button
                            key={option.id}
                            type="button"
                            onClick={() => { onSelect(option); setQuery(""); }}
                            className="flex w-full items-center justify-between px-2 py-1.5 text-left text-sm hover:bg-fill"
                        >
                            <span className="truncate">{option.name}</span>
                            {option.phone && <span className="shrink-0 text-faint">{option.phone}</span>}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

