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

// The areas with a "View" permission that their other ones depend on (the roles grid's rows)
const VIEWABLE = ["lead", "deal", "contact", "user", "role"];

/**
 * What a permission needs to make sense: creating, editing or deleting leads, or seeing everyone's,
 * needs seeing leads at all (without lead:read the Leads page doesn't open, so there's nowhere to
 * create one). "lead:create" → "lead:read"; null when it needs nothing. Used by the roles screen
 * (ticking Create ticks View) and by the roles API (a saved role always has it).
 */
export function viewNeededFor(permissionName: string) {
    const [area, action] = permissionName.split(":");
    return VIEWABLE.includes(area) && ["create", "update", "delete", "all"].includes(action) ? `${area}:read` : null;
}
