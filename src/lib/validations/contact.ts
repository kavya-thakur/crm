import { z } from "zod";
import {
    capitalizeFirst,
    capitalizeIfPresent,
    dbIdSchema,
    hasAnyField,
    idParamSchema,
    optionalEmail,
    requiredPhone,
    optionalText,
    paginationSchema,
    requiredText,
} from "./common";

export const createContactSchema = z.object({
    name: requiredText(200).transform(capitalizeFirst),
    email: optionalEmail,
    phone: requiredPhone,
    jobTitle: optionalText(150).transform(capitalizeIfPresent),
    description: optionalText(5000),
    companyId: dbIdSchema.nullable().optional(),
    // omitted = assign to the creator, null = create unassigned
    assignedToId: dbIdSchema.nullable().optional(),
    // keyed by CustomFieldDefinition.key; checked against the org's actual
    // definitions in the route, not here (this schema doesn't know them)
    customFields: z.record(z.string(), z.unknown()).optional(),
});

// Assignment is excluded: it goes through /assign, which checks the agent
export const updateContactSchema = createContactSchema
    .omit({ assignedToId: true })
    .partial()
    .refine(hasAnyField, "Provide at least one field to update");

export const listContactsQuerySchema = paginationSchema.extend({
    search: z.string().trim().max(100).optional(),
    companyId: idParamSchema.optional(),
    assignedTo: z
        .union([z.literal("me"), z.literal("unassigned"), idParamSchema])
        .optional(),
    createdFrom: z.iso.date().optional(),
    createdTo: z.iso.date().optional(),
    // a JSON-encoded { [customFieldKey]: value } object — parsed in the route,
    // since what counts as valid depends on this org's field definitions
    customFields: z.string().optional(),
    sortBy: z
        .enum(["name", "email", "createdAt", "updatedAt"])
        .default("createdAt"),
    sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export type CreateContactInput = z.infer<typeof createContactSchema>;
export type UpdateContactInput = z.infer<typeof updateContactSchema>;
export type ListContactsQuery = z.infer<typeof listContactsQuerySchema>;