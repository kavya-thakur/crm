import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { dealScope, hasPermission, leadScope, type CurrentUser } from "@/lib/auth/requirePermission";
import { handleRouteError, parseBody, validationError } from "@/lib/api/http";
import { tooManyAttempts } from "@/lib/api/rateLimit";
import { emailsQueue } from "@/lib/jobs/queues";
import { listEmailsQuerySchema, sendEmailSchema } from "@/lib/validations/emails";
import { searchParamsToObject } from "@/lib/validations/common";

// Most emails one person can send in a day: well inside Gmail's own 500, and a stop on mistakes
const DAILY_LIMIT = 100;

const emailSelect = {
    id: true,
    to: true,
    subject: true,
    body: true,
    status: true,
    error: true,
    sentAt: true,
    openedAt: true,
    createdAt: true,
    sentBy: { select: { id: true, name: true } },
} as const;

// The lead or deal an email is about, if this person may see it (and so email it)
async function findRecord(user: CurrentUser, link: { leadId?: number; dealId?: number }) {
    if (link.leadId !== undefined) {
        if (!hasPermission(user, "lead:read")) throw new Error("FORBIDDEN");
        return prisma.lead.findFirst({ where: { id: link.leadId, ...leadScope(user) }, select: { id: true } });
    }
    if (!hasPermission(user, "deal:read")) throw new Error("FORBIDDEN");
    return prisma.deal.findFirst({ where: { id: link.dealId, ...dealScope(user) }, select: { id: true } });
}

// A lead's or a deal's emails, newest first (its Emails tab)
export async function GET(req: NextRequest) {
    try {
        const user = await getCurrentUser();
        if (!user) throw new Error("UNAUTHORIZED");

        const query = listEmailsQuerySchema.safeParse(searchParamsToObject(req.nextUrl.searchParams));
        if (!query.success) return validationError(query.error);

        const record = await findRecord(user, query.data);
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

// Saves the email, puts it on the queue (the worker sends it) and logs it on the record's timeline
export async function POST(req: NextRequest) {
    try {
        const user = await getCurrentUser();
        if (!user) throw new Error("UNAUTHORIZED");

        const body = await parseBody(req, sendEmailSchema);
        if (!body.success) return body.response;

        const { leadId, dealId, to, subject, body: text } = body.data;
        const record = await findRecord(user, { leadId, dealId });
        if (!record) return NextResponse.json({ ok: false, message: "Not found" }, { status: 404 });

        if (await tooManyAttempts(`email:${user.id}`, DAILY_LIMIT, 24 * 60 * 60 * 1000)) {
            return NextResponse.json({ ok: false, message: `You've sent ${DAILY_LIMIT} emails today, the most for one day. Try again tomorrow.` }, { status: 429 });
        }

        const timeline = { create: { userId: user.id, type: "EMAIL_SENT", message: `Emailed ${to}: ${subject}` } };
        const email = await prisma.$transaction(async (tx) => {
            const created = await tx.email.create({
                data: {
                    organizationId: user.organizationId,
                    leadId: leadId ?? null,
                    dealId: dealId ?? null,
                    sentById: user.id,
                    to,
                    subject,
                    body: text,
                    // the open-tracking image's address: random, so nobody can mark others' emails opened
                    trackingToken: randomBytes(18).toString("base64url"),
                },
                select: emailSelect,
            });
            if (leadId) await tx.lead.update({ where: { id: leadId }, data: { timeline } });
            else await tx.deal.update({ where: { id: dealId }, data: { timeline } });
            return created;
        });

        await emailsQueue().add("send", { emailId: email.id });

        return NextResponse.json({ ok: true, message: "Sending", data: email }, { status: 201 });
    } catch (error) {
        return handleRouteError(error, "Send email");
    }
}
