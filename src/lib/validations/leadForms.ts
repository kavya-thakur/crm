import { z } from "zod";
import { dbIdSchema, hasAnyField, requiredText } from "./common";

export const createLeadFormSchema = z.object({
    name: requiredText(100),
});

// null source = new leads aren't tagged; null owner = they're left unassigned
export const updateLeadFormSchema = z
    .object({
        name: requiredText(100).optional(),
        sourceId: dbIdSchema.nullable().optional(),
        ownerId: dbIdSchema.nullable().optional(),
    })
    .refine(hasAnyField, "Provide at least one field to update");
