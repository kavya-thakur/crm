import { NextResponse } from "next/server";

export async function POST() {
    const response = NextResponse.json({
        ok: true,
        message: "Logout successful",
    });

    response.cookies.set("access_token", "", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        expires: new Date(0),
        path: "/",
    });

    // and your own session, if you were logged in as a teammate
    response.cookies.delete("own_access_token");

    return response;
}