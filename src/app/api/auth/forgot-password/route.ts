import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/db/prisma";
import { parseBody, handleRouteError } from "@/lib/api/http";
import { tooManyAttempts, visitorOf } from "@/lib/api/rateLimit";
import { forgotPasswordSchema } from "@/lib/validations/auth";
import { newResetToken, RESET_LINK_MINUTES } from "@/lib/auth/passwordReset";
import { escapeHtml, sendSystemEmail } from "@/lib/emails/system";
import { isDemoWorkspace } from "@/lib/demo/workspace";

// The same answer whether or not the email has an account, so this can't be used to find out who does
const SENT = { ok: true, message: "If an account uses that email, a link to choose a new password is on its way. It works for an hour." };

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

        // a few links an hour per person, from one place
        if (await tooManyAttempts(`forgot:${visitorOf(req.headers)}:${email}`, 5, 60 * 60 * 1000)) {
            return NextResponse.json({ ok: false, message: "That's a lot of reset emails. Please wait an hour, or check your spam folder." }, { status: 429 });
        }

        const user = await prisma.user.findUnique({ where: { email }, select: { id: true, name: true, email: true, organization: { select: { slug: true } } } });
        // the demo's one shared login keeps its password
        if (!user || isDemoWorkspace(user)) return NextResponse.json(SENT);

        // the site's own address: from the settings in production, so a request can't make the link
        // point somewhere else (its Host header can be anything); this server's address while developing
        const dev = process.env.NODE_ENV !== "production";
        const site = process.env.APP_URL?.replace(/\/$/, "") ?? (dev ? req.nextUrl.origin : null);
        if (!site) {
            console.error("Password reset: APP_URL isn't set, so there's no address to put in the link");
            return NextResponse.json(SENT);
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
            if (dev) console.log(`\n[dev] No SMTP settings, so here's the password reset link for ${user.email}:\n${link}\n`);
            else console.error("Password reset: the SMTP_* settings aren't set, so the email wasn't sent");
        }
        return NextResponse.json(SENT);
    } catch (error) {
        return handleRouteError(error, "Forgot password");
    }
}
