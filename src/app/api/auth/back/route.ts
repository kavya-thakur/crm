import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { OWN_SESSION_COOKIE, sessionCookie, verifyToken } from "@/lib/auth/jwt";
import { isSiteAdmin } from "@/lib/auth/siteAdmin";
import { prisma } from "@/lib/db/prisma";

/**
 * "Back to my account", after logging in as a teammate: your own session, kept aside in its
 * cookie, becomes the session again, for as long as it had left. If it has run out (or doesn't
 * check out), you're signed out instead.
 */
export async function POST() {
    const store = await cookies();
    const own = store.get(OWN_SESSION_COOKIE)?.value;
    const current = await getCurrentUser();
    store.delete(OWN_SESSION_COOKIE);

    let ownId: unknown = null;
    let expiresAt = 0;
    try {
        const payload = own ? verifyToken(own) : null;
        if (payload && typeof payload === "object") {
            ownId = payload.userId;
            expiresAt = payload.exp ?? 0;
        }
    } catch {
        // expired or tampered with
    }

    const secondsLeft = expiresAt - Math.floor(Date.now() / 1000);
    // only back to the person who started it
    if (!own || secondsLeft <= 0 || !current?.actingAsId || ownId !== current.actingAsId) {
        store.delete("access_token");
        return NextResponse.json({ ok: true, signedOut: true });
    }

    store.set("access_token", own, sessionCookie(secondsLeft));
    // back where you started: the site admin page, or your workspace's Members
    const me = await prisma.user.findUnique({ where: { id: current.actingAsId }, select: { email: true, isSiteAdmin: true, organizationId: true } });
    const fromSiteAdmin = me && isSiteAdmin(me) && me.organizationId !== current.organizationId;
    return NextResponse.json({ ok: true, signedOut: false, goTo: fromSiteAdmin ? "/settings/site-admin" : "/settings/members" });
}
