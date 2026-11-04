import { randomBytes } from "node:crypto";
import nodemailer, { type Transporter } from "nodemailer";

import { prisma } from "@/lib/db/prisma";
import { isDemoWorkspace } from "@/lib/demo/workspace";
import { broadcastChange, notify } from "@/lib/realtime/notify";
import { emailsQueue } from "@/lib/jobs/queues";

/*
 * Sending the CRM's emails, over SMTP (any provider: Gmail, Brevo, Resend...), set in .env:
 *   SMTP_HOST=smtp.gmail.com  SMTP_PORT=465  SMTP_USER=flash.crm.mail@gmail.com  SMTP_PASS=<app password>
 *   SMTP_FROM (optional, defaults to SMTP_USER)   APP_URL (the site's address, for open tracking)
 * Every email goes out from that one address as "Priya via Acme", with Reply-To set to the
 * sender's own email, so the customer's reply lands in their inbox. Run by the worker
 * (src/lib/jobs/worker.ts) for each id on the "emails" queue; see docs/EMAIL.md.
 */

const holder = globalThis as unknown as { crmMailer?: Transporter };

export const emailSelect = {
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

/**
 * Saves an email to a lead or deal, logs it on that record's timeline, and puts it on the
 * queue for the worker to send. Used by the Emails tab and by automations.
 */
export async function queueEmail(email: {
    organizationId: number;
    leadId?: number;
    dealId?: number;
    contactId?: number;
    sentById: number;
    to: string;
    subject: string;
    body: string;
}) {
    const { leadId, dealId, contactId, ...fields } = email;
    const timeline = { create: { userId: email.sentById, type: "EMAIL_SENT", message: `Emailed ${email.to}: ${email.subject}` } };

    const saved = await prisma.$transaction(async (tx) => {
        const created = await tx.email.create({
            data: {
                ...fields,
                leadId: leadId ?? null,
                dealId: dealId ?? null,
                contactId: contactId ?? null,
                // the open-tracking image's address: random, so nobody can mark others' emails opened
                trackingToken: randomBytes(18).toString("base64url"),
            },
            select: emailSelect,
        });
        if (leadId) await tx.lead.update({ where: { id: leadId }, data: { timeline } });
        else if (dealId) await tx.deal.update({ where: { id: dealId }, data: { timeline } });
        else await tx.contact.update({ where: { id: contactId }, data: { timeline } });
        return created;
    });

    await emailsQueue().add("send", { emailId: saved.id });
    return saved;
}

// What's missing from .env before email can go out, said plainly; null when it's all there
export function emailSetupProblem() {
    const missing = ["SMTP_HOST", "SMTP_USER", "SMTP_PASS"].filter((name) => !process.env[name]);
    return missing.length > 0 ? `Email isn't set up yet: add ${missing.join(", ")} to .env` : null;
}

// One SMTP connection setup for the whole process. Port 465 is SSL from the start; 587 upgrades with STARTTLS.
function mailer() {
    const port = Number(process.env.SMTP_PORT) || 465;
    holder.crmMailer ??= nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port,
        secure: port === 465,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
    return holder.crmMailer;
}

export async function sendEmail(emailId: number) {
    const email = await prisma.email.findUnique({
        where: { id: emailId },
        include: { sentBy: { select: { name: true, email: true } }, organization: { select: { name: true, slug: true } } },
    });
    // gone (its lead was deleted), or already dealt with (a retry after it went out)
    if (!email || email.status !== "QUEUED") return;

    // the public demo is open to anyone: it never emails real people
    if (isDemoWorkspace(email)) {
        await prisma.email.update({ where: { id: email.id }, data: { status: "SKIPPED", error: "Demo workspace: emails aren't really sent" } });
        broadcastChange(email.organizationId, "emails");
        return;
    }

    // nothing to retry until someone fills in .env
    const problem = emailSetupProblem();
    if (problem) return failEmail(email.id, problem);

    await mailer().sendMail({
        from: { name: `${email.sentBy?.name ?? "Someone"} via ${email.organization.name}`, address: process.env.SMTP_FROM || process.env.SMTP_USER! },
        ...(email.sentBy && { replyTo: { name: email.sentBy.name, address: email.sentBy.email } }),
        to: email.to,
        subject: email.subject,
        text: email.body,
        html: toHtml(email.body, email.trackingToken),
    });

    await prisma.email.update({ where: { id: email.id }, data: { status: "SENT", sentAt: new Date(), error: null } });
    broadcastChange(email.organizationId, "emails");
}

// Out of retries (or nothing to retry): marked failed, and whoever sent it is told why
export async function failEmail(emailId: number, reason: string) {
    const email = await prisma.email.update({ where: { id: emailId }, data: { status: "FAILED", error: reason.slice(0, 500) } });
    broadcastChange(email.organizationId, "emails");
    await notify([email.sentById], {
        organizationId: email.organizationId,
        actorId: null,
        type: "EMAIL_FAILED",
        title: `Your email to ${email.to} wasn't sent`,
        body: reason,
        link: recordLink(email),
    });
}

// Where an email's lead or deal opens
export function recordLink(email: { leadId: number | null; dealId: number | null; contactId: number | null }) {
    if (email.leadId) return `/leads?open=${email.leadId}`;
    if (email.dealId) return `/deals?open=${email.dealId}`;
    return `/contacts?open=${email.contactId}`;
}

// The typed text as simple HTML: escaped, line breaks kept, and the tiny open-tracking image
// at the end (only once APP_URL says where the site lives; a mail app can't reach localhost)
function toHtml(body: string, trackingToken: string) {
    const text = body.replace(/[&<>"]/g, (char) => `&#${char.charCodeAt(0)};`).replace(/\n/g, "<br>");
    const pixel = process.env.APP_URL ? `<img src="${process.env.APP_URL.replace(/\/$/, "")}/api/public/emails/${trackingToken}/open" width="1" height="1" alt="">` : "";
    return `<div style="font-family: Arial, sans-serif; font-size: 14px; line-height: 1.5; color: #222">${text}</div>${pixel}`;
}
