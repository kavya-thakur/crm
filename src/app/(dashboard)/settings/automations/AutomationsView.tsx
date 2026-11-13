"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { IconChevronDown, IconPencil, IconPlus, IconTrash } from "@tabler/icons-react";

import { api, errorMessage } from "@/lib/api/client";
import { ConfirmDeleteModal } from "@/components/ListPage";
import { ErrorState } from "@/components/ErrorState";
import { PageLoader, SkeletonList } from "@/components/Loader";
import { SectionIcon } from "@/components/SectionIcon";
import { SidePanel } from "@/components/SidePanel";
import { toast } from "@/components/Toast";
import { timeAgo } from "@/lib/utils/format";
import { useCustomFields } from "../../shared/customFields";
import { useEmailTemplates } from "../../shared/emails";
import { stageName, usePipelines, type PipelineStage } from "../../deals/shared";
import { OP_LABELS, RuleBuilder, TRIGGER_LABELS, conditionFields, type AutomationRule, type Choices } from "./RuleBuilder";

interface ListedRule extends AutomationRule {
    _count: { runs: number };
    // the newest run, if it has ever run
    runs: { status: string; createdAt: string }[];
}

interface Run {
    id: number;
    status: "RUNNING" | "DONE" | "FAILED";
    summary: string;
    createdAt: string;
    lead: { id: number; name: string } | null;
    deal: { id: number; title: string } | null;
}

type Named = { id: number; name: string };
type Stage = Named & { isConverted?: boolean };
const toOptions = (items: Named[] | undefined) => (items ?? []).map((item) => ({ value: String(item.id), label: item.name }));

// Settings > Automations: "when a lead comes in / a deal is won, if…, then…" rules that work for the team
export default function AutomationsView() {
    // the rule in the side panel: an existing one, "new", or none
    const [editing, setEditing] = useState<AutomationRule | "new" | null>(null);

    const rulesQuery = useQuery({
        queryKey: ["automations"],
        queryFn: () => api.get<{ data: ListedRule[] }>("/automations").then((res) => res.data.data),
    });
    const choices = useChoices();

    return (
        <div className="flex h-full flex-col">
            <header className="flex h-12 shrink-0 items-center gap-2 border-b border-line bg-paper px-3">
                <SectionIcon section="automations" size="md" />
                <h1 className="font-semibold">Automations</h1>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto">
                <div className="mx-auto max-w-3xl px-6 py-8">
                    <div className="flex items-start gap-4">
                        <SectionIcon section="automations" size="lg" />
                        <div className="min-w-0 flex-1 pt-0.5">
                            <h2 className="text-[17px] leading-6 font-semibold tracking-[-0.01em]">Automations</h2>
                            <p className="mt-0.5 text-muted">
                                Let Flash do the routine work: give new leads to the right person, send the first email, add the follow-up task, and tell
                                the team when a deal is won or lost. Rules run top to bottom, a few seconds after it happens.
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={() => setEditing("new")}
                            className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-accent px-3 font-medium text-on-accent hover:bg-accent-hover"
                        >
                            <IconPlus size={14} />
                            New automation
                        </button>
                    </div>

                    {rulesQuery.isPending && <PageLoader label="Loading automations" />}
                    {rulesQuery.isError && (
                        <ErrorState title="Couldn't load automations" error={rulesQuery.error} onRetry={() => rulesQuery.refetch()} retrying={rulesQuery.isFetching} />
                    )}
                    {rulesQuery.data?.length === 0 && (
                        <p className="mt-6 rounded-xl border border-dashed border-line-strong px-4 py-10 text-center text-faint">
                            No automations yet. For example: when a lead comes from Google Ads, give it to Priya and add a task to call today. Or when
                            a deal over ₹1,00,000 is won, tell the founder and add a task to start onboarding.
                        </p>
                    )}

                    <div className="mt-6 flex flex-col gap-3">
                        {rulesQuery.data?.map((rule) => (
                            <RuleCard key={rule.id} rule={rule} choices={choices} onEdit={() => setEditing(rule)} />
                        ))}
                    </div>
                </div>
            </div>

            <SidePanel open={editing !== null} onClose={() => setEditing(null)} wide>
                {editing && <RuleBuilder rule={editing === "new" ? null : editing} choices={choices} onClose={() => setEditing(null)} />}
            </SidePanel>
        </div>
    );
}

