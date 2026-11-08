import { smtpFor } from "./account";

/*
 * Flash's own mailbox, for the emails the app itself sends (a password reset link), as opposed to
 * the ones people send to their leads from their own mailbox (account.ts). Set in the server's
 * settings: SMTP_HOST, SMTP_PORT (465 or 587), SMTP_USER, SMTP_PASS (for Gmail, an app password),
 * and optionally SMTP_FROM to send from another address.
 */

export function systemMailConfigured() {
    return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

// Sends it, or returns false when the mailbox isn't set up
export async function sendSystemEmail(message: { to: string; subject: string; text: string; html: string }) {
    if (!systemMailConfigured()) return false;
    const user = process.env.SMTP_USER!;
    const mailer = smtpFor({ email: user, host: process.env.SMTP_HOST!, port: Number(process.env.SMTP_PORT) || 465, password: process.env.SMTP_PASS! });
    await mailer.sendMail({ from: `Flash <${process.env.SMTP_FROM || user}>`, ...message });
    return true;
}

// For putting someone's text (a name) into an email's HTML
export function escapeHtml(text: string) {
    return text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}
