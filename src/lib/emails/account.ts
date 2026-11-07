import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import nodemailer from "nodemailer";

/*
 * A person's own mailbox (EmailAccount), connected in Settings > Profile: their emails go out
 * through it, from their own address. Like logging in to Gmail from Outlook: an SMTP server, an
 * address and an app password (a separate password Google makes for one app, that can be revoked).
 *
 * The password has to be read back to send, so it's encrypted (AES-256-GCM), not hashed. The key
 * comes from JWT_SECRET, so there's no extra secret to set up; changing JWT_SECRET means everyone
 * connects their email again.
 */

const key = () => createHash("sha256").update(`flash email accounts:${process.env.JWT_SECRET}`).digest();

// "iv.tag.ciphertext", each base64
export function encryptSecret(text: string) {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key(), iv);
    const encrypted = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
    return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString("base64")).join(".");
}

export function decryptSecret(stored: string) {
    const [iv, tag, encrypted] = stored.split(".").map((part) => Buffer.from(part, "base64"));
    const decipher = createDecipheriv("aes-256-gcm", key(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

export interface MailboxLogin {
    email: string;
    host: string;
    port: number;
    password: string;
}

// An SMTP connection setup for one mailbox. Port 465 is SSL from the start; 587 upgrades with STARTTLS.
// Short timeouts: a wrong server should fail in seconds, not hang the request.
export function smtpFor(login: MailboxLogin) {
    return nodemailer.createTransport({
        host: login.host,
        port: login.port,
        secure: login.port === 465,
        auth: { user: login.email, pass: login.password },
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
    });
}

// Logs in without sending anything: null when it worked, otherwise what went wrong, in words
export async function checkMailbox(login: MailboxLogin) {
    try {
        await smtpFor(login).verify();
        return null;
    } catch (error) {
        return mailboxProblem(error);
    }
}

// A mail server's error as something a person can act on
export function mailboxProblem(error: unknown) {
    const code = (error as { code?: string } | null)?.code;
    if (code === "EAUTH") return "The email provider refused the address or app password. Check both, and that it's an app password, not your normal one.";
    if (code === "ECONNECTION" || code === "ETIMEDOUT" || code === "EDNS" || code === "ESOCKET") {
        return "Couldn't reach that mail server. Check the server and port.";
    }
    return error instanceof Error ? error.message : "Couldn't connect to the mail server";
}
