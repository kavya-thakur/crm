import { z } from "zod";
import { dbIdSchema, hasAnyField, hasAtMostOneRecordLink, idParamSchema, optionalText, paginationSchema, requiredText } from "./common";

export const taskStatusSchema = z.enum(["PENDING", "COMPLETED"]);
export const taskPrioritySchema = z.enum(["LOW", "MEDIUM", "HIGH"]);

export const createTaskSchema = z
    .object({
        title: requiredText(200),
        description: optionalText(5000),
        // a deadline day like "2026-11-05", not a moment in time
        dueDate: z.iso.date(),
        // omitted = Medium
        priority: taskPrioritySchema.optional(),
        // every task needs someone to do it — omitted = assign to the creator
        assignedToId: dbIdSchema.optional(),
        // which record (if any) this is about — at most one
        leadId: dbIdSchema.optional(),
        dealId: dbIdSchema.optional(),
        contactId: dbIdSchema.optional(),
    })
    .refine(hasAtMostOneRecordLink, {
        message: "A task can only be linked to one of a lead, a deal or a contact",
        path: ["leadId"],
    });

// The record a task is about is fixed when it's created, so it isn't editable here
export const updateTaskSchema = z
    .object({
        title: requiredText(200),
        description: optionalText(5000),
        dueDate: z.iso.date(),
        priority: taskPrioritySchema,
        assignedToId: dbIdSchema,
        status: taskStatusSchema,
    })
    .partial()
    .refine(hasAnyField, "Provide at least one field to update");

export const listTasksQuerySchema = paginationSchema.extend({
    // "open" = everything not done yet (overdue ones included); "overdue" = open and past its day
    scope: z.enum(["open", "overdue", "completed", "all"]).default("open"),
    assignedTo: z.union([z.literal("me"), idParamSchema]).optional(),
    priority: taskPrioritySchema.optional(),
    leadId: idParamSchema.optional(),
    dealId: idParamSchema.optional(),
    contactId: idParamSchema.optional(),
});
