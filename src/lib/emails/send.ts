import { randomBytes } from "node:crypto";

import { prisma } from "@/lib/db/prisma";
import { isDemoWorkspace } from "@/lib/demo/workspace";
import { broadcastChange, notify } from "@/lib/realtime/notify";
import { emailsQueue } from "@/lib/jobs/queues";
import { decryptSecret, mailboxProblem, smtpFor } from "@/lib/emails/account";

/*
 * Sending the CRM's emails. Each person connects their own mailbox in Settings > Profile
 * (src/lib/emails/account.ts), and their emails go out through it: from their own address, so
 * replies land in their own inbox, and nobody sends from anyone else's account.
 * Run by the worker (src/lib/jobs/worker.ts) for each id on the "emails" queue; see docs/EMAIL.md.
 * APP_URL (the site's address) turns on open tracking.
 */

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

// Whether this person can send email from the CRM: they've connected a mailbox (the demo
// workspace always can, since it never really sends)
export async function canSendEmail(user: { id: number; organization: { slug: string } }) {
    return isDemoWorkspace(user) || (await prisma.emailAccount.count({ where: { userId: user.id } })) > 0;
}

export const NOT_CONNECTED = "Connect your email in Settings → Profile to send emails from Flash";

export async function sendEmail(emailId: number) {
    const email = await prisma.email.findUnique({
        where: { id: emailId },
        include: { sentBy: { select: { name: true, emailAccount: true } }, organization: { select: { slug: true } } },
    });
    // gone (its lead was deleted), or already dealt with (a retry after it went out)
    if (!email || email.status !== "QUEUED") return;

    // the public demo is open to anyone: it never emails real people
    if (isDemoWorkspace(email)) {
        await prisma.email.update({ where: { id: email.id }, data: { status: "SKIPPED", error: "Demo workspace: emails aren't really sent" } });
        broadcastChange(email.organizationId, "emails");
        return;
    }

    // disconnected (or the sender has left) since it was written: nothing to retry
    const account = email.sentBy?.emailAccount;
    if (!account) return failEmail(email.id, NOT_CONNECTED);

    const login = { email: account.email, host: account.host, port: account.port, password: decryptSecret(account.passwordEncrypted) };
    try {
        await smtpFor(login).sendMail({
            from: { name: email.sentBy!.name, address: account.email },
            to: email.to,
            subject: email.subject,
            text: email.body,
            html: toHtml(email.body, email.trackingToken),
        });
    } catch (error) {
        // a revoked app password won't work on the next try either; anything else (a blip) is retried
        if ((error as { code?: string }).code === "EAUTH") return failEmail(email.id, `${mailboxProblem(error)} Reconnect it in Settings → Profile.`);
        throw error;
    }

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
