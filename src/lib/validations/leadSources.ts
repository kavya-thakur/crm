import { z } from "zod";
import { dbIdSchema, hasAnyField, requiredText } from "./common";

// "#3a5bc7" — the same format the stage/source colours are stored in
const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Color must be a hex code like #3a5bc7");

export const createLeadSourceSchema = z.object({
    name: requiredText(50),
    color: hexColor.optional(),
});

export const updateLeadSourceSchema = z
    .object({
        name: requiredText(50).optional(),
        color: hexColor.optional(),
    })
    .refine(hasAnyField, "Provide at least one field to update");

// The settings page saves the whole list at once, in order. An option without an id is new.
export const saveLeadSourcesSchema = z.object({
    options: z
        .array(
            z.object({
                id: dbIdSchema.optional(),
                name: requiredText(50),
                color: hexColor,
            }),
        )
        .max(50, "That's too many sources"),
});
