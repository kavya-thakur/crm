import { z } from "zod";
import { capitalizeFirst, ENTITY_TYPES, hasAnyField, requiredText } from "./common";

export const CUSTOM_FIELD_TYPES = ["TEXT", "NUMBER", "DATE", "SELECT", "BOOLEAN", "AGENT"] as const;
export type CustomFieldType = (typeof CUSTOM_FIELD_TYPES)[number];

export const createCustomFieldSchema = z
    .object({
        entity: z.enum(ENTITY_TYPES),
        // the stable name stored inside the JSON blob — not shown to users again once set
        key: z
            .string()
            .trim()
            .toLowerCase()
            .regex(/^[a-z][a-z0-9_]*$/, "Use lowercase letters, numbers and underscores, starting with a letter")
            .max(50),
        // shown as a column header and form label, so "collaborator" is saved as "Collaborator"
        label: requiredText(100).transform(capitalizeFirst),
        type: z.enum(CUSTOM_FIELD_TYPES),
        // SELECT only: the choices it offers
        options: z.array(requiredText(100)).max(50).optional(),
        // fields sharing a group cluster under one heading on forms; ungrouped fields fall under "Other"
        group: z.string().trim().max(50).optional(),
        required: z.boolean().default(false),
        showInFilter: z.boolean().default(false),
        showInList: z.boolean().default(false),
    })
    .refine((data) => data.type !== "SELECT" || (data.options && data.options.length > 0), {
        message: "A select field needs at least one option",
        path: ["options"],
    });

// Renaming the entity or key would orphan every value already stored under
// the old key, so only the display/behaviour bits can change after creation.
export const updateCustomFieldSchema = z
    .object({
        label: requiredText(100).transform(capitalizeFirst).optional(),
        // changing type doesn't convert values already saved under the old type
        type: z.enum(CUSTOM_FIELD_TYPES).optional(),
        options: z.array(requiredText(100)).max(50).optional(),
        group: z.string().trim().max(50).optional(),
        required: z.boolean().optional(),
        showInFilter: z.boolean().optional(),
        showInList: z.boolean().optional(),
    })
    .refine(hasAnyField, "Provide at least one field to update");

export const listCustomFieldsQuerySchema = z.object({
    entity: z.enum(ENTITY_TYPES),
});

export type CreateCustomFieldInput = z.infer<typeof createCustomFieldSchema>;
export type UpdateCustomFieldInput = z.infer<typeof updateCustomFieldSchema>;
