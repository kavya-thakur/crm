import { z } from "zod";
import { dbIdSchema } from "./common";

const subject = z.string().trim().min(1, "Add a subject").max(200, "Must be at most 200 characters");
const body = z.string().trim().min(1, "Write something to send").max(20_000, "Must be at most 20,000 characters");

// An email from a lead's or a deal's Emails tab: about exactly one of them
export const sendEmailSchema = z
    .object({
        leadId: dbIdSchema.optional(),
        dealId: dbIdSchema.optional(),
        to: z.email("Enter a valid email address").max(254),
        subject,
        body,
    })
    .refine((value) => (value.leadId === undefined) !== (value.dealId === undefined), "Send it from a lead or a deal");

// Which record's emails to list
export const listEmailsQuerySchema = z
    .object({ leadId: z.coerce.number().int().positive().optional(), dealId: z.coerce.number().int().positive().optional() })
    .refine((value) => (value.leadId === undefined) !== (value.dealId === undefined), "Ask for a lead's or a deal's emails");

export const emailTemplateSchema = z.object({
    name: z.string().trim().min(1, "Name it").max(100, "Must be at most 100 characters"),
    subject,
    body,
});
