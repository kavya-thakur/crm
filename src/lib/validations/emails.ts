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

// A WhatsApp chat opened from a lead, deal or contact, for its timeline: which template, if any
export const whatsappLogSchema = z
    .object({
        leadId: dbIdSchema.optional(),
        dealId: dbIdSchema.optional(),
        contactId: dbIdSchema.optional(),
        template: z.string().trim().max(100).optional(),
    })
    .refine(aboutOneRecord, "Open it from a lead, a deal or a contact");

export const emailTemplateSchema = z.object({
    name: z.string().trim().min(1, "Name it").max(100, "Must be at most 100 characters"),
    subject,
    body,
});

// Connecting your own mailbox (Settings > Profile). The server has to be a host name (no IP,
// no localhost) on a mail port, which keeps people from using the check to poke at other
// services; the route also limits how often it can be tried.
export const emailAccountSchema = z
    .object({
        email: z.email("Enter a valid email address").max(254),
        password: z.string().trim().min(1, "Paste the app password").max(200),
        host: z
            .string()
            .trim()
            .toLowerCase()
            .regex(/^(?!localhost$)(?![\d.]+$)[a-z0-9-]+(\.[a-z0-9-]+)+$/, "Enter the mail server, like smtp.gmail.com"),
        port: z.union([z.literal(465), z.literal(587)], "Use port 465 or 587"),
    })
    // Gmail shows app passwords in groups of 4 ("abcd efgh ijkl mnop"); the spaces aren't part of it
    .transform((account) => (account.host === "smtp.gmail.com" ? { ...account, password: account.password.replace(/\s/g, "") } : account));
