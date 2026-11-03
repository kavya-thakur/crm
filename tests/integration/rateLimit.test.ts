import { describe, expect, it } from "vitest";
import { redis } from "@/lib/db/redis";
import { tooManyAttempts } from "@/lib/api/rateLimit";

// these need a running Redis (brew services start redis); without one they're skipped
const redisUp = await redis()
    .ping()
    .then(() => true)
    .catch(() => false);

describe.skipIf(!redisUp)("rate limits in Redis", () => {
    it("allows the limit, refuses the next one, and forgets once the window ends", async () => {
        const key = `test:${Date.now()}:${Math.random()}`;

        for (let attempt = 1; attempt <= 3; attempt++) expect(await tooManyAttempts(key, 3, 300)).toBe(false);
        expect(await tooManyAttempts(key, 3, 300)).toBe(true);

        await new Promise((resolve) => setTimeout(resolve, 400));
        expect(await tooManyAttempts(key, 3, 300)).toBe(false);
    });

    it("counts each key on its own", async () => {
        const stamp = `${Date.now()}:${Math.random()}`;
        expect(await tooManyAttempts(`test:a:${stamp}`, 1, 5000)).toBe(false);
        expect(await tooManyAttempts(`test:b:${stamp}`, 1, 5000)).toBe(false);
        expect(await tooManyAttempts(`test:a:${stamp}`, 1, 5000)).toBe(true);
    });
});