// The lists the builder picks from. Forms and people need their own permissions;
// without them those lists are just empty.
function useChoices(): Choices {
    const sources = useQuery({
        queryKey: ["leadSource"],
        queryFn: () => api.get<{ data: Named[] }>("/lead-sources").then((res) => res.data.data),
    });
    const leadStages = useQuery({
        queryKey: ["leadStage"],
        queryFn: () => api.get<{ data: Stage[] }>("/lead-stages").then((res) => res.data.data),
    });
    const pipelineStages = useQuery({
        queryKey: ["pipelineStage"],
        queryFn: () => api.get<{ data: PipelineStage[] }>("/pipeline-stages").then((res) => res.data.data),
    });
    const pipelines = usePipelines();
    const forms = useQuery({
        queryKey: ["leadForms"],
        queryFn: () => api.get<{ data: (Named & { kind: string })[] }>("/lead-forms").then((res) => res.data.data),
        retry: false,
    });
    const people = useQuery({
        queryKey: ["agents"],
        queryFn: () => api.get<{ data: Named[] }>("/agents").then((res) => res.data.data),
        retry: false,
    });
    const templates = useEmailTemplates();
    const leadFields = useCustomFields("lead");
    const dealFields = useCustomFields("deal");

    return {
        sources: toOptions(sources.data),
        forms: (forms.data ?? []).map((form) => ({ value: String(form.id), label: `${form.name} (${form.kind === "WEBHOOK" ? "integration" : "web form"})` })),
        people: toOptions(people.data),
        templates: toOptions(templates.data?.data),
        leadStages: (leadStages.data ?? []).map((stage) => ({ value: String(stage.id), label: stage.name, isConverted: Boolean(stage.isConverted) })),
        pipelineStages: (pipelineStages.data ?? []).map((stage) => ({ value: String(stage.id), label: stageName(stage, pipelines.data) })),
        pipelines: toOptions(pipelines.data),
        customFields: { lead: leadFields.data ?? [], deal: dealFields.data ?? [] },
    };
}

// "A deal is won and Amount is more than "100000"" / "notify Rohan, then add task "Start onboarding""
function describe(rule: AutomationRule, choices: Choices) {
    const fields = conditionFields(choices, rule.trigger);
    const labelOf = (options: { value: string; label: string }[], value: string) => options.find((option) => option.value === value)?.label ?? value;
    const kind = rule.trigger.startsWith("deal.") ? "deal" : "lead";
    const stages = kind === "lead" ? choices.leadStages : choices.pipelineStages;

    // "A lead moves to a stage" + "Stage is Qualified" reads as "A lead moves to Qualified"
    let trigger = TRIGGER_LABELS[rule.trigger];
    let rest = rule.conditions;
    const target = rule.trigger.endsWith(".stageChanged") ? rule.conditions.find((condition) => condition.field === "stage" && condition.op === "is") : undefined;
    if (target) {
        trigger = `A ${kind} moves to ${labelOf(stages, target.value)}`;
        rest = rule.conditions.filter((condition) => condition !== target);
    }

    const conditions = rest.map((condition) => {
        const field = fields.find((item) => item.key === condition.field);
        const words = `${field?.label ?? condition.field} ${OP_LABELS[condition.op]}`;
        if (condition.op === "isEmpty" || condition.op === "isSet") return words;
        return `${words} ${field?.values ? labelOf(field.values, condition.value) : `"${condition.value}"`}`;
    });

    const actions = rule.actions.map((action) => {
        switch (action.type) {
            case "assign":
                return `assign to ${action.userIds.map((id) => labelOf(choices.people, String(id))).join(" / ")}`;
            case "email":
                return `send "${labelOf(choices.templates, String(action.templateId))}"`;
            case "task":
                return `add task "${action.title}"`;
            case "notify": {
                const who = [...action.userIds.map((id) => labelOf(choices.people, String(id))), ...(action.toOwner ? ["the owner"] : [])];
                return `notify ${who.join(", ")}`;
            }
            case "move":
                return `move to ${labelOf(stages, String(action.stageId))}`;
        }
    });

    return {
        when: conditions.length > 0 ? `${trigger} and ${conditions.join(" and ")}` : trigger,
        then: actions.join(", then "),
    };
}

