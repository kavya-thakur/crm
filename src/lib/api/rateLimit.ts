import { redis } from "@/lib/db/redis";

/**
 * How often one visitor (or user) may do something: at most `limit` times per `windowMs`.
 * Returns true when this attempt is one too many.
 *
 * The count lives in Redis, so it survives restarts and is shared by every server:
 * INCR adds one to the key "ratelimit:<key>" (creating it at 1), and the first attempt sets
 * it to expire when the window ends, which resets the count. A "fixed window": simple and
 * plenty for stopping bots and password guessing.
 *
 * If Redis is down, the attempt is allowed: better an unlimited form for a minute than a
 * site that's down because its rate limiter is.
 */
export async function tooManyAttempts(key: string, limit: number, windowMs: number) {
    const name = `ratelimit:${key}`;
    try {
        const count = await redis().incr(name);
        if (count === 1) await redis().pexpire(name, windowMs);
        return count > limit;
    } catch {
        return false;
    }
}

// Who's asking, as far as we can tell: the first address in X-Forwarded-For (set by the
// host's proxy when deployed), or "unknown" locally
export function visitorOf(headers: Headers) {
    return headers.get("x-forwarded-for")?.split(",")[0].trim() || headers.get("x-real-ip") || "unknown";
}
