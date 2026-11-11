import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { GOOGLE_CALLBACK, GOOGLE_STATE_COOKIE, googleConfigured, googleConsentUrl, mayConnectMailbox, siteUrl } from "@/lib/emails/google";

// "Connect with Google" (Settings > Workspace): sends the admin to Google's consent page. See src/lib/emails/google.ts.
export async function GET(req: NextRequest) {
    const site = siteUrl(req);
    const user = await getCurrentUser();
    if (!user) return NextResponse.redirect(`${site}/login`);

    const back = (message: string) => NextResponse.redirect(`${site}/settings/workspace?google=${encodeURIComponent(message)}`);
    if (!mayConnectMailbox(user)) return back("Only an admin can connect the team's email.");
    if (!googleConfigured()) return back("Connecting Google isn't set up on this server yet.");

    // a random value Google hands back as it is: the callback only accepts the one this browser was given,
    // so nobody can send an admin to the callback with their own Gmail's code
    const state = randomBytes(16).toString("base64url");
    const res = NextResponse.redirect(googleConsentUrl(`${site}${GOOGLE_CALLBACK}`, state));
    res.cookies.set(GOOGLE_STATE_COOKIE, state, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 10 * 60,
        path: GOOGLE_CALLBACK,
    });
    return res;
}
