import { z } from "zod";
import { dbIdSchema, hasAnyField, idParamSchema, requiredText } from "./common";

// "#3a5bc7" — the same format the stage colours are stored in
const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Color must be a hex code like #3a5bc7");

// A pipeline: just its name; it starts with a few stages to rename (NEW_PIPELINE_STAGES)
export const pipelineSchema = z.object({ name: requiredText(50) });

// Which pipeline a stage list belongs to: ?pipelineId= on GET and PUT /api/pipeline-stages
export const pipelineQuerySchema = z.object({ pipelineId: idParamSchema.optional() });

export const createPipelineStageSchema = z
    .object({
        pipelineId: dbIdSchema,
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

// The settings page saves the whole list at once, in order. An option without an id is new.
export const savePipelineStagesSchema = z.object({
    options: z
        .array(
            z
                .object({
                    id: dbIdSchema.optional(),
                    name: requiredText(50),
                    color: hexColor,
                    isWon: z.boolean().default(false),
                    isLost: z.boolean().default(false),
                })
                .refine((stage) => !(stage.isWon && stage.isLost), {
                    message: "A stage can't be both won and lost",
                    path: ["isLost"],
                }),
        )
        // the deals board needs at least one column
        .min(1, "Keep at least one stage")
        .max(50, "That's too many stages"),
});
