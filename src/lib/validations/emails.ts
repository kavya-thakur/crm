import { z } from "zod";
import { dbIdSchema } from "./common";

const subject = z.string().trim().min(1, "Add a subject").max(200, "Must be at most 200 characters");
const body = z.string().trim().min(1, "Write something to send").max(20_000, "Must be at most 20,000 characters");

// exactly one of leadId, dealId and contactId: the record the email is about
const aboutOneRecord = (value: { leadId?: number; dealId?: number; contactId?: number }) =>
    [value.leadId, value.dealId, value.contactId].filter((id) => id !== undefined).length === 1;

// An email from a lead's, deal's or contact's Emails tab
export const sendEmailSchema = z
    .object({
        leadId: dbIdSchema.optional(),
        dealId: dbIdSchema.optional(),
        contactId: dbIdSchema.optional(),
        to: z.email("Enter a valid email address").max(254),
        subject,
        body,
    })
    .refine(aboutOneRecord, "Send it from a lead, a deal or a contact");

// Which record's emails to list
const recordIdParam = z.coerce.number().int().positive().optional();
export const listEmailsQuerySchema = z
    .object({ leadId: recordIdParam, dealId: recordIdParam, contactId: recordIdParam })
    .refine(aboutOneRecord, "Ask for one lead's, deal's or contact's emails");

export const emailTemplateSchema = z.object({
    name: z.string().trim().min(1, "Name it").max(100, "Must be at most 100 characters"),
    subject,
    body,
});
