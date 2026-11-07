import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET!;

export const SESSION_SECONDS = 60 * 60 * 24;
// "Log in as" a teammate lasts this long, then it's back to the sign-in page
export const LOG_IN_AS_SECONDS = 60 * 60;
// While logged in as someone, your own session waits in this cookie, for "Back to my account"
export const OWN_SESSION_COOKIE = "own_access_token";

export function createToken(
    payload: {
        userId: number;
        organizationId: number;
        // set while the owner (or someone they allowed) is logged in as this person: who really is
        actingAs?: number;
    },
    seconds = SESSION_SECONDS,
) {
    return jwt.sign(payload, JWT_SECRET, {
        expiresIn: seconds,
    });
}

export function verifyToken(token: string) {
    return jwt.verify(token, JWT_SECRET);
}

// How the session cookies are set, for as long as their token lasts
export function sessionCookie(seconds: number) {
    return {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax" as const,
        maxAge: seconds,
        path: "/",
    };
}
