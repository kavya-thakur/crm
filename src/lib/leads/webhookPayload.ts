import { guessField } from "@/lib/validations/imports";

/*
 * What another tool posts to a lead integration, turned into what a web form sends
 * (FormSubmission), so it goes through exactly the same capture rules. Understands:
 *  - plain JSON from Zapier / Make / Pabbly / your own code: { "name": ..., "phone": ... }, with
 *    any sensible field names ("full_name", "Mobile No.", "phone_number"), the same guesses
 *    the CSV import makes, plus first_name + last_name
 *  - Google Ads lead forms: { user_column_data: [{ column_id: "FULL_NAME", string_value }], campaign_id }
 *  - IndiaMART: { RESPONSE: { SENDER_NAME, SENDER_MOBILE, SENDER_EMAIL, QUERY_MESSAGE } }
 * The lead's own custom fields match by their key or name; anything else is kept as details
 * on the lead's timeline, so nothing sent is lost.
 */

type Flat = Record<string, string>;

const MAX_DETAILS = 30;

// Top-level values, plus those one level down ({ "data": {...} }, IndiaMART's "RESPONSE")
function flatten(raw: Record<string, unknown>): Flat {
    const flat: Flat = {};
    const put = (key: string, value: unknown) => {
        if (value === null || value === undefined || typeof value === "object") return;
        if (!(key in flat)) flat[key] = String(value).trim();
    };
    for (const [key, value] of Object.entries(raw)) put(key, value);
    for (const value of Object.values(raw)) {
        if (value && typeof value === "object" && !Array.isArray(value)) for (const [key, inner] of Object.entries(value)) put(key, inner);
    }
    return flat;
}

// Google sends the form's answers as a list: [{ column_id: "PHONE_NUMBER", string_value: "+91..." }]
function fromGoogleAds(raw: Record<string, unknown>) {
    const columns = raw.user_column_data as { column_id?: string; column_name?: string; string_value?: string }[];
    const flat: Flat = Object.fromEntries(
        columns.filter((column) => column.string_value).map((column) => [column.column_id ?? column.column_name ?? "field", String(column.string_value).trim()]),
    );
    return {
        flat,
        utm: { utm_source: "google", utm_medium: "cpc", ...(raw.campaign_id !== undefined && { utm_campaign: String(raw.campaign_id) }) },
    };
}

const normalise = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, "");

export function toSubmission(raw: unknown, customFields: { key: string; label: string }[]) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const body = raw as Record<string, unknown>;

    const { flat, utm } = Array.isArray(body.user_column_data) ? fromGoogleAds(body) : { flat: flatten(body), utm: {} };

    const submission: Record<string, unknown> = { ...utm };
    const custom: Record<string, string> = {};
    const details: Record<string, string> = {};
    let first = "";
    let last = "";

    for (const [key, value] of Object.entries(flat)) {
        if (value === "") continue;
        const name = normalise(key);

        // the ad campaign, as utm_ tags (checked before the guesses, which read "utm_source" as Source)
        if (["utmsource", "utmmedium", "utmcampaign"].includes(name)) {
            submission[`utm_${name.slice(3)}`] = value;
            continue;
        }
        if (["firstname", "givenname"].includes(name)) {
            first = value;
            continue;
        }
        if (["lastname", "surname", "familyname"].includes(name)) {
            last = value;
            continue;
        }

        const field = guessField(key, customFields);
        if (field === "name" || field === "email" || field === "phone" || field === "company") {
            submission[field] ??= value;
        } else if (field === "note") {
            submission.message ??= value;
        } else if (field === "campaign") {
            submission.utm_campaign ??= value;
        } else if (field?.startsWith("cf:")) {
            custom[field.slice(3)] = value;
        } else if (Object.keys(details).length < MAX_DETAILS) {
            // stage, source and owner come from the integration's own settings, not the sender
            details[key.slice(0, 60)] = value.slice(0, 300);
        }
    }

    submission.name ??= [first, last].filter(Boolean).join(" ") || undefined;
    if (typeof submission.message === "string") submission.message = submission.message.slice(0, 2000);
    if (Object.keys(custom).length > 0) submission.customFields = custom;
    if (Object.keys(details).length > 0) submission.details = details;
    return submission;
}
