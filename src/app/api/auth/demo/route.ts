import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { createToken, SESSION_SECONDS, sessionCookie } from "@/lib/auth/jwt";
import { tooManyAttempts, visitorOf } from "@/lib/api/rateLimit";
import { DEMO_EMAIL, DEMO_SLUG } from "@/lib/demo/workspace";

/**
 * One-click "Explore the demo": /api/auth/demo signs the visitor in to the demo workspace as
 * John Doe, its manager, and opens the dashboard.
 * A plain link, so it works from the landing page, the login page or a README. Signs in only
 * to the demo workspace, whose people are fixed; nothing here can reach a real one.
 */
export async function GET(req: NextRequest) {
    // a relative Location: req.url's host is "localhost" on the server, not the site's address
    const redirect = (to: string) => new NextResponse(null, { status: 303, headers: { Location: to } });
    const back = (reason: string) => redirect(`/login?demo=${reason}`);

    // the demo workspace's own person, never anyone else (the email is unique across Flash).
    // A plain link a visitor clicked, so a database or Redis that's down (or still waking up)
    // sends them back to the login page with a message, never to a blank error page
    let user: { id: number; organizationId: number } | null;
    try {
        if (await tooManyAttempts(`demo:${visitorOf(req.headers)}`, 30, 10 * 60 * 1000)) return back("busy");
        user = await prisma.user.findFirst({
            where: { email: DEMO_EMAIL, organization: { slug: DEMO_SLUG } },
            select: { id: true, organizationId: true },
        });
    } catch (error) {
        console.error("Demo sign-in:", error);
        return back("unavailable");
    }
    if (!user) return back("unavailable");

    const response = redirect("/dashboard");
    // the same login cookie as a normal sign-in
    response.cookies.set("access_token", createToken({ userId: user.id, organizationId: user.organizationId }), sessionCookie(SESSION_SECONDS));
    return response;
}
