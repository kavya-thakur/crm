import { z } from "zod";
import { dbIdSchema, hasAnyField, requiredText } from "./common";

// "#3a5bc7" — the same format the stage colours are stored in
const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Color must be a hex code like #3a5bc7");

export const createLeadStageSchema = z
    .object({
        name: requiredText(50),
        color: hexColor.optional(),
        isConverted: z.boolean().default(false),
        isLost: z.boolean().default(false),
    })
    // a lead in this stage is either converted or lost, never both
    .refine((stage) => !(stage.isConverted && stage.isLost), {
        message: "A stage can't be both converted and lost",
        path: ["isLost"],
    });

export const updateLeadStageSchema = z
    .object({
        name: requiredText(50).optional(),
        color: hexColor.optional(),
        isConverted: z.boolean().optional(),
        isLost: z.boolean().optional(),
    })
    .refine(hasAnyField, "Provide at least one field to update");

// The settings page saves the whole list at once, in order. An option without an id is new.
export const saveLeadStagesSchema = z.object({
    options: z
        .array(
            z
                .object({
                    id: dbIdSchema.optional(),
                    name: requiredText(50),
                    color: hexColor,
                    isConverted: z.boolean().default(false),
                    isLost: z.boolean().default(false),
                })
                .refine((stage) => !(stage.isConverted && stage.isLost), {
                    message: "A stage can't be both converted and lost",
                    path: ["isLost"],
                }),
        )
        // the leads board needs at least one column
        .min(1, "Keep at least one stage")
        .max(50, "That's too many stages"),
});
