"use client";

import { useState, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { IconArrowRight, IconBell, IconChecklist, IconMail, IconPlus, IconUserCheck, IconX } from "@tabler/icons-react";

import { api, errorMessage } from "@/lib/api/client";
import { Spinner } from "@/components/Loader";
import { MultiSelect, Select } from "@/components/Select";
import { toast } from "@/components/Toast";
import { fieldFits, kindOf, type AutomationAction, type AutomationCondition, type AutomationTrigger, type RecordKind } from "@/lib/validations/automations";
import type { CustomFieldDef } from "../../shared/customFields";

/*
 * The side panel for making or editing an automation rule, in three blocks:
 *   When  a lead is added / a deal is won / ...
 *   If    [field] [is / contains / is more than ...] [value]     (all of them; none = every time)
 *   Then  [assign] [send email] [create task] [notify] [move]     (in order)
 */

export interface AutomationRule {
    id: number;
    name: string;
    trigger: AutomationTrigger;
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
    leadStages: (Option & { isConverted: boolean })[];
    pipelineStages: Option[];
    customFields: Record<RecordKind, CustomFieldDef[]>;
}

export const TRIGGER_LABELS: Record<AutomationTrigger, string> = {
    "lead.created": "A new lead is added",
    "lead.stageChanged": "A lead moves to a stage",
    "lead.lost": "A lead is lost",
    "deal.created": "A new deal is created",
    "deal.stageChanged": "A deal moves to a stage",
    "deal.won": "A deal is won",
    "deal.lost": "A deal is lost",
};

const TRIGGER_HINTS: Record<AutomationTrigger, string> = {
    "lead.created": "Added by hand, through a web form or from an integration.",
    "lead.stageChanged": "However it moves: dragged on the board, edited, or moved in bulk. Pick the stage below.",
    "lead.lost": "When it moves to a lost stage. Its lost reason can be a condition.",
    "deal.created": "Made by hand, or by converting a lead.",
    "deal.stageChanged": "However it moves: dragged on the board, edited, or moved in bulk. Pick the stage below.",
    "deal.won": "When it moves to a won stage.",
    "deal.lost": "When it moves to a lost stage. Its lost reason can be a condition.",
};

export const OP_LABELS: Record<AutomationCondition["op"], string> = {
    is: "is",
    isNot: "is not",
    contains: "contains",
    gt: "is more than",
    lt: "is less than",
    isEmpty: "is empty",
    isSet: "is filled in",
};

const PICK_OPS: AutomationCondition["op"][] = ["is", "isNot", "isEmpty", "isSet"];
const TEXT_OPS: AutomationCondition["op"][] = ["is", "isNot", "contains", "isEmpty", "isSet"];
const NUMBER_OPS: AutomationCondition["op"][] = ["gt", "lt", "is", "isNot", "isEmpty", "isSet"];

// What a condition can look at, and how its value is chosen: from a list, or typed
interface Field {
    key: string;
    label: string;
    ops: AutomationCondition["op"][];
    values?: Option[];
}

export function conditionFields(choices: Choices, trigger: AutomationTrigger): Field[] {
    const kind = kindOf(trigger);
    const fields: Field[] = [
        { key: "stage", label: "Stage", ops: PICK_OPS, values: kind === "lead" ? choices.leadStages : choices.pipelineStages },
        { key: "source", label: kind === "lead" ? "Source" : "Source (of its lead)", ops: PICK_OPS, values: choices.sources },
        { key: "via", label: "Came in through", ops: ["is", "isNot"], values: [{ value: "manual", label: "Added by hand" }, ...choices.forms] },
        { key: "campaign", label: "Campaign", ops: TEXT_OPS },
        { key: "amount", label: "Amount", ops: NUMBER_OPS },
        { key: "owner", label: "Owner", ops: PICK_OPS, values: choices.people },
        { key: "lostReason", label: "Lost reason", ops: TEXT_OPS },
        ...choices.customFields[kind]
            .filter((field) => field.type !== "AGENT")
            .map((field) => ({
                key: `cf:${field.key}`,
                label: field.label,
                ...(field.type === "SELECT"
                    ? { ops: PICK_OPS, values: (field.options ?? []).map((option) => ({ value: option, label: option })) }
                    : field.type === "BOOLEAN"
                      ? { ops: PICK_OPS, values: [{ value: "true", label: "Yes" }, { value: "false", label: "No" }] }
                      : { ops: field.type === "NUMBER" ? NUMBER_OPS : TEXT_OPS }),
            })),
    ];
    return fields.filter((field) => fieldFits(field.key, trigger));
}

const ACTION_TYPES = [
    { type: "assign", label: "Assign it", icon: IconUserCheck },
    { type: "email", label: "Send an email", icon: IconMail },
    { type: "task", label: "Create a task", icon: IconChecklist },
    { type: "notify", label: "Notify people", icon: IconBell },
    { type: "move", label: "Move to a stage", icon: IconArrowRight },
] as const;

function newAction(type: AutomationAction["type"], kind: RecordKind): AutomationAction {
    switch (type) {
        case "assign":
            return { type, userIds: [] };
        case "email":
            return { type, templateId: 0 };
        case "task":
            return { type, title: kind === "lead" ? "Call {{lead.firstName}}" : "Follow up on {{deal.title}}", dueInDays: 0, priority: "HIGH" };
        case "notify":
            return { type, userIds: [], toOwner: true, message: kind === "lead" ? "New lead: {{lead.name}}" : "{{deal.title}} ({{deal.amount}})" };
        case "move":
            return { type, stageId: 0 };
    }
}

const DUE_OPTIONS = [
    { value: "0", label: "Due today" },
    { value: "1", label: "Due tomorrow" },
    { value: "2", label: "Due in 2 days" },
    { value: "3", label: "Due in 3 days" },
    { value: "7", label: "Due in a week" },
    { value: "14", label: "Due in 2 weeks" },
    { value: "30", label: "Due in a month" },
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
        if (action.type === "assign" && action.userIds.length === 0) return "Pick who gets it";
        if (action.type === "email" && !action.templateId) return "Pick an email template";
        if (action.type === "task" && !action.title.trim()) return "Give the task a title";
        if (action.type === "notify" && !action.toOwner && action.userIds.length === 0) return "Pick who to notify";
        if (action.type === "notify" && !action.message.trim()) return "Write the notification's message";
        if (action.type === "move" && !action.stageId) return "Pick the stage to move it to";
    }
    return null;
}

