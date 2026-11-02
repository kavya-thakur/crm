import { z } from "zod";
import { dbIdSchema, hasAnyField, requiredText } from "./common";

export const createLeadFormSchema = z.object({
    name: requiredText(100),
});

// How a built-in field shows on the form. Name and phone are always asked (every lead and
// its contact need them), so only these three can change.
export const FIELD_MODES = ["required", "optional", "hidden"] as const;
export type FieldMode = (typeof FIELD_MODES)[number];

const blankToNull = (value: unknown) => (typeof value === "string" && value.trim() === "" ? null : value);

/**
 * What a web form asks and how its page reads. Saved as LeadForm.settings (JSON); every
 * value has a default, so a form saved before these existed (settings = {}) reads exactly
 * as it always worked: email required, company and message optional, nothing else.
 * Empty texts mean "use the default" (the form's name as the title, "Send" on the button...).
 */
export const leadFormSettingsSchema = z.object({
    title: z.string().trim().max(120).default(""),
    intro: z.string().trim().max(500).default(""),
    buttonLabel: z.string().trim().max(40).default(""),
    thankYou: z.string().trim().max(300).default(""),
    // where to send people after they've sent it; null = show the thank-you message
    redirectUrl: z
        .preprocess(blankToNull, z.string().trim().max(500).regex(/^https?:\/\/\S+$/, "Use a full web address, starting with https://").nullable())
        .default(null),
    email: z.enum(FIELD_MODES).default("required"),
    company: z.enum(FIELD_MODES).default("optional"),
    message: z.enum(FIELD_MODES).default("optional"),
    // lead custom fields it asks for, in order; answers are saved into those fields
    customFields: z
        .array(z.object({ key: z.string().max(50), required: z.boolean() }))
        .max(20)
        .default([]),
});

export type LeadFormSettings = z.infer<typeof leadFormSettingsSchema>;

// A form's saved settings with every default filled in (and anything unreadable ignored)
export function readFormSettings(saved: unknown): LeadFormSettings {
    const parsed = leadFormSettingsSchema.safeParse(saved ?? {});
    return parsed.success ? parsed.data : leadFormSettingsSchema.parse({});
}

// The texts a form shows when its own are left empty
export function formTexts(settings: LeadFormSettings, formName: string) {
    return {
        title: settings.title || formName,
        buttonLabel: settings.buttonLabel || "Send",
        thankYou: settings.thankYou || "Thanks, we'll be in touch soon.",
    };
}

// null source = new leads aren't tagged; null owner = they're left unassigned
export const updateLeadFormSchema = z
    .object({
        name: requiredText(100).optional(),
        sourceId: dbIdSchema.nullable().optional(),
        ownerId: dbIdSchema.nullable().optional(),
        // share leads in turn between these people; [] = no rotation, just the owner
        assigneeIds: z.array(dbIdSchema).max(50).optional(),
        // the form builder saves the whole set at once
        settings: leadFormSettingsSchema.optional(),
    })
    .refine(hasAnyField, "Provide at least one field to update");
