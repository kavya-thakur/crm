import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/db/prisma";

/*
 * "Forgot password?" links. The link carries a random secret; the database keeps only its hash
 * (sha256), the way it keeps a password's, so nobody can use a copy of the database to reset
 * anyone. A link works once, for an hour, and asking again replaces it.
 */

export const RESET_LINK_MINUTES = 60;

const hash = (token: string) => createHash("sha256").update(token).digest("hex");

// A new link's secret for this person (their older links stop working)
export async function newResetToken(userId: number) {
    const token = randomBytes(32).toString("base64url");
    await prisma.$transaction([
        prisma.passwordReset.deleteMany({ where: { userId } }),
        prisma.passwordReset.create({ data: { userId, tokenHash: hash(token), expiresAt: new Date(Date.now() + RESET_LINK_MINUTES * 60_000) } }),
    ]);
    return token;
}

// The link's reset, if it's real and still usable
export function findReset(token: string) {
    return prisma.passwordReset.findFirst({ where: { tokenHash: hash(token), expiresAt: { gt: new Date() } }, select: { id: true, userId: true } });
}
