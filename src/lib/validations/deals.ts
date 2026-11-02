import { z } from "zod";
import { capitalizeFirst, hasAnyField, optionalText, idParamSchema, paginationSchema, idListParamSchema, personParamSchema } from "./common";

export const listDealsQuerySchema = paginationSchema.extend({
    search: z.string().trim().max(100).optional(),
    pipelineStageId: idParamSchema.optional(),
    // several stages at once ("1,4"), from the filter; pipelineStageId is one board column
    pipelineStageIds: idListParamSchema.optional(),
    // who created it / who changed it last: "me" or a user's id
    createdBy: personParamSchema.optional(),
    updatedBy: personParamSchema.optional(),
    // when it was last changed, a day each
    updatedFrom: z.iso.date().optional(),
    updatedTo: z.iso.date().optional(),
    assignedTo: z
        .union([z.literal("me"), z.literal("unassigned"), idParamSchema])
        .optional(),
    createdFrom: z.iso.date().optional(),
    createdTo: z.iso.date().optional(),
    // a JSON-encoded { [customFieldKey]: value } object — parsed in the route,
    // since what counts as valid depends on this org's field definitions
    customFields: z.string().optional(),
    sortBy: z
        .enum(["createdAt", "updatedAt", "title", "amount", "expectedCloseDate"])
        .default("createdAt"),
    sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

// A deal's fields, with no defaults: the update schema below is built from these, and in
// Zod 4 a default still applies inside .partial(), so a rename would reset the amount to 0
const dealFields = z.object({
    title: z.string().trim().min(1, "Deal title is required").max(200).transform(capitalizeFirst),

    amount: z.coerce.number().finite().min(0),

    probability: z.number().int().min(0).max(100),

    leadId: z.number().int().positive().nullable().optional(),

    assignedToId: z.number().int().positive().nullable().optional(),

    pipelineStageId: z.number().int().positive(),

    expectedCloseDate: z.iso.datetime().nullable().optional(),

    description: z.string().trim().max(5000).nullable().optional(),

    // why it was lost, when it's in a lost stage ("Price too high"); cleared when it leaves one
    lostReason: optionalText(200),

    // keyed by CustomFieldDefinition.key; checked against the org's actual
    // definitions in the route, not here (this schema doesn't know them)
    customFields: z.record(z.string(), z.unknown()).optional(),
});

// A new deal without an amount or probability starts at 0
export const createDealSchema = dealFields.extend({
    amount: dealFields.shape.amount.default(0),
    probability: dealFields.shape.probability.default(0),
});

export type CreateDealInput = z.infer<typeof createDealSchema>;

// Assignment is excluded: it goes through /assign, which checks the agent and logs a timeline entry
export const updateDealSchema = dealFields
    .omit({ assignedToId: true })
    .partial()
    .refine(hasAnyField, "Provide at least one field to update");

// What bulk edit can set on many deals at once (the title and lead are each deal's own)
export const bulkDealChangesSchema = dealFields
    .pick({ amount: true, probability: true, expectedCloseDate: true, customFields: true })
    .partial()
    .refine(hasAnyField, "Pick a field to change");

export type UpdateDealInput = z.infer<typeof updateDealSchema>;
// The fields that can differ between two copies of a deal, where merging asks which to keep
export const MERGE_DEAL_FIELDS = ["title", "amount", "probability", "pipelineStageId", "expectedCloseDate", "leadId", "assignedToId", "description"] as const;

export const mergeDealsSchema = z.object({
    duplicateId: z.number().int().positive(),
    // where to take the duplicate's value instead; every other field keeps this deal's
    // (or the duplicate's, where this deal's is empty)
    fromDuplicate: z.array(z.enum(MERGE_DEAL_FIELDS)).max(MERGE_DEAL_FIELDS.length).default([]),
});
