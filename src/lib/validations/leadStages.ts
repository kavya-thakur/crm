import { z } from "zod";
import { hasAnyField, requiredText } from "./common";

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
