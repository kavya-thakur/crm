import { z } from "zod";
import { dbIdSchema, requiredText } from "./common";

/*
 * The shape of an automation rule (Settings > Automations):
 *   WHEN  a trigger happens                        "deal.won"
 *   IF    every condition matches the record        { field: "amount", op: "gt", value: "100000" }
 *   THEN  run each action, in order                 { type: "notify", userIds: [4], toOwner: true, ... }
 * Saved as JSON on AutomationRule; the engine (src/lib/automations/engine.ts) reads it back
 * through these same schemas, so a rule saved in an older shape fails clearly instead of oddly.
 */

export const AUTOMATION_TRIGGERS = ["lead.created", "lead.stageChanged", "lead.lost", "deal.created", "deal.stageChanged", "deal.won", "deal.lost"] as const;
export type AutomationTrigger = (typeof AUTOMATION_TRIGGERS)[number];

// Which kind of record a trigger is about: "deal.won" → "deal"
export type RecordKind = "lead" | "deal";
export const kindOf = (trigger: AutomationTrigger): RecordKind => (trigger.startsWith("deal.") ? "deal" : "lead");

// What a condition can look at: the source (id), where a new lead came in (a web form or
// integration id, or "manual"), the ad campaign, the owner (id), the stage (id), the deal's
// pipeline (id) and amount, the lost reason, or one of the record's custom fields
const conditionField = z.string().regex(/^(source|via|campaign|owner|stage|pipeline|amount|lostReason|cf:[a-z0-9_]+)$/, "Unknown field");

// The fields only one kind of record has; the rest fit both
const LEAD_ONLY = ["via", "campaign"];
const DEAL_ONLY = ["amount", "pipeline"];

export function fieldFits(field: string, trigger: AutomationTrigger) {
    // where it came in only means something for a lead that just came in
    if (field === "via") return trigger === "lead.created";
    return kindOf(trigger) === "lead" ? !DEAL_ONLY.includes(field) : !LEAD_ONLY.includes(field);
}

// gt / lt compare numbers (an amount, a number field); the rest compare text
export const CONDITION_OPS = ["is", "isNot", "contains", "gt", "lt", "isEmpty", "isSet"] as const;

export const conditionSchema = z.object({
    field: conditionField,
    op: z.enum(CONDITION_OPS),
    // compared as text; isEmpty / isSet ignore it
    value: z.string().max(200).default(""),
});

export const actionSchema = z.discriminatedUnion("type", [
    // one person, or several taking turns
    z.object({ type: z.literal("assign"), userIds: z.array(dbIdSchema).min(1, "Pick at least one person").max(50) }),
    // a template, sent to the lead's email (a deal's: its lead's) from the owner
    z.object({ type: z.literal("email"), templateId: dbIdSchema }),
    // a task for the owner; the title can use the template placeholders ({{lead.firstName}})
    z.object({
        type: z.literal("task"),
        title: requiredText(200),
        dueInDays: z.int().min(0).max(60),
        priority: z.enum(["LOW", "MEDIUM", "HIGH"]),
    }),
    // a bell notification for some people and/or the record's owner; the message can use placeholders
    z.object({
        type: z.literal("notify"),
        userIds: z.array(dbIdSchema).max(50),
        toOwner: z.boolean(),
        message: requiredText(200),
    }),
    // into another stage (a lead stage or a pipeline stage, by the trigger's kind)
    z.object({ type: z.literal("move"), stageId: dbIdSchema }),
]);

export const automationRuleSchema = z
    .object({
        name: requiredText(100),
        trigger: z.enum(AUTOMATION_TRIGGERS),
        conditions: z.array(conditionSchema).max(10),
        actions: z.array(actionSchema).min(1, "Add at least one action").max(10),
        enabled: z.boolean().default(true),
    })
    .superRefine((rule, ctx) => {
        rule.conditions.forEach((condition, index) => {
            if (!fieldFits(condition.field, rule.trigger)) {
                ctx.addIssue({ code: "custom", path: ["conditions", index, "field"], message: "That field doesn't fit this trigger" });
            }
        });
        rule.actions.forEach((action, index) => {
            if (action.type === "notify" && !action.toOwner && action.userIds.length === 0) {
                ctx.addIssue({ code: "custom", path: ["actions", index], message: "Pick who to notify" });
            }
        });
    });

// Turning a rule on or off from the list, without sending the whole rule
export const toggleAutomationSchema = z.object({ enabled: z.boolean() });

export type AutomationCondition = z.infer<typeof conditionSchema>;
export type AutomationAction = z.infer<typeof actionSchema>;
export type AutomationRuleInput = z.infer<typeof automationRuleSchema>;
