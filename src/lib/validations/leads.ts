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

export const createLeadSchema = z.object({
    name: requiredText(200).transform(capitalizeFirst),
    email: optionalEmail,
    phone: requiredPhone,
    companyName: optionalText(200).transform(capitalizeIfPresent),
    // picked from the org's managed list, not typed
    sourceId: dbIdSchema.nullable().optional(),
    stageId: dbIdSchema,
    // omitted = assign to the creator, null = create unassigned
    assignedToId: dbIdSchema.nullable().optional(),
    // picks an existing contact instead of creating one from name/email/phone
    contactId: dbIdSchema.optional(),
    // keyed by CustomFieldDefinition.key; checked against the org's actual
    // definitions in the route, not here (this schema doesn't know them)
    customFields: z.record(z.string(), z.unknown()).optional(),
});

// Assignment is excluded: it goes through /assign, which checks the agent and logs a timeline entry
export const updateLeadSchema = createLeadSchema
    .omit({ assignedToId: true })
    .partial()
    .refine(hasAnyField, "Provide at least one field to update");

export const listLeadsQuerySchema = paginationSchema.extend({
    search: z.string().trim().max(100).optional(),
    stageId: idParamSchema.optional(),
    sourceId: idParamSchema.optional(),
    assignedTo: z
        .union([z.literal("me"), z.literal("unassigned"), idParamSchema])
        .optional(),
    createdFrom: z.iso.date().optional(),
    createdTo: z.iso.date().optional(),
    // a JSON-encoded { [customFieldKey]: value } object — parsed in the route,
    // since what counts as valid depends on this org's field definitions
    customFields: z.string().optional(),
    sortBy: z
        .enum(["createdAt", "updatedAt", "name"])
        .default("createdAt"),
    sortOrder: z.enum(["asc", "desc"]).default("desc"),
});
