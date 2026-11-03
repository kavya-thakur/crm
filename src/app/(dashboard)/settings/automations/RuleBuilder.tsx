"use client";

import { useState, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { IconChecklist, IconMail, IconPlus, IconUserCheck, IconX } from "@tabler/icons-react";

import { api, errorMessage } from "@/lib/api/client";
import { Spinner } from "@/components/Loader";
import { MultiSelect, Select } from "@/components/Select";
import { toast } from "@/components/Toast";
import { TEMPLATE_VARIABLES } from "@/lib/emails/templates";
import type { AutomationAction, AutomationCondition } from "@/lib/validations/automations";
import type { CustomFieldDef } from "../../shared/customFields";

/*
 * The side panel for making or editing an automation rule, in three blocks:
 *   When  a lead is created
 *   If    [field] [is / contains / ...] [value]      (all of them; none = every lead)
 *   Then  [assign] [send email] [create task]        (in order)
 */

export interface AutomationRule {
    id: number;
    name: string;
    trigger: "lead.created";
    conditions: AutomationCondition[];
    actions: AutomationAction[];
    enabled: boolean;
}

type Option = { value: string; label: string };

// Everything the builder offers to pick from, loaded once by the page
export interface Choices {
    sources: Option[];
    // web forms and integrations a lead can come in through
    forms: Option[];
    people: Option[];
    templates: Option[];
    customFields: CustomFieldDef[];
}

export const OP_LABELS: Record<AutomationCondition["op"], string> = {
    is: "is",
    isNot: "is not",
    contains: "contains",
    isEmpty: "is empty",
    isSet: "is filled in",
};

const PICK_OPS: AutomationCondition["op"][] = ["is", "isNot", "isEmpty", "isSet"];
const TEXT_OPS: AutomationCondition["op"][] = ["is", "isNot", "contains", "isEmpty", "isSet"];

// What a condition can look at, and how its value is chosen: from a list, or typed
interface Field {
    key: string;
    label: string;
    ops: AutomationCondition["op"][];
    values?: Option[];
}

export function conditionFields(choices: Choices): Field[] {
    return [
        { key: "source", label: "Source", ops: PICK_OPS, values: choices.sources },
        { key: "via", label: "Came in through", ops: ["is", "isNot"], values: [{ value: "manual", label: "Added by hand" }, ...choices.forms] },
        { key: "campaign", label: "Campaign", ops: TEXT_OPS },
        { key: "owner", label: "Owner", ops: PICK_OPS, values: choices.people },
        ...choices.customFields
            .filter((field) => field.type !== "AGENT")
            .map((field) => ({
                key: `cf:${field.key}`,
                label: field.label,
                ...(field.type === "SELECT"
                    ? { ops: PICK_OPS, values: (field.options ?? []).map((option) => ({ value: option, label: option })) }
                    : field.type === "BOOLEAN"
                      ? { ops: PICK_OPS, values: [{ value: "true", label: "Yes" }, { value: "false", label: "No" }] }
                      : { ops: TEXT_OPS }),
            })),
    ];
}

const ACTION_TYPES = [
    { type: "assign", label: "Assign the lead", icon: IconUserCheck },
    { type: "email", label: "Send an email", icon: IconMail },
    { type: "task", label: "Create a task", icon: IconChecklist },
] as const;

const NEW_ACTION: Record<AutomationAction["type"], AutomationAction> = {
    assign: { type: "assign", userIds: [] },
    email: { type: "email", templateId: 0 },
    task: { type: "task", title: "Call {{lead.firstName}}", dueInDays: 0, priority: "HIGH" },
};

const DUE_OPTIONS = [
    { value: "0", label: "Due today" },
    { value: "1", label: "Due tomorrow" },
    { value: "2", label: "Due in 2 days" },
    { value: "3", label: "Due in 3 days" },
    { value: "7", label: "Due in a week" },
];

const PRIORITY_OPTIONS = [
    { value: "HIGH", label: "High priority" },
    { value: "MEDIUM", label: "Medium priority" },
    { value: "LOW", label: "Low priority" },
];

const inputClassName =
    "h-8 w-full rounded-lg border border-line bg-surface px-2 outline-none placeholder:text-light focus:border-accent focus:ring-3 focus:ring-accent-soft";

// What's still missing before the rule can be saved, in words; null when it's ready
function problemWith(name: string, conditions: AutomationCondition[], actions: AutomationAction[]) {
    if (!name.trim()) return "Give the automation a name";
    if (conditions.some((condition) => !["isEmpty", "isSet"].includes(condition.op) && !condition.value.trim())) {
        return "Fill in every condition, or remove the empty one";
    }
    if (actions.length === 0) return "Add at least one thing to do";
    for (const action of actions) {
        if (action.type === "assign" && action.userIds.length === 0) return "Pick who gets the leads";
        if (action.type === "email" && !action.templateId) return "Pick an email template";
        if (action.type === "task" && !action.title.trim()) return "Give the task a title";
    }
    return null;
}

export function RuleBuilder({ rule, choices, onClose }: { rule: AutomationRule | null; choices: Choices; onClose: () => void }) {
    const queryClient = useQueryClient();
    const [name, setName] = useState(rule?.name ?? "");
    const [conditions, setConditions] = useState<AutomationCondition[]>(rule?.conditions ?? []);
    const [actions, setActions] = useState<AutomationAction[]>(rule?.actions ?? []);
    const [problem, setProblem] = useState<string | null>(null);
    const fields = conditionFields(choices);

    const save = useMutation({
        mutationFn: () => {
            const data = { name, trigger: "lead.created", conditions, actions, enabled: rule?.enabled ?? true };
            return rule ? api.put(`/automations/${rule.id}`, data) : api.post("/automations", data);
        },
        onSuccess: () => {
            toast.success(rule ? "Automation saved" : "Automation created");
            queryClient.invalidateQueries({ queryKey: ["automations"] });
            onClose();
        },
    });

    function submit() {
        const missing = problemWith(name, conditions, actions);
        setProblem(missing);
        if (!missing) save.mutate();
    }

    const updateCondition = (index: number, changes: Partial<AutomationCondition>) =>
        setConditions(conditions.map((condition, at) => (at === index ? { ...condition, ...changes } : condition)));
    const updateAction = (index: number, next: AutomationAction) => setActions(actions.map((action, at) => (at === index ? next : action)));

    return (
        <form
            noValidate
            className="flex min-h-full flex-col"
            onSubmit={(event) => {
                event.preventDefault();
                submit();
            }}
        >
            <header className="border-b border-line-light px-5 py-4">
                <h2 className="text-lg font-semibold">{rule ? "Edit automation" : "New automation"}</h2>
                <p className="text-sm text-faint">Runs by itself every time its conditions match</p>
            </header>

            <div className="flex-1 space-y-6 px-5 py-5">
                <label className="block">
                    <span className="mb-1 block text-sm font-medium text-muted">Name</span>
                    <input value={name} onChange={(event) => setName(event.target.value)} maxLength={100} placeholder="Google Ads leads to Priya" className={inputClassName} />
                </label>

                <Block title="When">
                    <p className="flex h-8 items-center rounded-lg bg-app px-2.5 text-ink">A new lead is added (by hand, a web form or an integration)</p>
                </Block>

                <Block title="If" hint={conditions.length === 0 ? "No conditions: it runs for every new lead." : "All of these have to match."}>
                    {conditions.map((condition, index) => {
                        const field = fields.find((item) => item.key === condition.field) ?? fields[0];
                        const needsValue = !["isEmpty", "isSet"].includes(condition.op);
                        return (
                            <div key={index} className="flex items-center gap-2">
                                <div className="grid min-w-0 flex-1 grid-cols-3 gap-2">
                                    <Select
                                        value={condition.field}
                                        // a new field starts from its first operator, with no value
                                        onChange={(key) => {
                                            const next = fields.find((item) => item.key === key);
                                            if (next) updateCondition(index, { field: next.key, op: next.ops[0], value: "" });
                                        }}
                                        options={fields.map((item) => ({ value: item.key, label: item.label }))}
                                        placeholder="Field"
                                    />
                                    <Select
                                        value={condition.op}
                                        onChange={(op) => op && updateCondition(index, { op: op as AutomationCondition["op"] })}
                                        options={field.ops.map((op) => ({ value: op, label: OP_LABELS[op] }))}
                                        placeholder="is"
                                    />
                                    {needsValue &&
                                        (field.values ? (
                                            <Select value={condition.value || undefined} onChange={(value) => updateCondition(index, { value: value ?? "" })} options={field.values} placeholder="Pick one" />
                                        ) : (
                                            <input value={condition.value} onChange={(event) => updateCondition(index, { value: event.target.value })} maxLength={200} placeholder="Value" className={inputClassName} />
                                        ))}
                                </div>
                                <RemoveButton label="Remove this condition" onClick={() => setConditions(conditions.filter((_, at) => at !== index))} />
                            </div>
                        );
                    })}
                    {conditions.length < 10 && (
                        <AddButton onClick={() => setConditions([...conditions, { field: "source", op: "is", value: "" }])}>Add a condition</AddButton>
                    )}
                </Block>

                <Block title="Then" hint="Done in this order.">
                    {actions.map((action, index) => {
                        const kind = ACTION_TYPES.find((item) => item.type === action.type)!;
                        return (
                            <div key={index} className="rounded-lg border border-line p-3">
                                <div className="mb-2 flex items-center gap-2">
                                    <kind.icon size={15} className="text-muted" />
                                    <span className="flex-1 font-medium">{kind.label}</span>
                                    <RemoveButton label="Remove this action" onClick={() => setActions(actions.filter((_, at) => at !== index))} />
                                </div>
                                <ActionFields action={action} choices={choices} onChange={(next) => updateAction(index, next)} />
                            </div>
                        );
                    })}
                    {/* buttons, not a menu: one click adds the action */}
                    {actions.length < 10 && (
                        <div className="flex flex-wrap gap-2">
                            {ACTION_TYPES.map((item) => (
                                <AddButton key={item.type} onClick={() => setActions([...actions, NEW_ACTION[item.type]])}>
                                    {item.label}
                                </AddButton>
                            ))}
                        </div>
                    )}
                </Block>

                {(problem || save.isError) && (
                    <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-danger">
                        {problem ?? errorMessage(save.error)}
                    </p>
                )}
            </div>

            <footer className="sticky bottom-0 flex justify-end gap-2 border-t border-line-light bg-surface px-5 py-3">
                <button type="button" onClick={onClose} className="h-8 rounded-lg border border-fill bg-black/2 px-3 font-medium text-muted hover:bg-app">
                    Cancel
                </button>
                <button
                    type="submit"
                    disabled={save.isPending}
                    className="flex h-8 items-center gap-1.5 rounded-lg bg-accent px-3 font-medium text-on-accent hover:bg-accent-hover disabled:opacity-60"
                >
                    {save.isPending && <Spinner size={14} />}
                    {rule ? "Save automation" : "Create automation"}
                </button>
            </footer>
        </form>
    );
}

// The settings each kind of action needs
function ActionFields({ action, choices, onChange }: { action: AutomationAction; choices: Choices; onChange: (next: AutomationAction) => void }) {
    if (action.type === "assign") {
        return (
            <>
                <MultiSelect
                    values={action.userIds.map(String)}
                    onChange={(values) => onChange({ ...action, userIds: values.map(Number) })}
                    options={choices.people}
                    placeholder="Pick people"
                />
                <p className="mt-1 text-sm text-faint">Pick several and they take turns, so everyone gets the same share.</p>
            </>
        );
    }

    if (action.type === "email") {
        return choices.templates.length > 0 ? (
            <>
                <Select
                    value={action.templateId ? String(action.templateId) : undefined}
                    onChange={(value) => onChange({ ...action, templateId: Number(value) || 0 })}
                    options={choices.templates}
                    placeholder="Pick a template"
                />
                <p className="mt-1 text-sm text-faint">Sent to the lead&apos;s email from its owner, so replies go to them. Skipped if the lead has no email.</p>
            </>
        ) : (
            <p className="text-sm text-faint">No email templates yet. Make one in Settings → Email templates first.</p>
        );
    }

    return (
        <div className="space-y-2">
            <input
                value={action.title}
                onChange={(event) => onChange({ ...action, title: event.target.value })}
                maxLength={200}
                placeholder="Call {{lead.firstName}}"
                aria-label="Task title"
                className={inputClassName}
            />
            <div className="grid grid-cols-2 gap-2">
                <Select value={String(action.dueInDays)} onChange={(value) => onChange({ ...action, dueInDays: Number(value) || 0 })} options={DUE_OPTIONS} placeholder="Due" />
                <Select
                    value={action.priority}
                    onChange={(value) => value && onChange({ ...action, priority: value as typeof action.priority })}
                    options={PRIORITY_OPTIONS}
                    placeholder="Priority"
                />
            </div>
            <p className="text-sm text-faint">
                For the lead&apos;s owner. The title can use {TEMPLATE_VARIABLES.slice(0, 3).map((variable) => `{{${variable.key}}}`).join(", ")}.
            </p>
        </div>
    );
}

function Block({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
    return (
        <section>
            <h3 className="mb-1 text-sm font-semibold tracking-wide text-faint uppercase">{title}</h3>
            {hint && <p className="mb-2 text-sm text-faint">{hint}</p>}
            <div className="space-y-2">{children}</div>
        </section>
    );
}

function AddButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
    return (
        <button type="button" onClick={onClick} className="flex h-8 items-center gap-1.5 rounded-lg border border-dashed border-line-strong px-2.5 font-medium text-muted hover:border-accent hover:text-accent">
            <IconPlus size={14} />
            {children}
        </button>
    );
}

function RemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
    return (
        <button type="button" aria-label={label} onClick={onClick} className="flex size-7 shrink-0 items-center justify-center rounded-lg text-faint hover:bg-fill hover:text-ink">
            <IconX size={14} />
        </button>
    );
}
