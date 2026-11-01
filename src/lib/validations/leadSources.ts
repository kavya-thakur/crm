import { z } from "zod";
import { hasAnyField, requiredText } from "./common";

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
