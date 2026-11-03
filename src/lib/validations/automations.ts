import { z } from "zod";
import { dbIdSchema, requiredText } from "./common";

/*
 * The shape of an automation rule (Settings > Automations):
 *   WHEN  a trigger happens                        "lead.created"
 *   IF    every condition matches the lead          { field: "source", op: "is", value: "12" }
 *   THEN  run each action, in order                 { type: "assign", userIds: [4, 7] }
 * Saved as JSON on AutomationRule; the engine (src/lib/automations/engine.ts) reads it back
 * through these same schemas, so a rule saved in an older shape fails clearly instead of oddly.
 */

export const AUTOMATION_TRIGGERS = ["lead.created"] as const;

// What a condition can look at: the lead's source (id), where it came in (a web form or
// integration id, or "manual"), its ad campaign, its owner (id), or one of its custom fields
const conditionField = z.string().regex(/^(source|via|campaign|owner|cf:[a-z0-9_]+)$/, "Unknown field");

export const CONDITION_OPS = ["is", "isNot", "contains", "isEmpty", "isSet"] as const;

export const conditionSchema = z.object({
    field: conditionField,
    op: z.enum(CONDITION_OPS),
    // compared as text; isEmpty / isSet ignore it
    value: z.string().max(200).default(""),
});

export const actionSchema = z.discriminatedUnion("type", [
    // one person, or several taking turns
    z.object({ type: z.literal("assign"), userIds: z.array(dbIdSchema).min(1, "Pick at least one person").max(50) }),
    // a template, sent to the lead's email from its owner
    z.object({ type: z.literal("email"), templateId: dbIdSchema }),
    // a task for the lead's owner; the title can use the template placeholders ({{lead.firstName}})
    z.object({
        type: z.literal("task"),
        title: requiredText(200),
        dueInDays: z.int().min(0).max(60),
        priority: z.enum(["LOW", "MEDIUM", "HIGH"]),
    }),
]);

export const automationRuleSchema = z.object({
    name: requiredText(100),
    trigger: z.enum(AUTOMATION_TRIGGERS),
    conditions: z.array(conditionSchema).max(10),
    actions: z.array(actionSchema).min(1, "Add at least one action").max(10),
    enabled: z.boolean().default(true),
});

// Turning a rule on or off from the list, without sending the whole rule
export const toggleAutomationSchema = z.object({ enabled: z.boolean() });

export type AutomationCondition = z.infer<typeof conditionSchema>;
export type AutomationAction = z.infer<typeof actionSchema>;
export type AutomationRuleInput = z.infer<typeof automationRuleSchema>;
