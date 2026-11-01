import { z } from "zod";
import { hasAnyField, requiredText } from "./common";

// "#3a5bc7" — the same format the stage colours are stored in
const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Color must be a hex code like #3a5bc7");

export const createPipelineStageSchema = z
    .object({
        name: requiredText(50),
        color: hexColor.optional(),
        isWon: z.boolean().default(false),
        isLost: z.boolean().default(false),
    })
    // a deal in this stage is either won or lost, never both
    .refine((stage) => !(stage.isWon && stage.isLost), {
        message: "A stage can't be both won and lost",
        path: ["isLost"],
    });

// For the PATCH route later: every field optional, but at least one required
export const updatePipelineStageSchema = z
    .object({
        name: requiredText(50).optional(),
        color: hexColor.optional(),
        isWon: z.boolean().optional(),
        isLost: z.boolean().optional(),
    })
    .refine(hasAnyField, "Provide at least one field to update");
