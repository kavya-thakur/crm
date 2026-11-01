import { z } from "zod";
import { capitalizeFirst, hasAnyField, idParamSchema, paginationSchema } from "./common";

export const listDealsQuerySchema = paginationSchema.extend({
    search: z.string().trim().max(100).optional(),
    pipelineStageId: idParamSchema.optional(),
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

export const createDealSchema = z.object({
    title: z.string().trim().min(1, "Deal title is required").max(200).transform(capitalizeFirst),

    amount: z.coerce.number().finite().min(0).default(0),

    probability: z.number().int().min(0).max(100).default(0),

    leadId: z.number().int().positive().nullable().optional(),

    assignedToId: z.number().int().positive().nullable().optional(),

    pipelineStageId: z.number().int().positive(),

    expectedCloseDate: z.iso.datetime().nullable().optional(),

    description: z.string().trim().max(5000).nullable().optional(),

    // keyed by CustomFieldDefinition.key; checked against the org's actual
    // definitions in the route, not here (this schema doesn't know them)
    customFields: z.record(z.string(), z.unknown()).optional(),
});


export type CreateDealInput = z.infer<typeof createDealSchema>;

// Assignment is excluded: it goes through /assign, which checks the agent and logs a timeline entry
export const updateDealSchema = createDealSchema
    .omit({ assignedToId: true })
    .partial()
    .refine(hasAnyField, "Provide at least one field to update");

export type UpdateDealInput = z.infer<typeof updateDealSchema>;