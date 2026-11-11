import { smtpFor } from "./account";

/*
 * Flash's own emails (a password reset link, "your trial ends in 3 days"), as opposed to the ones
 * people send to their leads from the team mailbox (account.ts). Two ways to send them:
 *  - Brevo, when BREVO_API_KEY is set: an ordinary HTTPS request, so it works where mail ports are
 *    blocked (Render's free plan blocks SMTP). Used in production.
 *  - Otherwise SMTP: SMTP_HOST, SMTP_PORT (465 or 587), SMTP_USER, SMTP_PASS (for Gmail, an app
 *    password). Used locally.
 * Either way it's sent from SMTP_FROM, or SMTP_USER (for Brevo, an address verified as a sender there).
 */

const sender = () => process.env.SMTP_FROM || process.env.SMTP_USER;

export function systemMailConfigured() {
    if (process.env.BREVO_API_KEY) return Boolean(sender());
    return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

type SystemEmail = { to: string; subject: string; text: string; html: string };

// Sends it, or returns false when neither way is set up. Throws when sending fails.
export async function sendSystemEmail(message: SystemEmail) {
    if (!systemMailConfigured()) return false;
    if (process.env.BREVO_API_KEY) await sendWithBrevo(message);
    else {
        const user = process.env.SMTP_USER!;
        const mailer = smtpFor({ email: user, host: process.env.SMTP_HOST!, port: Number(process.env.SMTP_PORT) || 465, password: process.env.SMTP_PASS! });
        await mailer.sendMail({ from: `Flash <${sender()}>`, ...message });
    }
    return true;
}

// Brevo's transactional email API: https://developers.brevo.com/reference/sendtransacemail
async function sendWithBrevo({ to, subject, text, html }: SystemEmail) {
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: { "api-key": process.env.BREVO_API_KEY!, "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ sender: { name: "Flash", email: sender() }, to: [{ email: to }], subject, textContent: text, htmlContent: html }),
        // a slow provider fails the request in seconds instead of hanging it
        signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
        // Brevo says why: an unverified sender, a blocked IP, an expired key...
        const reason = await res.text().catch(() => "");
        throw new Error(`Brevo refused the email (${res.status}): ${reason.slice(0, 300)}`);
    }
}

// For putting someone's text (a name) into an email's HTML
export function escapeHtml(text: string) {
    return text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}
