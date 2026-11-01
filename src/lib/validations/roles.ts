import { z } from "zod";
import { dbIdSchema, hasAnyField, requiredText } from "./common";

// Duplicates removed so the same permission isn't inserted twice (composite PK would reject it)
const permissionIdsSchema = z
    .array(dbIdSchema)
    .max(500)
    .transform((ids) => [...new Set(ids)]);

export const createRoleSchema = z.object({
    name: requiredText(100),
    permissionIds: permissionIdsSchema.default([]),
});

// Not createRoleSchema.partial(): in Zod 4 the default([]) would still apply,
// so a PATCH with only a name would wipe the role's permissions
export const updateRoleSchema = z
    .object({
        name: requiredText(100).optional(),
        // replaces the role's whole permission set
        permissionIds: permissionIdsSchema.optional(),
    })
    .refine(hasAnyField, "Provide at least one field to update");
