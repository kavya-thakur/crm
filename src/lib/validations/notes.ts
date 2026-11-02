import { z } from "zod";
import { dbIdSchema } from "./common";

export const createNoteSchema = z.object({
    body: z.string().trim().min(1, "Note can't be empty").max(5000),
    // ids of agents @-mentioned while composing — the client tracks these,
    // the route just checks they belong to the org
    mentionedUserIds: z.array(dbIdSchema).max(50).default([]),
});

export const updateNoteSchema = createNoteSchema;

export const listNoteFeedQuerySchema = z.object({
    // "mine" = notes I wrote, "mentions" = notes that @-mention me, "all" = either
    scope: z.enum(["all", "mine", "mentions"]).default("all"),
    limit: z.coerce.number().int().min(1).max(100).default(30),
    // only one kind of record's notes, for a column of the notes board
    entity: z.enum(["lead", "deal", "contact"]).optional(),
});
