import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET!;

// a month, so nobody is signed out every day
export const SESSION_SECONDS = 60 * 60 * 24 * 30;
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

// Was this session signed in (`iat`, the token's "issued at" in seconds) before `moment`?
// Used with passwordChangedAt: a session from before a password change is over.
export const signedBefore = (iat: number, moment: Date | null) => !!moment && iat < Math.floor(moment.getTime() / 1000);

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

// A cookie from a raw Cookie header (the custom server and sockets, outside Next's cookies())
export function cookieValue(header: string | undefined, name: string) {
    const pair = header?.split(";").find((part) => part.trim().startsWith(`${name}=`));
    return pair ? decodeURIComponent(pair.trim().slice(name.length + 1)) : undefined;
}

// Who's signed in, from the same access_token cookie the API reads. Null when nobody is.
// `actingAs`: who really is, while logged in as someone else ("Log in as")
export function signedIn(cookieHeader: string | undefined) {
    const token = cookieValue(cookieHeader, "access_token");
    if (!token) return null;
    try {
        const payload = verifyToken(token);
        if (typeof payload !== "object" || typeof payload.userId !== "number" || typeof payload.organizationId !== "number") return null;
        return {
            userId: payload.userId as number,
            organizationId: payload.organizationId as number,
            actingAs: typeof payload.actingAs === "number" ? (payload.actingAs as number) : null,
            signedAt: typeof payload.iat === "number" ? payload.iat : 0,
        };
    } catch {
        return null;
    }
}
