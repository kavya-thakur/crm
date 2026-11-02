import { z } from "zod";
import { capitalizeFirst, capitalizeIfPresent, dbIdSchema, hasAnyField, idParamSchema, optionalEmail, requiredPhone, optionalText, paginationSchema, requiredText, idListParamSchema, personParamSchema } from "./common";

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
    // why it was lost, when it's in a lost stage ("Price too high"); cleared when it leaves one
    lostReason: optionalText(200),
    // keyed by CustomFieldDefinition.key; checked against the org's actual
    // definitions in the route, not here (this schema doesn't know them)
    customFields: z.record(z.string(), z.unknown()).optional(),
});

// Assignment is excluded: it goes through /assign, which checks the agent and logs a timeline entry
export const updateLeadSchema = createLeadSchema
    .omit({ assignedToId: true })
    .partial()
    .refine(hasAnyField, "Provide at least one field to update");

// What bulk edit can set on many leads at once (name, email and phone are each lead's own)
export const bulkLeadChangesSchema = createLeadSchema
    .pick({ companyName: true, sourceId: true, customFields: true })
    .partial()
    .refine(hasAnyField, "Pick a field to change");

export const listLeadsQuerySchema = paginationSchema.extend({
    search: z.string().trim().max(100).optional(),
    stageId: idParamSchema.optional(),
    // several stages at once ("1,4"), from the filter; stageId is one board column
    stageIds: idListParamSchema.optional(),
    // who created it / who changed it last: "me" or a user's id
    createdBy: personParamSchema.optional(),
    updatedBy: personParamSchema.optional(),
    // when it was last changed, a day each
    updatedFrom: z.iso.date().optional(),
    updatedTo: z.iso.date().optional(),
    // only open leads that share a phone or email with another open lead
    duplicates: z.stringbool().optional(),
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
    // "csv": the whole filtered list as a download; "ids": just the ids of every match,
    // for "select all" bulk actions
    format: z.enum(["csv", "ids"]).optional(),
});

// The fields that can differ between two copies of a lead, where merging asks which to keep
export const MERGE_FIELDS = ["name", "email", "phone", "companyName", "sourceId", "stageId", "assignedToId"] as const;
export type MergeField = (typeof MERGE_FIELDS)[number];

export const mergeLeadsSchema = z.object({
    duplicateId: dbIdSchema,
    // where to take the duplicate's value instead; every other field keeps this lead's
    // (or the duplicate's, where this lead's is empty)
    fromDuplicate: z.array(z.enum(MERGE_FIELDS)).max(MERGE_FIELDS.length).default([]),
});
