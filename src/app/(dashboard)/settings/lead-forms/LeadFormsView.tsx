"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { IconCheck, IconCode, IconCopy, IconExternalLink, IconPencil, IconPlus, IconTrash } from "@tabler/icons-react";

import { api, errorMessage } from "@/lib/api/client";
import { ConfirmDeleteModal } from "@/components/ListPage";
import { ErrorState } from "@/components/ErrorState";
import { PageLoader, Spinner } from "@/components/Loader";
import { SectionIcon } from "@/components/SectionIcon";
import { MultiSelect, Select } from "@/components/Select";
import { StageBadge } from "@/components/StageBadge";
import { toast } from "@/components/Toast";
import { SidePanel } from "@/components/SidePanel";
import { readFormSettings } from "@/lib/validations/leadForms";
import { useCustomFields, type AgentOption, type CustomFieldDef } from "../../shared/customFields";
import { embedHtml, FormBuilder } from "./FormBuilder";

export interface LeadForm {
    id: number;
    // FORM = a web form; WEBHOOK = a lead integration (Settings > Lead integrations)
    kind: "FORM" | "WEBHOOK";
    name: string;
    key: string;
    source: { id: number; name: string; color: string } | null;
    owner: { id: number; name: string } | null;
    // share leads in turn between these people (round-robin); empty = just the owner
    assigneeIds: number[];
    // what it asks and how its page reads (read through readFormSettings)
    settings: unknown;
}

export interface LeadSource {
    id: number;
    name: string;
    color: string;
}

const inputClassName =
    "h-8 w-full rounded-lg border border-line bg-surface px-2 outline-none placeholder:text-light focus:border-accent focus:ring-3 focus:ring-accent-soft";

