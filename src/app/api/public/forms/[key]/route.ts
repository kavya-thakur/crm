import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { captureLead, formSubmissionSchema } from "@/lib/leads/capture";
import { tooManyAttempts, visitorOf } from "@/lib/api/rateLimit";
import { handleRouteError } from "@/lib/api/http";

type Params = { params: Promise<{ key: string }> };

// Anyone's website can send to this, not just Flash's own pages
const CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
};

const KNOWN_FIELDS = new Set(["name", "email", "phone", "company", "message", "details", "website", "redirect"]);
const MAX_BODY_BYTES = 20_000;

export function OPTIONS() {
    return new NextResponse(null, { status: 204, headers: CORS });
}

// A web form's submission: no login, so it's checked hard. Size, a per-visitor limit,
// a hidden spam-trap field, then the same rules as a lead typed in by hand.
// Works both from JavaScript (JSON in, JSON out) and from a plain HTML <form>, which gets
// redirected to the site's own thank-you page (or a simple one of ours).
export async function POST(req: NextRequest, { params }: Params) {
    try {
        const { key } = await params;
        const htmlForm = !(req.headers.get("content-type") ?? "").includes("application/json");

        if (Number(req.headers.get("content-length")) > MAX_BODY_BYTES) {
            return reply(htmlForm, 413, "That message is too long.");
        }

        // a few submissions per visitor every 10 minutes is plenty for a person, not for a bot
        if (await tooManyAttempts(`form:${visitorOf(req.headers)}:${key}`, 5, 10 * 60 * 1000)) {
            return reply(htmlForm, 429, "Too many tries. Please wait a few minutes and send it again.");
        }

        const raw = htmlForm ? fromHtmlForm(await req.formData()) : await req.json().catch(() => null);
        const submission = formSubmissionSchema.safeParse(raw);

        if (!submission.success) {
            const { fieldErrors } = z.flattenError(submission.error);
            const first = Object.values(fieldErrors).flat()[0] ?? "Please check the form and try again.";
            return htmlForm
                ? reply(true, 400, first)
                : NextResponse.json({ ok: false, message: first, errors: fieldErrors }, { status: 400, headers: CORS });
        }

        // the spam trap was filled in: a bot. Say thanks and keep nothing, so it learns nothing
        if (submission.data.website) {
            return done(htmlForm, raw, { thankYou: "Thanks, we'll be in touch soon.", redirectUrl: null });
        }

        const result = await captureLead(key, submission.data);

        if (!result.ok && result.reason === "invalid") {
            // what the form itself asks for: a required field left empty, an answer that doesn't fit
            const first = Object.values(result.errors)[0];
            return htmlForm ? reply(true, 400, first) : NextResponse.json({ ok: false, message: first, errors: result.errors }, { status: 400, headers: CORS });
        }

        if (!result.ok) {
            return reply(htmlForm, 404, "This form isn't taking submissions any more.");
        }

        return done(htmlForm, raw, result);
    } catch (error) {
        return handleRouteError(error, "Web form submission");
    }
}

// An HTML form's fields. Answers to the form's custom fields are named "cf_<key>"
// (cf_budget); anything beyond those and the usual ones ("team_size") is kept as details.
function fromHtmlForm(form: FormData) {
    const fields = Object.fromEntries([...form.entries()].map(([name, value]) => [name, String(value)]));
    const customFields = Object.fromEntries(Object.entries(fields).flatMap(([name, value]) => (name.startsWith("cf_") ? [[name.slice(3), value]] : [])));
    const details = Object.fromEntries(Object.entries(fields).filter(([name]) => !KNOWN_FIELDS.has(name) && !name.startsWith("cf_")));
    return { ...fields, customFields, ...(Object.keys(details).length > 0 && { details }) };
}

// Sent: the form's own thank-you message, or off to the page it (or the embed code) names
function done(htmlForm: boolean, raw: unknown, form: { thankYou: string; redirectUrl: string | null }) {
    if (!htmlForm) return NextResponse.json({ ok: true, message: form.thankYou, redirectUrl: form.redirectUrl }, { headers: CORS });

    // only a real web address, never javascript: or the like
    const redirect = (raw as { redirect?: string } | null)?.redirect || form.redirectUrl;
    if (redirect && /^https?:\/\//.test(redirect)) return NextResponse.redirect(redirect, 303);

    return reply(true, 200, form.thankYou);
}

// A message for whoever sent the form: JSON for scripts, a small page for plain HTML forms
function reply(htmlForm: boolean, status: number, message: string) {
    if (!htmlForm) return NextResponse.json({ ok: status < 400, message }, { status, headers: CORS });

    const safe = message.replace(/[<>&"]/g, (char) => `&#${char.charCodeAt(0)};`);
    return new NextResponse(
        `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${status < 400 ? "Thanks" : "Something's not right"}</title>` +
            `<body style="font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:90vh;color:#1c1c1c">` +
            `<div style="text-align:center"><p style="font-size:18px">${safe}</p>` +
            (status < 400 ? "" : `<p><a href="javascript:history.back()" style="color:#4a38f5">Go back</a></p>`) +
            `</div></body>`,
        { status, headers: { "content-type": "text/html; charset=utf-8" } },
    );
}
