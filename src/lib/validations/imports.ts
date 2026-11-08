import { z } from "zod";
import { dbIdSchema } from "./common";

// The biggest file one import takes: about 50,000 rows of a typical lead sheet
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 50_000;

/**
 * What a CSV column can become on a lead. `guesses` are header names seen in real
 * spreadsheets, so "Mobile No." lands on Phone without anyone choosing it. A lead's own
 * custom fields can be targets too, as "cf:<key>".
 */
export const LEAD_IMPORT_FIELDS = [
    { id: "name", label: "Name", required: true, guesses: ["name", "fullname", "leadname", "contactname", "customer", "customername", "lead", "person", "sendername"] },
    { id: "phone", label: "Phone", required: true, guesses: ["phone", "mobile", "mobileno", "mobilenumber", "phonenumber", "phoneno", "contactnumber", "contactno", "whatsapp", "cell", "tel", "sendermobile", "workphone"] },
    { id: "email", label: "Email", required: false, guesses: ["email", "emailaddress", "emailid", "mail", "senderemail", "workemail"] },
    { id: "company", label: "Company", required: false, guesses: ["company", "companyname", "organisation", "organization", "business", "firm", "account", "sendercompany"] },
    { id: "stage", label: "Stage", required: false, guesses: ["stage", "status", "leadstatus", "leadstage"] },
    { id: "source", label: "Source", required: false, guesses: ["source", "leadsource", "channel", "utmsource"] },
    { id: "campaign", label: "Campaign", required: false, guesses: ["campaign", "utmcampaign", "campaignname", "adcampaign"] },
    { id: "owner", label: "Assigned to", required: false, guesses: ["owner", "assignedto", "assignee", "agent", "salesrep", "rep", "salesperson", "leadowner"] },
    { id: "note", label: "Note", required: false, guesses: ["note", "notes", "comment", "comments", "remark", "remarks", "message", "description", "querymessage", "enquiry", "requirement"] },
] as const;

export type LeadImportField = (typeof LEAD_IMPORT_FIELDS)[number]["id"];

// "Mobile No." → "mobileno": headers compared without case, spaces or punctuation
const normalise = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, "");

// The best guess for a CSV header: a built-in field, one of the lead's custom fields, or nothing
export function guessField(header: string, customFields: { key: string; label: string }[]): string | null {
    const name = normalise(header);
    if (!name) return null;
    const builtIn = LEAD_IMPORT_FIELDS.find((field) => (field.guesses as readonly string[]).includes(name));
    if (builtIn) return builtIn.id;
    const custom = customFields.find((field) => normalise(field.label) === name || normalise(field.key) === name);
    return custom ? `cf:${custom.key}` : null;
}

// What a value in the file that matches nothing in Flash becomes, per field ("owner", "stage",
// "source", "cf:budget"), keyed by the value in lowercase: an id (a teammate, stage or source),
// a dropdown option, or null (nobody / no source / leave empty). A value left out uses the default.
const valueChoices = z
    .record(z.string().max(70), z.record(z.string().max(200), z.union([dbIdSchema, z.string().max(200), z.null()])))
    .refine((fields) => Object.values(fields).reduce((sum, choices) => sum + Object.keys(choices).length, 0) <= 2000, "Too many values");

/**
 * What the import screen sends with the file. `mapping` says which Flash field each CSV
 * column fills ("" or a missing column = not imported); `defaults` fill in a row's stage,
 * source and owner when its own column is empty or doesn't match anything; `values` say what
 * each value that matches nothing becomes instead; `fixes` keep rows that would otherwise fail.
 * See src/lib/imports/rows.ts.
 */
export const startImportSchema = z.object({
    mapping: z.record(z.string().max(200), z.string().max(60)),
    defaults: z.object({
        stageId: dbIdSchema.optional(),
        sourceId: dbIdSchema.nullable().optional(),
        ownerId: dbIdSchema.nullable().optional(),
        values: valueChoices.optional(),
        fixes: z
            .object({
                // a row without a name: its phone number becomes the name
                nameFromPhone: z.boolean().optional(),
                // fields whose bad values are left out, keeping the row ("email", "cf:budget")
                leaveEmpty: z.array(z.string().max(70)).max(100).optional(),
            })
            .optional(),
    }),
});

export type ImportDefaults = z.infer<typeof startImportSchema>["defaults"];
