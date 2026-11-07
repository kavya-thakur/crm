import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { findVisibleRecord } from "@/lib/auth/requirePermission";
import { handleRouteError, parseBody, validationError } from "@/lib/api/http";
import { tooManyAttempts } from "@/lib/api/rateLimit";
import { NOT_CONNECTED, canSendEmail, emailSelect, queueEmail } from "@/lib/emails/send";
import { listEmailsQuerySchema, sendEmailSchema } from "@/lib/validations/emails";
import { searchParamsToObject } from "@/lib/validations/common";

// Most emails one person can send in a day: well inside Gmail's own 500, and a stop on mistakes
const DAILY_LIMIT = 100;

// A record's emails, newest first (its Emails tab)
export async function GET(req: NextRequest) {
    try {
        const user = await getCurrentUser();
        if (!user) throw new Error("UNAUTHORIZED");

        const query = listEmailsQuerySchema.safeParse(searchParamsToObject(req.nextUrl.searchParams));
        if (!query.success) return validationError(query.error);

        const record = await findVisibleRecord(user, query.data);
        if (!record) return NextResponse.json({ ok: false, message: "Not found" }, { status: 404 });

        const emails = await prisma.email.findMany({
            where: { organizationId: user.organizationId, ...query.data },
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            take: 100,
            select: emailSelect,
        });

        return NextResponse.json({ ok: true, data: emails });
    } catch (error) {
        return handleRouteError(error, "Get emails");
    }
}

// Sends an email from a lead's, deal's or contact's Emails tab (queueEmail saves it, logs it and queues it)
export async function POST(req: NextRequest) {
    try {
        const user = await getCurrentUser();
        if (!user) throw new Error("UNAUTHORIZED");

        const body = await parseBody(req, sendEmailSchema);
        if (!body.success) return body.response;

        const { leadId, dealId, contactId, to, subject, body: text } = body.data;
        const record = await findVisibleRecord(user, { leadId, dealId, contactId });
        if (!record) return NextResponse.json({ ok: false, message: "Not found" }, { status: 404 });

        // emails go out from your own mailbox, so you need one connected
        if (!(await canSendEmail(user))) return NextResponse.json({ ok: false, message: NOT_CONNECTED }, { status: 400 });

        if (await tooManyAttempts(`email:${user.id}`, DAILY_LIMIT, 24 * 60 * 60 * 1000)) {
            return NextResponse.json({ ok: false, message: `You've sent ${DAILY_LIMIT} emails today, the most for one day. Try again tomorrow.` }, { status: 429 });
        }

        const email = await queueEmail({ organizationId: user.organizationId, leadId, dealId, contactId, sentById: user.id, to, subject, body: text });

        return NextResponse.json({ ok: true, message: "Sending", data: email }, { status: 201 });
    } catch (error) {
        return handleRouteError(error, "Send email");
    }
}
