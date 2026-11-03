import { z } from "zod";
import { dbIdSchema, hasAnyField, hasAtMostOneRecordLink, idParamSchema, optionalText, paginationSchema, requiredText } from "./common";

export const scheduledActivityTypeSchema = z.enum(["CALL", "MEETING", "OTHER"]);
export const scheduledActivityStatusSchema = z.enum(["SCHEDULED", "COMPLETED", "CANCELLED"]);

// What can be set when booking an activity and changed afterwards
const scheduledActivityShape = {
    type: scheduledActivityTypeSchema,
    title: requiredText(200),
    description: optionalText(5000),
    // the client sends a full ISO datetime, not just a date — this is a specific moment, not a day
    scheduledAt: z.iso.datetime(),
    durationMinutes: z.number().int().positive().max(24 * 60, "Must be at most 24 hours").nullable().optional(),
    // assignedToId is required on the model (every activity needs an owner) — omitted = assign to the creator
    assignedToId: dbIdSchema.optional(),
    // other agents tagged on it (e.g. everyone in a meeting); it shows on each of their schedules.
    // On update, the list replaces the current one.
    attendeeIds: z.array(dbIdSchema).max(50).optional(),
};

export const createScheduledActivitySchema = z
    .object({
        ...scheduledActivityShape,
        // which record (if any) this activity is about — at most one
        leadId: dbIdSchema.optional(),
        dealId: dbIdSchema.optional(),
        contactId: dbIdSchema.optional(),
    })
    .refine(hasAtMostOneRecordLink, {
        message: "An activity can only be linked to one of a lead, a deal or a contact",
        path: ["leadId"],
    });

// Status isn't settable on create (always starts SCHEDULED) but can change later
// (mark completed/cancelled, reopen, or reschedule). The record an activity is
// about is fixed when it's created, so it isn't editable here.
export const updateScheduledActivitySchema = z
    .object({ ...scheduledActivityShape, status: scheduledActivityStatusSchema })
    .partial()
    .refine(hasAnyField, "Provide at least one field to update");

export const listScheduledActivitiesQuerySchema = paginationSchema.extend({
    // "upcoming" = SCHEDULED and not yet due; "overdue" = SCHEDULED and past due;
    // "all" ignores status/time entirely
    scope: z.enum(["upcoming", "overdue", "completed", "cancelled", "all"]).default("upcoming"),
    // one exact status, for a column of the activity board
    status: scheduledActivityStatusSchema.optional(),
    // an agent's schedule: what's assigned to them plus what they're tagged on
    assignedTo: z.union([z.literal("me"), idParamSchema]).optional(),
    leadId: idParamSchema.optional(),
    dealId: idParamSchema.optional(),
    contactId: idParamSchema.optional(),
    // only ones at or after this moment (the start-time alert asks for the last few minutes onwards)
    from: z.coerce.date().optional(),
});