function RuleCard({ rule, choices, onEdit }: { rule: ListedRule; choices: Choices; onEdit: () => void }) {
    const queryClient = useQueryClient();
    const [deleting, setDeleting] = useState(false);
    const [showRuns, setShowRuns] = useState(false);
    const { when, then } = describe(rule, choices);
    const lastRun = rule.runs[0];

    const refresh = () => queryClient.invalidateQueries({ queryKey: ["automations"] });

    const toggle = useMutation({
        mutationFn: () => api.patch(`/automations/${rule.id}`, { enabled: !rule.enabled }),
        onSuccess: () => {
            toast.success(rule.enabled ? "Automation turned off" : "Automation turned on");
            refresh();
        },
        onError: (error) => toast.error(errorMessage(error)),
    });

    const remove = useMutation({
        mutationFn: () => api.delete(`/automations/${rule.id}`),
        onSuccess: () => {
            toast.success("Automation deleted");
            setDeleting(false);
            refresh();
        },
    });

    return (
        <section className={`rounded-xl border border-line bg-surface p-4 ${rule.enabled ? "" : "opacity-70"}`}>
            <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                    <p className="font-semibold">{rule.name}</p>
                    <p className="mt-1 text-muted">
                        <span className="text-ink">{when}</span> → {then}
                    </p>
                    <p className="mt-1 text-sm text-faint">
                        {rule._count.runs === 0
                            ? "Hasn't run yet"
                            : `Ran ${rule._count.runs} time${rule._count.runs === 1 ? "" : "s"} · last ${timeAgo(lastRun.createdAt)}${lastRun.status === "FAILED" ? " (failed)" : ""}`}
                    </p>
                </div>

                <Switch on={rule.enabled} label={`${rule.name} on`} disabled={toggle.isPending} onChange={() => toggle.mutate()} />
                <button type="button" aria-label={`Edit ${rule.name}`} onClick={onEdit} className="flex size-7 items-center justify-center rounded-lg text-muted hover:bg-fill hover:text-ink">
                    <IconPencil size={16} />
                </button>
                <button
                    type="button"
                    aria-label={`Delete ${rule.name}`}
                    onClick={() => setDeleting(true)}
                    className="flex size-7 items-center justify-center rounded-lg text-muted hover:bg-danger-soft hover:text-danger"
                >
                    <IconTrash size={16} />
                </button>
            </div>

            {rule._count.runs > 0 && (
                <button type="button" onClick={() => setShowRuns(!showRuns)} aria-expanded={showRuns} className="mt-2 flex h-7 items-center gap-1.5 rounded-lg text-sm font-medium text-muted hover:text-ink">
                    <IconChevronDown size={15} className={`transition-transform ${showRuns ? "rotate-180" : ""}`} />
                    What it did lately
                </button>
            )}
            {showRuns && <Runs ruleId={rule.id} />}

            <ConfirmDeleteModal
                open={deleting}
                title={`Delete "${rule.name}"?`}
                description="It stops running straight away. What it already did to leads stays."
                error={remove.isError ? errorMessage(remove.error) : undefined}
                pending={remove.isPending}
                onCancel={() => setDeleting(false)}
                onConfirm={() => remove.mutate()}
            />
        </section>
    );
}

const RUN_STATUS = {
    RUNNING: { label: "Running", className: "bg-[#fff7c2] text-[#9e6c00]" },
    DONE: { label: "Done", className: "bg-success-soft text-success" },
    FAILED: { label: "Failed", className: "bg-danger-soft text-danger" },
} as const;

// The rule's last runs: which lead, what it did, or why it stopped
function Runs({ ruleId }: { ruleId: number }) {
    const query = useQuery({
        queryKey: ["automations", ruleId, "runs"],
        queryFn: () => api.get<{ data: Run[] }>(`/automations/${ruleId}/runs`).then((res) => res.data.data),
    });

    if (query.isPending) return <SkeletonList rows={2} />;
    if (query.isError) return <ErrorState variant="inline" title="Couldn't load what it did" error={query.error} onRetry={() => query.refetch()} retrying={query.isFetching} />;

    return (
        <ul className="mt-1 overflow-hidden rounded-lg border border-line">
            {query.data.map((run) => (
                <li key={run.id} className="flex items-start gap-2.5 border-b border-line-light px-3 py-2 last:border-b-0">
                    <span className={`inline-flex h-5 shrink-0 items-center rounded-full px-2 text-sm font-medium ${RUN_STATUS[run.status].className}`}>
                        {RUN_STATUS[run.status].label}
                    </span>
                    <span className="min-w-0 flex-1">
                        {run.lead ? (
                            <Link href={`/leads?open=${run.lead.id}`} className="font-medium text-ink hover:underline">
                                {run.lead.name}
                            </Link>
                        ) : run.deal ? (
                            <Link href={`/deals?open=${run.deal.id}`} className="font-medium text-ink hover:underline">
                                {run.deal.title}
                            </Link>
                        ) : (
                            <span className="text-faint">Since deleted</span>
                        )}
                        <span className="block text-sm text-muted">{run.summary}</span>
                    </span>
                    <span className="shrink-0 text-sm text-faint">{timeAgo(run.createdAt)}</span>
                </li>
            ))}
        </ul>
    );
}

// An on/off switch
function Switch({ on, label, disabled, onChange }: { on: boolean; label: string; disabled?: boolean; onChange: () => void }) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={on}
            aria-label={label}
            disabled={disabled}
            onClick={onChange}
            className={`relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors disabled:opacity-60 ${on ? "bg-accent" : "bg-line-strong"}`}
        >
            <span className={`absolute top-0.5 left-0.5 size-4 rounded-full bg-white shadow-light transition-transform ${on ? "translate-x-4" : ""}`} />
        </button>
    );
}
