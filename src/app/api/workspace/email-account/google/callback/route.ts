import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { encryptSecret } from "@/lib/emails/account";
import { exchangeGoogleCode, GOOGLE_CALLBACK, GOOGLE_STATE_COOKIE, mayConnectMailbox, siteUrl } from "@/lib/emails/google";

// Where Google sends the admin back: saves the Gmail as the team's mailbox, then back to Settings
// with ?google=connected, or ?google=<what went wrong>. See src/lib/emails/google.ts.
export async function GET(req: NextRequest) {
    const site = siteUrl(req);
    const user = await getCurrentUser();
    if (!user) return NextResponse.redirect(`${site}/login`);

    const params = req.nextUrl.searchParams;
    const back = (result: string) => {
        const res = NextResponse.redirect(`${site}/settings/workspace?google=${encodeURIComponent(result)}`);
        res.cookies.set(GOOGLE_STATE_COOKIE, "", { maxAge: 0, path: GOOGLE_CALLBACK });
        return res;
    };

    if (!mayConnectMailbox(user)) return back("Only an admin can connect the team's email.");
    const state = req.cookies.get(GOOGLE_STATE_COOKIE)?.value;
    if (!state || params.get("state") !== state) return back("That took too long, or started somewhere else. Try connecting again.");
    if (params.get("error")) return back("Google wasn't connected: Flash wasn't given permission.");
    const code = params.get("code");
    if (!code) return back("Google didn't send anything back. Try connecting again.");

    try {
        const result = await exchangeGoogleCode(code, `${site}${GOOGLE_CALLBACK}`);
        if ("problem" in result) return back(result.problem);

        // no server or port: sent through Gmail's API; the refresh token kept where the password would be
        const data = { email: result.email, host: null, port: null, passwordEncrypted: encryptSecret(result.refreshToken) };
        await prisma.emailAccount.upsert({ where: { organizationId: user.organizationId }, create: { ...data, organizationId: user.organizationId }, update: data });
        return back("connected");
    } catch (error) {
        console.error("Connect with Google:", error);
        return back("Couldn't connect Google. Try again.");
    }
}
