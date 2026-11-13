"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { IconChevronDown, IconFlask, IconPlus, IconRefresh, IconTrash } from "@tabler/icons-react";

import { api, errorMessage } from "@/lib/api/client";
import { ConfirmDeleteModal } from "@/components/ListPage";
import { ErrorState } from "@/components/ErrorState";
import { PageLoader, SkeletonList, Spinner } from "@/components/Loader";
import { Modal } from "@/components/Modal";
import { SectionIcon } from "@/components/SectionIcon";
import { toast } from "@/components/Toast";
import { timeAgo } from "@/lib/utils/format";
import type { AgentOption } from "../../shared/customFields";
import { CopyButton, LeadRouting, type LeadForm, type LeadSource } from "../lead-forms/LeadFormsView";

interface Delivery {
    id: number;
    status: "CREATED" | "UPDATED" | "REJECTED";
    message: string;
    leadId: number | null;
    payload: unknown;
    createdAt: string;
}

const inputClassName =
    "h-8 w-full rounded-lg border border-line bg-surface px-2 outline-none placeholder:text-light focus:border-accent focus:ring-3 focus:ring-accent-soft";

// Settings > Lead integrations: a private link per tool that sends leads in by itself
export default function IntegrationsView({ seeAgents }: { seeAgents: boolean }) {
    const queryClient = useQueryClient();
    const [name, setName] = useState("");

    // integrations are lead forms of kind WEBHOOK (same source, owner and rotation rules)
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

    const create = useMutation({
        mutationFn: (integrationName: string) => api.post("/lead-forms", { name: integrationName, kind: "WEBHOOK" }),
        onSuccess: () => {
            toast.success("Integration created");
            setName("");
            queryClient.invalidateQueries({ queryKey: ["leadForms"] });
            // it may have made a source of the same name
            queryClient.invalidateQueries({ queryKey: ["leadSource"] });
        },
        onError: (error) => toast.error(errorMessage(error)),
    });

    const integrations = formsQuery.data?.filter((form) => form.kind === "WEBHOOK");

    return (
        <div className="flex h-full flex-col">
            <header className="flex h-12 shrink-0 items-center gap-2 border-b border-line bg-paper px-3">
                <SectionIcon section="integrations" size="md" />
                <h1 className="font-semibold">Lead integrations</h1>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto">
                <div className="mx-auto max-w-3xl px-6 py-8">
                    <div className="flex items-start gap-4">
                        <SectionIcon section="integrations" size="lg" />
                        <div className="min-w-0 pt-0.5">
                            <h2 className="text-[17px] leading-6 font-semibold tracking-[-0.01em]">Lead integrations</h2>
                            <p className="mt-0.5 text-muted">
                                Bring in leads from Google Ads, IndiaMART, your IVR, Facebook (through Zapier, Make or Pabbly) or your own code. Each one gets a private
                                link: whatever it sends there becomes a lead here, tagged, assigned and with a task to reply, just like a web form. Someone
                                who&apos;s already an open lead isn&apos;t added twice.
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
                            placeholder="Name where the leads come from, e.g. Google Ads"
                            aria-label="New integration name"
                            className={inputClassName}
                        />
                        <button
                            type="submit"
                            disabled={!name.trim() || create.isPending}
                            className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-accent px-3 font-medium text-on-accent hover:bg-accent-hover disabled:opacity-60"
                        >
                            {create.isPending ? <Spinner size={14} /> : <IconPlus size={14} />}
                            Create link
                        </button>
                    </form>

                    {formsQuery.isPending && <PageLoader label="Loading integrations" />}
                    {formsQuery.isError && (
                        <ErrorState title="Couldn't load integrations" error={formsQuery.error} onRetry={() => formsQuery.refetch()} retrying={formsQuery.isFetching} />
                    )}
                    {integrations?.length === 0 && (
                        <p className="mt-4 rounded-xl border border-dashed border-line-strong px-4 py-10 text-center text-faint">
                            No integrations yet. Create one above for each place leads come from, so each is tagged with its own source.
                        </p>
                    )}

                    <div className="mt-4 flex flex-col gap-4">
                        {integrations?.map((integration) => (
                            <IntegrationCard key={integration.id} integration={integration} sources={sourcesQuery.data ?? []} agents={agentsQuery.data} />
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}

function IntegrationCard({ integration, sources, agents }: { integration: LeadForm; sources: LeadSource[]; agents?: AgentOption[] }) {
    const queryClient = useQueryClient();
    const [deleting, setDeleting] = useState(false);
    const [renewing, setRenewing] = useState(false);
    // shown only after the list has loaded in the browser, so window is always there
    const url = `${window.location.origin}/api/public/leads/${integration.key}`;

    const refresh = () => queryClient.invalidateQueries({ queryKey: ["leadForms"] });

    const update = useMutation({
        mutationFn: (changes: Record<string, unknown>) => api.patch(`/lead-forms/${integration.id}`, changes),
        onSuccess: (_, changes) => {
            toast.success(changes.newKey ? "New link made. Paste it into the tool that sends the leads." : "Integration updated");
            setRenewing(false);
            refresh();
        },
        onError: (error) => toast.error(errorMessage(error)),
    });

    const remove = useMutation({
        mutationFn: () => api.delete(`/lead-forms/${integration.id}`),
        onSuccess: () => {
            toast.success("Integration deleted");
            setDeleting(false);
            refresh();
        },
    });

    // a made-up lead sent to the real link, the way another tool would
    const test = useMutation({
        mutationFn: () =>
            fetch(url, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    full_name: "Test Lead",
                    phone_number: `+91 9${String(Math.floor(Math.random() * 1e9)).padStart(9, "0")}`,
                    email: "test.lead@example.com",
                    message: `A test from the "${integration.name}" integration. You can delete this lead.`,
                }),
            }).then(async (res) => {
                const body = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(body.message ?? `The link answered ${res.status}`);
                return body;
            }),
        onSuccess: () => {
            toast.success("Test lead received", "It's in Leads, and in the list below");
            refresh();
        },
        onError: (error) => toast.error("The test didn't go through", error.message),
    });

    return (
        <section className="rounded-xl border border-line bg-surface p-4 shadow-[0_1px_2px_rgb(0_0_0/0.04)]">
            <div className="flex items-center gap-2">
                <input
                    defaultValue={integration.name}
                    aria-label="Integration name"
                    maxLength={100}
                    onBlur={(event) => {
                        const next = event.target.value.trim();
                        if (next && next !== integration.name) update.mutate({ name: next });
                        else event.target.value = integration.name;
                    }}
                    onKeyDown={(event) => event.key === "Enter" && event.currentTarget.blur()}
                    className="h-8 min-w-0 flex-1 rounded-lg border border-transparent px-2 text-[15px] font-semibold outline-none hover:border-line focus:border-accent focus:ring-3 focus:ring-accent-soft"
                />
                <button
                    type="button"
                    onClick={() => test.mutate()}
                    disabled={test.isPending}
                    className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-line px-2.5 font-medium text-muted hover:bg-paper hover:text-ink disabled:opacity-60"
                >
                    {test.isPending ? <Spinner size={14} /> : <IconFlask size={14} />}
                    Send a test lead
                </button>
                <button
                    type="button"
                    aria-label={`Delete ${integration.name}`}
                    onClick={() => setDeleting(true)}
                    className="flex size-8 shrink-0 items-center justify-center rounded-lg text-faint hover:bg-danger-soft hover:text-danger"
                >
                    <IconTrash size={15} />
                </button>
            </div>

            <LeadRouting form={integration} sources={sources} agents={agents} onChange={(changes) => update.mutate(changes)} />

            <div className="mt-4 px-2">
                <p className="mb-1 text-sm font-medium text-muted">Send leads to this link</p>
                <div className="flex items-center gap-2 rounded-lg border border-line bg-paper px-2.5 py-1.5">
                    <code className="min-w-0 flex-1 truncate font-mono text-[12px] text-ink [font-variant-ligatures:none]">{url}</code>
                    <CopyButton text={url} label="Copy link" />
                    <button
                        type="button"
                        onClick={() => setRenewing(true)}
                        className="flex h-7 shrink-0 items-center gap-1 rounded-md border border-line bg-surface px-2 text-sm font-medium text-muted hover:text-ink"
                    >
                        <IconRefresh size={13} />
                        New link
                    </button>
                </div>
                <p className="mt-1 text-sm text-faint">Keep it private: anyone with this link can add leads. If it gets out, make a new one.</p>
            </div>

            <HowToConnect url={url} />
            <Deliveries integrationId={integration.id} />

            <Modal open={renewing} onClose={() => setRenewing(false)}>
                <div className="p-6">
                    <h2 className="text-lg font-semibold">Make a new link?</h2>
                    <p className="mt-2 text-muted">
                        The current link stops working straight away, so anything still sending to it will fail until you paste the new one in.
                    </p>
                    <div className="mt-6 flex justify-end gap-2">
                        <button type="button" onClick={() => setRenewing(false)} className="h-8 rounded-lg border border-fill bg-black/2 px-3 font-medium text-muted hover:bg-app">
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={() => update.mutate({ newKey: true })}
                            disabled={update.isPending}
                            className="flex h-8 items-center gap-1.5 rounded-lg bg-accent px-3 font-medium text-on-accent hover:bg-accent-hover disabled:opacity-60"
                        >
                            {update.isPending && <Spinner size={14} />}
                            Make a new link
                        </button>
                    </div>
                </div>
            </Modal>

            <ConfirmDeleteModal
                open={deleting}
                title={`Delete "${integration.name}"?`}
                description="Its link stops working straight away. Leads it already brought in stay."
                error={remove.isError ? errorMessage(remove.error) : undefined}
                pending={remove.isPending}
                onCancel={() => setDeleting(false)}
                onConfirm={() => remove.mutate()}
            />
        </section>
    );
}

const GUIDES = [
    {
        id: "google",
        label: "Google Ads",
        steps: [
            "In Google Ads, open the campaign's lead form, then Lead delivery (or \"Export leads from Google Ads\") → Webhook integration.",
            "Paste the link above as the Webhook URL. The Key can be anything you like: the link itself is already private.",
            "Click Send test data. A lead appears here and in the list below. The campaign is saved as its campaign id.",
        ],
    },
    {
        id: "nocode",
        label: "Zapier, Make, Pabbly",
        steps: [
            "Start the automation from where the leads are (Facebook Lead Ads, IndiaMART, Typeform, a Google Sheet...).",
            "Add a webhook step: \"Webhooks by Zapier → POST\", Make's \"HTTP → Make a request\", or Pabbly's \"API by Pabbly\". Method POST, body JSON, URL = the link above.",
            "Map the fields: name, phone, email, company, message. Other names work too (full_name, phone_number, Mobile No.), and any of your lead custom fields by their name. Everything else is kept on the lead's timeline.",
        ],
    },
    {
        id: "indiamart",
        label: "IndiaMART",
        steps: [
            "If your IndiaMART account has the Push API (CRM integration), paste the link above as its push URL.",
            "Flash reads IndiaMART's own fields: SENDER_NAME, SENDER_MOBILE, SENDER_EMAIL, SENDER_COMPANY and QUERY_MESSAGE.",
            "No Push API? Connect IndiaMART through Pabbly or Make instead (the tab before this one).",
        ],
    },
    {
        id: "ivr",
        label: "IVR & calls",
        steps: [
            "In your calling provider (Exotel, Knowlarity, MyOperator, Tata Smartflo...), find the call webhook or callback URL setting and paste the link above. Exotel: add a Passthru applet to the call flow with this link.",
            "Each call becomes a lead from the caller's number (CallFrom, caller_number and the like). With no name, the number is used as the name until someone edits it.",
            "The call's other details (recording link, duration, key pressed) are kept on the lead's timeline. A repeat caller who's already an open lead isn't added again.",
        ],
    },
] as const;

// Step-by-step for the common tools, and the plain request for developers
function HowToConnect({ url }: { url: string }) {
    const [open, setOpen] = useState(false);
    const [tab, setTab] = useState<(typeof GUIDES)[number]["id"] | "code">("google");
    const guide = GUIDES.find((item) => item.id === tab);
    const curl = `curl -X POST "${url}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"name": "Rahul Mehta", "phone": "+91 98765 43210", "email": "rahul@acme.com", "company": "Acme", "message": "Need a demo", "utm_campaign": "diwali-sale"}'`;

    return (
        <div className="mt-3 px-2">
            <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex h-7 items-center gap-1.5 rounded-lg px-1 text-sm font-medium text-muted hover:text-ink">
                <IconChevronDown size={15} className={`transition-transform ${open ? "rotate-180" : ""}`} />
                How to connect a tool
            </button>
            {open && (
                <div className="mt-1 rounded-lg border border-line">
                    <div className="flex flex-wrap gap-1 border-b border-line-light px-2 py-1.5">
                        {[...GUIDES.map(({ id, label }) => ({ id, label })), { id: "code" as const, label: "Developers" }].map((item) => (
                            <button
                                key={item.id}
                                type="button"
                                onClick={() => setTab(item.id)}
                                className={`flex h-7 items-center rounded-lg px-2.5 text-sm font-medium ${item.id === tab ? "bg-fill text-ink" : "text-muted hover:bg-app"}`}
                            >
                                {item.label}
                            </button>
                        ))}
                    </div>
                    <div className="p-3">
                        {guide ? (
                            <ol className="list-decimal space-y-1.5 pl-5 text-muted">
                                {guide.steps.map((step) => (
                                    <li key={step}>{step}</li>
                                ))}
                            </ol>
                        ) : (
                            <>
                                <p className="text-muted">
                                    POST one lead as JSON. <code className="font-mono text-[12px]">name</code> and <code className="font-mono text-[12px]">phone</code>{" "}
                                    are required. The answer is <code className="font-mono text-[12px]">200</code> with the lead&apos;s id, or{" "}
                                    <code className="font-mono text-[12px]">400</code> with a message saying what was wrong.
                                </p>
                                <div className="mt-2 overflow-hidden rounded-lg border border-line bg-[#fafafa]">
                                    <div className="flex items-center justify-between border-b border-line-light bg-paper px-3 py-1.5">
                                        <span className="text-sm text-faint">Example</span>
                                        <CopyButton text={curl} label="Copy" />
                                    </div>
                                    <pre className="overflow-x-auto p-3 font-mono text-[12px] leading-5 text-ink [font-variant-ligatures:none]">{curl}</pre>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

const STATUS = {
    CREATED: { label: "New lead", className: "bg-success-soft text-success" },
    UPDATED: { label: "Existing lead", className: "bg-accent-soft text-accent" },
    REJECTED: { label: "Rejected", className: "bg-danger-soft text-danger" },
} as const;

// What arrived lately, newest first: the fastest way to see why a tool's leads aren't showing up
function Deliveries({ integrationId }: { integrationId: number }) {
    const [showAll, setShowAll] = useState(false);
    const [openId, setOpenId] = useState<number | null>(null);

    const query = useQuery({
        queryKey: ["leadForms", integrationId, "deliveries"],
        queryFn: () => api.get<{ data: Delivery[] }>(`/lead-forms/${integrationId}/deliveries`).then((res) => res.data.data),
    });

    const deliveries = query.data ?? [];
    const shown = showAll ? deliveries : deliveries.slice(0, 5);

    return (
        <div className="mt-4 px-2">
            <p className="mb-1 text-sm font-medium text-muted">Recently received</p>
            {query.isPending && <SkeletonList rows={2} />}
            {query.isError && <ErrorState variant="inline" title="Couldn't load what was received" error={query.error} onRetry={() => query.refetch()} retrying={query.isFetching} />}
            {query.isSuccess && deliveries.length === 0 && <p className="text-sm text-light">Nothing yet. Send a test lead, or connect a tool.</p>}

            {deliveries.length > 0 && (
                <ul className="overflow-hidden rounded-lg border border-line">
                    {shown.map((delivery) => (
                        <li key={delivery.id} className="border-b border-line-light last:border-b-0">
                            <button
                                type="button"
                                onClick={() => setOpenId(openId === delivery.id ? null : delivery.id)}
                                aria-expanded={openId === delivery.id}
                                className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-paper"
                            >
                                <span className={`inline-flex h-5 shrink-0 items-center rounded-full px-2 text-sm font-medium ${STATUS[delivery.status].className}`}>
                                    {STATUS[delivery.status].label}
                                </span>
                                <span className="min-w-0 flex-1 truncate text-ink">{delivery.message}</span>
                                <span className="shrink-0 text-sm text-faint">{timeAgo(delivery.createdAt)}</span>
                                <IconChevronDown size={14} className={`shrink-0 text-faint transition-transform ${openId === delivery.id ? "rotate-180" : ""}`} />
                            </button>
                            {openId === delivery.id && (
                                <div className="border-t border-line-light bg-paper px-3 py-2">
                                    {delivery.leadId && (
                                        <Link href={`/leads?open=${delivery.leadId}`} className="text-sm font-medium text-accent hover:underline">
                                            Open the lead
                                        </Link>
                                    )}
                                    <p className="mt-1 text-sm text-faint">What was sent</p>
                                    <pre className="mt-1 max-h-60 overflow-auto rounded-md border border-line bg-surface p-2 font-mono text-[12px] leading-5 text-ink [font-variant-ligatures:none]">
                                        {JSON.stringify(delivery.payload, null, 2)}
                                    </pre>
                                </div>
                            )}
                        </li>
                    ))}
                </ul>
            )}
            {deliveries.length > 5 && (
                <button type="button" onClick={() => setShowAll(!showAll)} className="mt-1 text-sm font-medium text-muted hover:text-ink">
                    {showAll ? "Show fewer" : `Show all ${deliveries.length}`}
                </button>
            )}
        </div>
    );
}
