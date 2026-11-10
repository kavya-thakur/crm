import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/db/prisma";
import { parseBody, handleRouteError } from "@/lib/api/http";
import { tooManyAttempts, visitorOf } from "@/lib/api/rateLimit";
import { forgotPasswordSchema } from "@/lib/validations/auth";
import { newResetToken, RESET_LINK_MINUTES } from "@/lib/auth/passwordReset";
import { escapeHtml, sendSystemEmail } from "@/lib/emails/system";
import { isDemoWorkspace } from "@/lib/demo/workspace";

const HOUR = 60 * 60 * 1000;
// the site can't send it (APP_URL or SMTP_* missing on the server): said, never a pretend "sent"
const NOT_SET_UP = { ok: false, message: "Password reset emails aren't working right now. Please try again later." };
const SENT = { ok: true, message: "A link to choose a new password is on its way. It works for an hour." };

/**
 * "Forgot password?": emails a one-time link to choose a new password. Sent from Flash's own
 * mailbox (SMTP_* settings, src/lib/emails/system.ts). Without one, in development the link is
 * printed in the server's terminal instead, so it can be tried locally.
 */
export async function POST(req: NextRequest) {
    try {
        const body = await parseBody(req, forgotPasswordSchema);
        if (!body.success) return body.response;
        const { email } = body.data;

        const visitor = visitorOf(req.headers);
        // any try, sent or not: so nobody can check thousands of emails for accounts
        if (await tooManyAttempts(`forgot-try:${visitor}`, 30, HOUR)) {
            return NextResponse.json({ ok: false, message: "Too many tries. Please wait an hour and try again." }, { status: 429 });
        }

        const user = await prisma.user.findUnique({ where: { email }, select: { id: true, name: true, email: true, organization: { select: { slug: true } } } });
        // Said plainly, nothing is sent. (Sign up already tells anyone whether an email has an
        // account, so a vague answer here would only confuse people, not protect them.)
        if (!user) return NextResponse.json({ ok: false, message: "No account uses this email. Check the spelling, or sign up." }, { status: 404 });
        // the demo's one shared login keeps its password
        if (isDemoWorkspace(user)) return NextResponse.json({ ok: false, message: "The demo's password can't be changed." }, { status: 400 });

        // a few emails an hour to one inbox; counted only when one is really sent
        if (await tooManyAttempts(`forgot:${visitor}:${email}`, 5, HOUR)) {
            return NextResponse.json({ ok: false, message: "That's a lot of reset emails. Please wait an hour, or check your spam folder." }, { status: 429 });
        }

        // the site's own address: from the settings in production, so a request can't make the link
        // point somewhere else (its Host header can be anything); this server's address while developing
        const dev = process.env.NODE_ENV !== "production";
        const site = process.env.APP_URL?.replace(/\/$/, "") ?? (dev ? req.nextUrl.origin : null);
        if (!site) {
            console.error("Password reset: APP_URL isn't set, so there's no address to put in the link");
            return NextResponse.json(NOT_SET_UP, { status: 503 });
        }

        const link = `${site}/reset-password?token=${await newResetToken(user.id)}`;
        const firstName = user.name.split(" ")[0];
        const sent = await sendSystemEmail({
            to: user.email,
            subject: "Choose a new password for Flash",
            text: `Hi ${firstName},\n\nSomeone (hopefully you) asked to reset the password for ${user.email} on Flash. Choose a new one here:\n\n${link}\n\nThe link works once, for ${RESET_LINK_MINUTES} minutes. If it wasn't you, ignore this email: your password stays the same.\n\nFlash`,
            html: `<p>Hi ${escapeHtml(firstName)},</p>
<p>Someone (hopefully you) asked to reset the password for ${escapeHtml(user.email)} on Flash.</p>
<p><a href="${link}" style="display:inline-block;padding:10px 18px;border-radius:999px;background:#1c1c1c;color:#ffffff;text-decoration:none;font-weight:600">Choose a new password</a></p>
<p style="color:#666">The link works once, for ${RESET_LINK_MINUTES} minutes. If it wasn't you, ignore this email: your password stays the same.</p>`,
        });

        if (!sent) {
            if (!dev) {
                console.error("Password reset: the SMTP_* settings aren't set, so the email wasn't sent");
                return NextResponse.json(NOT_SET_UP, { status: 503 });
            }
            console.log(`\n[dev] No SMTP settings, so here's the password reset link for ${user.email}:\n${link}\n`);
        }
        return NextResponse.json(SENT);
    } catch (error) {
        return handleRouteError(error, "Forgot password");
    }
}
