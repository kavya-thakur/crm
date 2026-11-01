import { z } from "zod";
import { ENTITY_TYPES, requiredText } from "./common";

export const createSavedFilterSchema = z.object({
    entity: z.enum(ENTITY_TYPES),
    name: requiredText(100),
    // Whatever shape the list page's filter state is in. Never interpreted
    // server-side — just stored and handed back for the client to re-apply.
    filters: z.record(z.string(), z.unknown()),
});

export const listSavedFiltersQuerySchema = z.object({
    entity: z.enum(ENTITY_TYPES),
});