// Settings > Web forms: forms on a website that turn every submission into a lead here
export default function LeadFormsView({ seeAgents }: { seeAgents: boolean }) {
    const queryClient = useQueryClient();
    const [name, setName] = useState("");

    const formsQuery = useQuery({
        queryKey: ["leadForms"],
        queryFn: () => api.get<{ data: LeadForm[] }>("/lead-forms").then((res) => res.data.data),
    });

    const sourcesQuery = useQuery({
        queryKey: ["leadSource"],
        queryFn: () => api.get<{ data: LeadSource[] }>("/lead-sources").then((res) => res.data.data),
    });

    const agentsQuery = useQuery({
        queryKey: ["agents"],
        queryFn: () => api.get<{ data: AgentOption[] }>("/agents").then((res) => res.data.data),
        enabled: seeAgents,
    });

    // the lead custom fields a form can ask for
    const customFieldsQuery = useCustomFields("lead");

    const create = useMutation({
        mutationFn: (formName: string) => api.post("/lead-forms", { name: formName }),
        onSuccess: () => {
            toast.success("Form created");
            setName("");
            queryClient.invalidateQueries({ queryKey: ["leadForms"] });
        },
        onError: (error) => toast.error(errorMessage(error)),
    });

    return (
        <div className="flex h-full flex-col">
            <header className="flex h-12 shrink-0 items-center gap-2 border-b border-line bg-paper px-3">
                <SectionIcon section="leadForms" size="md" />
                <h1 className="font-semibold">Web forms</h1>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto">
                <div className="mx-auto max-w-3xl px-6 py-8">
                    <div className="flex items-start gap-4">
                        <SectionIcon section="leadForms" size="lg" />
                        <div className="min-w-0 pt-0.5">
                            <h2 className="text-[17px] leading-6 font-semibold tracking-[-0.01em]">Web forms</h2>
                            <p className="mt-0.5 text-muted">
                                Put a form on your website and every submission becomes a lead here: tagged with its source, given to its owner along
                                with a task to reply today. Someone who&apos;s already a lead isn&apos;t added twice.
                            </p>
                        </div>
                    </div>

                    <form
                        className="mt-6 flex gap-2"
                        onSubmit={(event) => {
                            event.preventDefault();
                            if (name.trim()) create.mutate(name.trim());
                        }}
                    >
                        <input
                            value={name}
                            onChange={(event) => setName(event.target.value)}
                            maxLength={100}
                            placeholder="Name a new form, e.g. Website demo requests"
                            aria-label="New form name"
                            className={inputClassName}
                        />
                        <button
                            type="submit"
                            disabled={!name.trim() || create.isPending}
                            className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-accent px-3 font-medium text-on-accent hover:bg-accent-hover disabled:opacity-60"
                        >
                            {create.isPending ? <Spinner size={14} /> : <IconPlus size={14} />}
                            Create form
                        </button>
                    </form>

                    {formsQuery.isPending && <PageLoader label="Loading web forms" />}
                    {formsQuery.isError && (
                        <ErrorState title="Couldn't load web forms" error={formsQuery.error} onRetry={() => formsQuery.refetch()} retrying={formsQuery.isFetching} />
                    )}
                    {formsQuery.data?.every((form) => form.kind !== "FORM") && (
                        <p className="mt-4 rounded-xl border border-dashed border-line-strong px-4 py-10 text-center text-faint">
                            No forms yet. Create one above, then paste it into your website.
                        </p>
                    )}

                    <div className="mt-4 flex flex-col gap-4">
                        {formsQuery.data?.filter((form) => form.kind === "FORM").map((form) => (
                            <FormCard key={form.id} form={form} sources={sourcesQuery.data ?? []} agents={agentsQuery.data} definitions={customFieldsQuery.data ?? []} />
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}

function FormCard({ form, sources, agents, definitions }: { form: LeadForm; sources: LeadSource[]; agents?: AgentOption[]; definitions: CustomFieldDef[] }) {
    const queryClient = useQueryClient();
    const [deleting, setDeleting] = useState(false);
    const [editing, setEditing] = useState(false);
    const [showHtml, setShowHtml] = useState(false);
    const settings = readFormSettings(form.settings);
    const html = embedHtml(`${window.location.origin}/api/public/forms/${form.key}`, settings, form.name, definitions);
    // shown only after the list has loaded in the browser, so window is always there
    const endpoint = `${window.location.origin}/api/public/forms/${form.key}`;
    const pageUrl = `${window.location.origin}/f/${form.key}`;
    const asked = settings.customFields.length;

    const refresh = () => queryClient.invalidateQueries({ queryKey: ["leadForms"] });

    const update = useMutation({
        mutationFn: (changes: Record<string, unknown>) => api.patch(`/lead-forms/${form.id}`, changes),
        onSuccess: () => {
            toast.success("Form updated");
            refresh();
        },
        onError: (error) => toast.error(errorMessage(error)),
    });

    const remove = useMutation({
        mutationFn: () => api.delete(`/lead-forms/${form.id}`),
        onSuccess: () => {
            toast.success("Form deleted");
            setDeleting(false);
            refresh();
        },
    });

    return (
        <section className="rounded-xl border border-line bg-surface p-4 shadow-[0_1px_2px_rgb(0_0_0/0.04)]">
            <div className="flex items-center gap-2">
                <input
                    defaultValue={form.name}
                    aria-label="Form name"
                    maxLength={100}
                    onBlur={(event) => {
                        const next = event.target.value.trim();
                        if (next && next !== form.name) update.mutate({ name: next });
                        else event.target.value = form.name;
                    }}
                    onKeyDown={(event) => event.key === "Enter" && event.currentTarget.blur()}
                    className="h-8 min-w-0 flex-1 rounded-lg border border-transparent px-2 text-[15px] font-semibold outline-none hover:border-line focus:border-accent focus:ring-3 focus:ring-accent-soft"
                />
                <button
                    type="button"
                    onClick={() => setEditing(true)}
                    className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-line px-2.5 font-medium text-muted hover:bg-paper hover:text-ink"
                >
                    <IconPencil size={14} />
                    Edit form
                </button>
                <button
                    type="button"
                    aria-label={`Delete ${form.name}`}
                    onClick={() => setDeleting(true)}
                    className="flex size-8 shrink-0 items-center justify-center rounded-lg text-faint hover:bg-danger-soft hover:text-danger"
                >
                    <IconTrash size={15} />
                </button>
            </div>

            <LeadRouting form={form} sources={sources} agents={agents} onChange={(changes) => update.mutate(changes)} />

            {/* the hosted page: share it anywhere, no website needed */}
            <div className="mt-4 px-2">
                <p className="mb-1 text-sm font-medium text-muted">Share this form</p>
                <div className="flex items-center gap-2 rounded-lg border border-line bg-paper px-2.5 py-1.5">
                    <code className="min-w-0 flex-1 truncate font-mono text-[12px] text-ink [font-variant-ligatures:none]">{pageUrl}</code>
                    <CopyButton text={pageUrl} label="Copy link" />
                    <a
                        href={pageUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="flex h-7 shrink-0 items-center gap-1 rounded-md border border-line bg-surface px-2 text-sm font-medium text-muted hover:text-ink"
                    >
                        <IconExternalLink size={13} />
                        Open
                    </a>
                </div>
                <p className="mt-1 text-sm text-faint">
                    Its own page, for an Instagram bio, WhatsApp, a QR code or an email. Asks for name, phone
                    {settings.email !== "hidden" && ", email"}
                    {settings.company !== "hidden" && ", company"}
                    {asked > 0 && ` and ${asked} of your lead field${asked === 1 ? "" : "s"}`}.
                </p>
            </div>

            <div className="mt-4 px-2">
                <p className="mb-1 text-sm font-medium text-muted">For developers: send submissions to</p>
                <div className="flex items-center gap-2 rounded-lg border border-line bg-paper px-2.5 py-1.5">
                    <code className="min-w-0 flex-1 truncate font-mono text-[12px] text-ink [font-variant-ligatures:none]">{endpoint}</code>
                    <CopyButton text={endpoint} label="Copy link" />
                </div>
            </div>

            <div className="mt-3 px-2">
                <button
                    type="button"
                    onClick={() => setShowHtml((shown) => !shown)}
                    className="flex h-7 items-center gap-1.5 rounded-lg px-1 text-sm font-medium text-muted hover:text-ink"
                >
                    <IconCode size={15} />
                    {showHtml ? "Hide the HTML" : "Get HTML for your website"}
                </button>
                {showHtml && (
                    <div className="mt-1">
                        <div className="overflow-hidden rounded-lg border border-line bg-[#fafafa]">
                            <div className="flex items-center justify-between border-b border-line-light bg-paper px-3 py-1.5">
                                <span className="text-sm text-faint">HTML</span>
                                <CopyButton text={html} label="Copy HTML" />
                            </div>
                            {/* no ligatures, so "-->" shows as typed rather than as an arrow */}
                            <pre className="overflow-x-auto p-3 font-mono text-[12px] leading-5 text-ink [font-variant-ligatures:none]">{html}</pre>
                        </div>
                        <p className="mt-1.5 text-sm text-faint">
                            Paste it into your site (in WordPress, Webflow or Wix: a &quot;Custom HTML&quot; block) and style it any way you like. It
                            follows this form&apos;s setup; copy it again after editing the form. Keep the hidden &quot;website&quot; field: it stops spam
                            bots. Any extra fields you add are saved on the lead&apos;s timeline.
                        </p>
                    </div>
                )}
            </div>

            <SidePanel open={editing} onClose={() => setEditing(false)} wide>
                <FormBuilder formId={form.id} formName={form.name} saved={settings} definitions={definitions} onClose={() => setEditing(false)} />
            </SidePanel>

            <ConfirmDeleteModal
                open={deleting}
                title={`Delete "${form.name}"?`}
                description="The form stops accepting submissions straight away. Leads it already brought in stay."
                error={remove.isError ? errorMessage(remove.error) : undefined}
                pending={remove.isPending}
                onCancel={() => setDeleting(false)}
                onConfirm={() => remove.mutate()}
            />
        </section>
    );
}

/**
 * Where a form's or integration's leads go: the source they're tagged with, and who gets
 * them (one person, nobody, or people taking turns). Shared by web forms and lead integrations.
 */
export function LeadRouting({
    form,
    sources,
    agents,
    onChange,
}: {
    form: LeadForm;
    sources: LeadSource[];
    agents?: AgentOption[];
    onChange: (changes: Record<string, unknown>) => void;
}) {
    // "Take turns" is picked first, then the people; shown while there's a rotation
    const [rotating, setRotating] = useState(form.assigneeIds.length > 0);

    return (
        <>
            <div className="mt-3 grid gap-3 px-2 sm:grid-cols-2">
                <div>
                    <p className="mb-1 text-sm font-medium text-muted">Tag new leads as</p>
                    <Select
                        value={form.source ? String(form.source.id) : "none"}
                        onChange={(value) => onChange({ sourceId: value && value !== "none" ? Number(value) : null })}
                        placeholder="No source"
                        options={[
                            { value: "none", label: "No source" },
                            ...sources.map((source) => ({ value: String(source.id), label: source.name, render: <StageBadge name={source.name} color={source.color} /> })),
                        ]}
                    />
                </div>
                <div>
                    <p className="mb-1 text-sm font-medium text-muted">Give them to</p>
                    {agents ? (
                        <Select
                            value={rotating ? "rotate" : form.owner ? String(form.owner.id) : "none"}
                            onChange={(value) => {
                                // the people who take turns are picked just below
                                if (value === "rotate") return setRotating(true);
                                setRotating(false);
                                onChange({ ownerId: value && value !== "none" ? Number(value) : null, assigneeIds: [] });
                            }}
                            placeholder="Nobody"
                            options={[
                                { value: "none", label: "Nobody (leave unassigned)" },
                                { value: "rotate", label: "Take turns between people…" },
                                ...agents.map((agent) => ({ value: String(agent.id), label: agent.name })),
                            ]}
                        />
                    ) : (
                        <p className="flex h-8 items-center text-ink">
                            {form.assigneeIds.length > 0 ? `Shared between ${form.assigneeIds.length} people` : (form.owner?.name ?? "Nobody (unassigned)")}
                        </p>
                    )}
                </div>
            </div>

            {agents && rotating && (
                <div className="mt-3 px-2">
                    <p className="mb-1 text-sm font-medium text-muted">Taking turns</p>
                    <MultiSelect
                        values={form.assigneeIds.map(String)}
                        onChange={(values) => onChange({ assigneeIds: values.map(Number) })}
                        options={agents.map((agent) => ({ value: String(agent.id), label: agent.name }))}
                        placeholder="Pick who shares the leads"
                    />
                    <p className="mt-1 text-sm text-faint">Each new lead goes to the next person here, in order, so everyone gets the same share.</p>
                </div>
            )}
        </>
    );
}

export function CopyButton({ text, label }: { text: string; label: string }) {
    const [copied, setCopied] = useState(false);

    return (
        <button
            type="button"
            onClick={async () => {
                await navigator.clipboard.writeText(text);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
            }}
            className="flex h-7 shrink-0 items-center gap-1 rounded-md border border-line bg-surface px-2 text-sm font-medium text-muted hover:text-ink"
        >
            {copied ? <IconCheck size={13} className="text-[#218358]" /> : <IconCopy size={13} />}
            {copied ? "Copied" : label}
        </button>
    );
}
