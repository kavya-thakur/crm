import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { createToken } from "@/lib/auth/jwt";
import { tooManyAttempts, visitorOf } from "@/lib/api/rateLimit";
import { DEMO_EMAIL, DEMO_SLUG } from "@/lib/demo/workspace";

/**
 * One-click "Explore the demo": /api/auth/demo signs the visitor in to the demo workspace as
 * John Doe, its manager, and opens the dashboard.
 * A plain link, so it works from the landing page, the login page or a README. Signs in only
 * to the demo workspace, whose people are fixed; nothing here can reach a real one.
 */
export async function GET(req: NextRequest) {
    const back = (reason: string) => NextResponse.redirect(new URL(`/login?demo=${reason}`, req.url), 303);

    if (await tooManyAttempts(`demo:${visitorOf(req.headers)}`, 30, 10 * 60 * 1000)) return back("busy");

    // the demo workspace's own person, never anyone else (the email is unique across Flash)
    const user = await prisma.user.findFirst({
        where: { email: DEMO_EMAIL, organization: { slug: DEMO_SLUG } },
        select: { id: true, organizationId: true },
    });
    if (!user) return back("unavailable");

    const response = NextResponse.redirect(new URL("/dashboard", req.url), 303);
    // the same login cookie as a normal sign-in
    response.cookies.set("access_token", createToken({ userId: user.id, organizationId: user.organizationId }), {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 60 * 60 * 24,
        path: "/",
    });
    return response;
}
