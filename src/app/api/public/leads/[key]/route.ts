import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/generated/prisma/client";
import { captureLead, formSubmissionSchema } from "@/lib/leads/capture";
import { toSubmission } from "@/lib/leads/webhookPayload";
import { tooManyAttempts } from "@/lib/api/rateLimit";
import { handleRouteError } from "@/lib/api/http";
import { broadcastChange } from "@/lib/realtime/notify";

type Params = { params: Promise<{ key: string }> };

const MAX_BODY_BYTES = 50_000;
// deliveries kept per integration, newest first
const KEEP_DELIVERIES = 50;

/**
 * A lead integration's webhook: other tools (Google Ads, IndiaMART, Zapier / Make / Pabbly,
 * a developer's code) POST a lead here and it's captured like a web form submission. The
 * long random key in the address is the secret, so only whoever was given it can send.
 * Answers JSON: 200 with the lead's id, or 400 with what was wrong. Every delivery is logged
 * for the integration's page in Settings. See docs/INTEGRATIONS.md.
 */
export async function POST(req: NextRequest, { params }: Params) {
    try {
        const { key } = await params;

        if (Number(req.headers.get("content-length")) > MAX_BODY_BYTES) {
            return NextResponse.json({ ok: false, message: "Too large: send one lead at a time" }, { status: 413 });
        }

        // JSON from most tools; a few send form fields instead
        const isJson = (req.headers.get("content-type") ?? "").includes("json");
        const raw: unknown = isJson
            ? await req.json().catch(() => null)
            : Object.fromEntries([...(await req.formData().catch(() => new FormData())).entries()].map(([name, value]) => [name, String(value)]));

        return await receive(key, raw);
    } catch (error) {
        return handleRouteError(error, "Lead webhook");
    }
}

/**
 * A GET with details in the address is a lead too: some calling tools (Exotel's Passthru) report
 * a call that way, ?CallFrom=09876543210&CallSid=... A bare GET is a tool checking the address works.
 */
export async function GET(req: NextRequest, { params }: Params) {
    try {
        const { key } = await params;
        if (req.nextUrl.searchParams.size > 0) return await receive(key, Object.fromEntries(req.nextUrl.searchParams));

        const form = await prisma.leadForm.findUnique({ where: { key }, select: { name: true, kind: true } });
        if (!form || form.kind !== "WEBHOOK") return NextResponse.json({ ok: false, message: "Not found" }, { status: 404 });
        return NextResponse.json({ ok: true, message: `Flash lead integration "${form.name}" is ready. POST leads here as JSON.` });
    } catch (error) {
        return handleRouteError(error, "Lead webhook");
    }
}

// One delivery, however it came: checked, captured like a web form submission, and logged
async function receive(key: string, raw: unknown) {
    const form = await prisma.leadForm.findUnique({ where: { key }, select: { id: true, organizationId: true, kind: true } });
    if (!form || form.kind !== "WEBHOOK") {
        return NextResponse.json({ ok: false, message: "No lead integration has this address. Check the link in Flash's Settings > Lead integrations." }, { status: 404 });
    }

    // generous for a tool sending a backlog, a stop for a runaway loop
    if (await tooManyAttempts(`webhook:${key}`, 120, 60 * 1000)) {
        return NextResponse.json({ ok: false, message: "Too many leads in a minute. Slow down and send the rest again." }, { status: 429 });
    }

    const fields = await prisma.customFieldDefinition.findMany({
        where: { organizationId: form.organizationId, entity: "lead", type: { not: "AGENT" } },
        select: { key: true, label: true },
    });
    const lead = toSubmission(raw, fields);

    // the two things every lead needs, said plainly when they're missing
    // (no name is fine: the phone number stands in)
    const missing = !lead ? "Send the lead as JSON" : !lead.phone ? "Phone is missing" : null;
    if (missing) {
        await logDelivery(form, raw, { status: "REJECTED", message: missing });
        return NextResponse.json({ ok: false, message: missing }, { status: 400 });
    }

    const submission = formSubmissionSchema.safeParse(lead);

    if (!submission.success) {
        const { formErrors, fieldErrors } = z.flattenError(submission.error);
        const [field, messages] = Object.entries(fieldErrors)[0] ?? [];
        const message = field ? `${label(field)}: ${messages?.[0]}` : (formErrors[0] ?? "Send the lead as JSON, with at least a name and a phone number");
        await logDelivery(form, raw, { status: "REJECTED", message });
        return NextResponse.json({ ok: false, message }, { status: 400 });
    }

    const result = await captureLead(key, submission.data);

    if (!result.ok) {
        const message = result.reason === "invalid" ? Object.values(result.errors)[0] : "The workspace has no open lead stage or no members";
        await logDelivery(form, raw, { status: "REJECTED", message });
        return NextResponse.json({ ok: false, message }, { status: 400 });
    }

    await logDelivery(form, raw, {
        status: result.created ? "CREATED" : "UPDATED",
        message: result.created ? `New lead: ${submission.data.name}` : `Already an open lead, added to ${submission.data.name}'s timeline`,
        leadId: result.leadId,
    });
    return NextResponse.json({ ok: true, created: result.created, leadId: result.leadId });
}

// "name" → "Name" for the error messages
const label = (field: string) => field.charAt(0).toUpperCase() + field.slice(1);

// Records the delivery for the integration's page, keeps only the newest ones, and tells
// the open Settings page (nobody's signed in here, so server.ts can't announce it)
async function logDelivery(form: { id: number; organizationId: number }, raw: unknown, result: { status: string; message: string; leadId?: number }) {
    const text = JSON.stringify(raw ?? null);
    const payload = (text.length <= 10_000 ? raw : { trimmed: text.slice(0, 10_000) }) as Prisma.InputJsonValue;

    await prisma.leadFormDelivery.create({ data: { formId: form.id, ...result, payload: payload ?? Prisma.JsonNull } });
    const old = await prisma.leadFormDelivery.findMany({ where: { formId: form.id }, orderBy: { id: "desc" }, skip: KEEP_DELIVERIES, select: { id: true } });
    if (old.length > 0) await prisma.leadFormDelivery.deleteMany({ where: { id: { in: old.map((row) => row.id) } } });

    broadcastChange(form.organizationId, "lead-forms");
}
