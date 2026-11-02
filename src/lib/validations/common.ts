import { z } from "zod";

// Postgres INTEGER ids are 32-bit; a bigger number makes the query itself fail (500)
export const dbIdSchema = z.int32().positive();

// Path ids: plain digits only, so "1e1", "0x10" or " 5" are rejected instead of coerced
export const idParamSchema = z
    .string()
    .regex(/^[1-9]\d*$/, "Invalid id")
    .transform(Number)
    .pipe(dbIdSchema);

// Postgres text columns cannot store \0 — it fails the whole query
const noNullBytes = (s: string) => !s.includes("\0");

// Forms send "" or "   " for an empty field; treat it as "no value" (null)
const blankToNull = (value: unknown) => {
    if (typeof value !== "string") return value;
    const trimmed = value.trim();
    return trimmed === "" ? null : trimmed;
};

export const requiredText = (max: number) =>
    z
        .string()
        .trim()
        .min(1, "Required")
        .max(max, `Must be at most ${max} characters`)
        .refine(noNullBytes, "Contains invalid characters");

// undefined = not sent, null / "" = empty (also how a client clears the field)
export const optionalText = (max: number) =>
    z.preprocess(
        blankToNull,
        z
            .string()
            .max(max, `Must be at most ${max} characters`)
            .refine(noNullBytes, "Contains invalid characters")
            .nullable()
            .optional()
    );

// "kavya" -> "Kavya" — cosmetic only, so names/titles look consistent
// regardless of how they were typed. Every search/filter in the app matches
// case-insensitively already, so this never changes what matches what.
export const capitalizeFirst = (value: string) => (value ? value[0].toUpperCase() + value.slice(1) : value);

// Same, through a value that might be null/undefined (an optional field left empty)
export const capitalizeIfPresent = (value: string | null | undefined) =>
    value == null ? value : capitalizeFirst(value);

// Lowercased so "Bob@x.com" and "bob@x.com" are one account, and login finds it either way
export const emailSchema = z
    .email("Invalid email")
    .max(254, "Must be at most 254 characters")
    .transform((email) => email.toLowerCase());

export const optionalEmail = z.preprocess(blankToNull, emailSchema.nullable().optional());

// ponytail: shape check only (chars + 5–15 digits, the E.164 max); add libphonenumber if numbers must be dialable
export const optionalPhone = z.preprocess(
    blankToNull,
    z
        .string()
        .max(30, "Must be at most 30 characters")
        .regex(/^[+0-9\s().-]+$/, "Invalid phone number")
        .refine((phone) => {
            const digits = phone.replace(/\D/g, "").length;
            return digits >= 5 && digits <= 15;
        }, "Invalid phone number")
        .nullable()
);
export const requiredPhone = z.preprocess(
    blankToNull,
    z
        .string()
        .min(1, "Phone number is required")
        .max(30, "Must be at most 30 characters")
        .regex(/^[+0-9\s().-]+$/, "Invalid phone number")
        .refine((phone) => {
            const digits = phone.replace(/\D/g, "").length;
            return digits >= 5 && digits <= 15;
        }, "Invalid phone number")
);

// Entities that can have per-org saved filters and custom field definitions
export const ENTITY_TYPES = ["lead", "deal", "contact"] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];

export const paginationSchema = z.object({
    page: z.coerce.number().int().min(1).max(10_000).default(1), // cap avoids huge OFFSET scans
    limit: z.coerce.number().int().min(1).max(100).default(20),
});

// ?status=&search= from a form means "no filter", so empty params are dropped before validating
export function searchParamsToObject(searchParams: URLSearchParams) {
    return Object.fromEntries(
        [...searchParams].filter(([, value]) => value.trim() !== "")
    );
}

// A to-do or scheduled activity can be about one lead, deal or contact — never several
export function hasAtMostOneRecordLink(data: { leadId?: number; dealId?: number; contactId?: number }) {
    return [data.leadId, data.dealId, data.contactId].filter((id) => id !== undefined).length <= 1;
}

// For PATCH bodies: an empty object would be a no-op update
export const hasAnyField = (data: object) =>
    Object.values(data).some((value) => value !== undefined);

// Prisma runs "insensitive" filters (even equals) as ILIKE, where \ % _ are wildcards;
// escape them so "%" or "Sales_Rep" match literally
export const escapeLike = (value: string) => value.replace(/[\\%_]/g, "\\$&");

// "4,7,9" -> [4, 7, 9]: several ids in one query param, e.g. filtering on more than one stage
export const idListParamSchema = z
    .string()
    .regex(/^[1-9]\d*(,[1-9]\d*)*$/, "Invalid list of ids")
    .transform((value) => [...new Set(value.split(",").map(Number))])
    .pipe(z.array(dbIdSchema).max(100));

// A person filter, like "created by": "me" or a user's id
export const personParamSchema = z.union([z.literal("me"), idParamSchema]);

// ?createdFrom=2026-01-01&createdTo=2026-01-31 (plain dates, a day each) ->
// a Prisma range covering the whole of both days, or undefined if neither was sent.
// Used for the created and the last-modified date filters.
export function dayRange(from?: string, to?: string) {
    if (!from && !to) return undefined;

    return {
        ...(from && { gte: new Date(`${from}T00:00:00.000Z`) }),
        ...(to && { lte: new Date(`${to}T23:59:59.999Z`) }),
    };
}

// Bulk actions: up to INSTANT_BULK_LIMIT records are done in the request itself; more (up to
// MAX_BULK) become a background job on the queue (src/lib/jobs/bulkActions.ts, docs/QUEUES.md)
export const INSTANT_BULK_LIMIT = 200;
export const MAX_BULK = 50_000;
