import type { NextRequest } from "next/server";
import nodemailer from "nodemailer";
import type Mail from "nodemailer/lib/mailer";

import type { CurrentUser } from "@/lib/auth/requirePermission";
import { hasPermission } from "@/lib/auth/requirePermission";
import { isDemoWorkspace } from "@/lib/demo/workspace";

/*
 * "Connect with Google": the team's Gmail, connected without an app password, and sent through
 * Gmail's API, an ordinary HTTPS request (Render's free plan blocks SMTP's mail ports).
 *  1. /api/workspace/email-account/google sends the admin to Google's "Flash wants to send email
 *     on your behalf" page.
 *  2. Google sends them back to …/google/callback with a code; the server swaps it for the address
 *     and a refresh token (a lasting key that can only send, kept encrypted in EmailAccount).
 *  3. Each email: the refresh token gets an access token (good for an hour), and the email goes to
 *     Gmail's messages/send. If the admin takes the access back, Google answers invalid_grant.
 * Needs GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET (a Google Cloud OAuth client, "Web application",
 * with the callback below as a redirect URI).
 */

export const GOOGLE_CALLBACK = "/api/workspace/email-account/google/callback";
export const GOOGLE_STATE_COOKIE = "google_connect_state";
const SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";

export const googleConfigured = () => Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

// The site's own address: APP_URL when set, so the redirect URI matches what Google has on file
// exactly (behind Render's proxy the request's own origin isn't the public one)
export const siteUrl = (req: NextRequest) => process.env.APP_URL?.replace(/\/$/, "") ?? req.nextUrl.origin;

// Same rule as connecting with an app password: an admin, as themselves, outside the demo
export const mayConnectMailbox = (user: CurrentUser) => !isDemoWorkspace(user) && hasPermission(user, "workspace:manage") && !user.actingAsId;

// Google's consent page. prompt=consent so Google gives a refresh token every time, not only the first.
export function googleConsentUrl(redirectUri: string, state: string) {
    const params = new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!,
        redirect_uri: redirectUri,
        response_type: "code",
        scope: `openid email ${SEND_SCOPE}`,
        access_type: "offline",
        prompt: "consent",
        state,
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

// Google's token endpoint; its error code ("invalid_grant") is on the thrown error's `code`
async function tokenRequest(fields: Record<string, string>) {
    const res = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!, ...fields }),
        signal: AbortSignal.timeout(10_000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(`Google refused (${res.status}): ${data.error_description ?? data.error ?? ""}`), { code: data.error });
    return data;
}

// The code Google sent back, swapped for the Gmail address and a refresh token; or what's wrong, in words
export async function exchangeGoogleCode(code: string, redirectUri: string): Promise<{ problem: string } | { email: string; refreshToken: string }> {
    const tokens = await tokenRequest({ code, redirect_uri: redirectUri, grant_type: "authorization_code" });
    // Google lets people untick "send email" on its page
    if (!String(tokens.scope).split(" ").includes(SEND_SCOPE)) return { problem: "Tick \"Send email on your behalf\" on Google's page, so Flash can send from it." };
    if (!tokens.refresh_token || !tokens.id_token) return { problem: "Google didn't give Flash a lasting connection. Try again." };
    // the id token came straight from Google over HTTPS, so what it says can be read as it is
    const { email, email_verified } = JSON.parse(Buffer.from(tokens.id_token.split(".")[1], "base64url").toString());
    if (!email || !email_verified) return { problem: "That Google account has no verified email address." };
    return { email: String(email).toLowerCase(), refreshToken: String(tokens.refresh_token) };
}

// Sends one email from the connected Gmail. Taken-back access throws with code "EAUTH", like a refused SMTP password.
export async function sendWithGmail(refreshToken: string, mail: Mail.Options) {
    let accessToken: string;
    try {
        accessToken = (await tokenRequest({ refresh_token: refreshToken, grant_type: "refresh_token" })).access_token;
    } catch (error) {
        if ((error as { code?: string }).code === "invalid_grant") throw Object.assign(new Error("Google no longer lets Flash send from this Gmail."), { code: "EAUTH" });
        throw error;
    }

    // Nodemailer only builds the email here (headers, text and HTML parts); Gmail sends it
    const built = await nodemailer.createTransport({ streamTransport: true, buffer: true }).sendMail(mail);
    const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
        method: "POST",
        headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
        body: JSON.stringify({ raw: (built.message as Buffer).toString("base64url") }),
        signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`Gmail refused the email (${res.status}): ${(await res.text().catch(() => "")).slice(0, 300)}`);
}
