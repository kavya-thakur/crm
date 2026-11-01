import { z } from "zod";
import { dbIdSchema, emailSchema, hasAnyField, requiredText } from "./common";

export const createAgentSchema = z.object({
    name: requiredText(200),
    email: emailSchema,
    password: z.string().min(8, "Password must be at least 8 characters"),
    roleId: dbIdSchema,
});

export const updateAgentSchema = z
    .object({
        name: requiredText(200).optional(),
        email: emailSchema.optional(),
        roleId: dbIdSchema.optional(),
    })
    .refine(hasAnyField, "Provide at least one field to update");
