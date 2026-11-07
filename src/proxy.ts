import { NextRequest, NextResponse } from "next/server";

// Optimistic check only: real token verification happens in the API routes
export function proxy(req: NextRequest) {
    if (!req.cookies.has("access_token")) {
        return NextResponse.redirect(new URL("/login", req.url));
    }

    return NextResponse.next();
}

export const config = {
    matcher: ["/dashboard/:path*", "/leads/:path*", "/deals/:path*", "/contacts/:path*", "/notes/:path*", "/settings/:path*", "/quote/:path*"],
};