export function RuleBuilder({ rule, choices, onClose }: { rule: AutomationRule | null; choices: Choices; onClose: () => void }) {
    const queryClient = useQueryClient();
    const [name, setName] = useState(rule?.name ?? "");
    const [trigger, setTrigger] = useState<AutomationTrigger>(rule?.trigger ?? "lead.created");
    const [conditions, setConditions] = useState<AutomationCondition[]>(rule?.conditions ?? []);
    const [actions, setActions] = useState<AutomationAction[]>(rule?.actions ?? []);
    const [problem, setProblem] = useState<string | null>(null);
    const kind = kindOf(trigger);
    const fields = conditionFields(choices, trigger);

    const save = useMutation({
        mutationFn: () => {
            const data = { name, trigger, conditions, actions, enabled: rule?.enabled ?? true };
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

    // A new trigger keeps what still fits it: conditions on fields it has, and every action but a
    // move between lead and deal (their stages differ). "Moves to a stage" starts with the stage to pick.
    function changeTrigger(next: AutomationTrigger) {
        const kept = conditions.filter((condition) => fieldFits(condition.field, next) && (kindOf(next) === kind || condition.field !== "stage"));
        const wantsStage = next.endsWith(".stageChanged") && !kept.some((condition) => condition.field === "stage");
        setTrigger(next);
        setConditions(wantsStage ? [{ field: "stage", op: "is", value: "" }, ...kept] : kept);
        if (kindOf(next) !== kind) setActions(actions.filter((action) => action.type !== "move"));
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
                    <input value={name} onChange={(event) => setName(event.target.value)} maxLength={100} placeholder="Big deals won: tell the founder" className={inputClassName} />
                </label>

                <Block title="When" hint={TRIGGER_HINTS[trigger]}>
                    <Select
                        value={trigger}
                        onChange={(value) => value && changeTrigger(value as AutomationTrigger)}
                        options={Object.entries(TRIGGER_LABELS).map(([value, label]) => ({ value, label }))}
                        placeholder="Pick a trigger"
                    />
                </Block>

                <Block title="If" hint={conditions.length === 0 ? `No conditions: it runs every time.` : "All of these have to match."}>
                    {conditions.map((condition, index) => {
                        const field = fields.find((item) => item.key === condition.field) ?? fields[0];
                        const needsValue = !["isEmpty", "isSet"].includes(condition.op);
                        const isNumber = condition.op === "gt" || condition.op === "lt";
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
                                            <input
                                                value={condition.value}
                                                onChange={(event) => updateCondition(index, { value: event.target.value })}
                                                maxLength={200}
                                                inputMode={isNumber ? "decimal" : undefined}
                                                placeholder={isNumber ? "100000" : "Value"}
                                                aria-label="Value"
                                                className={inputClassName}
                                            />
                                        ))}
                                </div>
                                <RemoveButton label="Remove this condition" onClick={() => setConditions(conditions.filter((_, at) => at !== index))} />
                            </div>
                        );
                    })}
                    {conditions.length < 10 && (
                        <AddButton onClick={() => setConditions([...conditions, { field: fields[0].key, op: fields[0].ops[0], value: "" }])}>Add a condition</AddButton>
                    )}
                </Block>

                <Block title="Then" hint="Done in this order.">
                    {actions.map((action, index) => {
                        const type = ACTION_TYPES.find((item) => item.type === action.type)!;
                        return (
                            <div key={index} className="rounded-lg border border-line p-3">
                                <div className="mb-2 flex items-center gap-2">
                                    <type.icon size={15} className="text-muted" />
                                    <span className="flex-1 font-medium">{type.type === "assign" ? `Assign the ${kind}` : type.label}</span>
                                    <RemoveButton label="Remove this action" onClick={() => setActions(actions.filter((_, at) => at !== index))} />
                                </div>
                                <ActionFields action={action} kind={kind} choices={choices} onChange={(next) => updateAction(index, next)} />
                            </div>
                        );
                    })}
                    {/* buttons, not a menu: one click adds the action */}
                    {actions.length < 10 && (
                        <div className="flex flex-wrap gap-2">
                            {ACTION_TYPES.map((item) => (
                                <AddButton key={item.type} onClick={() => setActions([...actions, newAction(item.type, kind)])}>
                                    {item.type === "assign" ? `Assign the ${kind}` : item.label}
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

// The placeholders a task title or notification can use, for this kind of record
const placeholders = (kind: RecordKind) => (kind === "lead" ? "{{lead.firstName}}, {{lead.name}}, {{lead.company}}" : "{{deal.title}}, {{deal.amount}}, {{lead.name}}");

// The settings each kind of action needs
function ActionFields({ action, kind, choices, onChange }: { action: AutomationAction; kind: RecordKind; choices: Choices; onChange: (next: AutomationAction) => void }) {
    switch (action.type) {
        case "assign":
            return (
                <>
                    <MultiSelect
                        values={action.userIds.map(String)}
                        onChange={(values) => onChange({ ...action, userIds: values.map(Number) })}
                        options={choices.people}
                        placeholder="Pick people"
                    />
                    <p className="mt-1 text-sm text-faint">Pick several and they take turns, so everyone gets the same share. Its open tasks go with it.</p>
                </>
            );

        case "email":
            return choices.templates.length > 0 ? (
                <>
                    <Select
                        value={action.templateId ? String(action.templateId) : undefined}
                        onChange={(value) => onChange({ ...action, templateId: Number(value) || 0 })}
                        options={choices.templates}
                        placeholder="Pick a template"
                    />
                    <p className="mt-1 text-sm text-faint">
                        Sent to {kind === "lead" ? "the lead's email" : "the email of the lead the deal came from"}, from its owner, so replies go to them. Skipped if
                        there&apos;s no email.
                    </p>
                </>
            ) : (
                <p className="text-sm text-faint">No email templates yet. Make one in Settings → Email templates first.</p>
            );

        case "task":
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
                    <p className="text-sm text-faint">For the {kind}&apos;s owner. The title can use {placeholders(kind)}.</p>
                </div>
            );

        case "notify":
            return (
                <div className="space-y-2">
                    <MultiSelect
                        values={action.userIds.map(String)}
                        onChange={(values) => onChange({ ...action, userIds: values.map(Number) })}
                        options={choices.people}
                        placeholder="Pick people"
                    />
                    <label className="flex items-center gap-2 text-muted">
                        <input type="checkbox" checked={action.toOwner} onChange={(event) => onChange({ ...action, toOwner: event.target.checked })} className="size-4 accent-accent" />
                        And the {kind}&apos;s owner
                    </label>
                    <input
                        value={action.message}
                        onChange={(event) => onChange({ ...action, message: event.target.value })}
                        maxLength={200}
                        placeholder="Big deal won: {{deal.title}}"
                        aria-label="Notification message"
                        className={inputClassName}
                    />
                    <p className="text-sm text-faint">In their bell, and a pop-up if they&apos;re online. The message can use {placeholders(kind)}.</p>
                </div>
            );

        case "move": {
            // a lead reaches a converted stage by being converted to a deal, not by a move
            const stages = kind === "lead" ? choices.leadStages.filter((stage) => !stage.isConverted) : choices.pipelineStages;
            return (
                <>
                    <Select value={action.stageId ? String(action.stageId) : undefined} onChange={(value) => onChange({ ...action, stageId: Number(value) || 0 })} options={stages} placeholder="Pick a stage" />
                    <p className="mt-1 text-sm text-faint">This move doesn&apos;t set off other &quot;moves to a stage&quot; automations, so rules can never loop.</p>
                </>
            );
        }
    }
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
