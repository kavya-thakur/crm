import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/db/prisma";
import { parseBody, handleRouteError } from "@/lib/api/http";
import { tooManyAttempts, visitorOf } from "@/lib/api/rateLimit";
import { resetPasswordSchema } from "@/lib/validations/auth";
import { hashPassword } from "@/lib/auth/password";
import { findReset } from "@/lib/auth/passwordReset";

// The new password, from a "Forgot password?" link. The link (and any other for this person) stops working.
export async function POST(req: NextRequest) {
    try {
        const body = await parseBody(req, resetPasswordSchema);
        if (!body.success) return body.response;

        // guessing links: a few tries from one place
        if (await tooManyAttempts(`reset:${visitorOf(req.headers)}`, 20, 60 * 60 * 1000)) {
            return NextResponse.json({ ok: false, message: "Too many tries. Please wait an hour." }, { status: 429 });
        }

        const reset = await findReset(body.data.token);
        if (!reset) {
            return NextResponse.json({ ok: false, message: "This link has expired or was already used. Ask for a new one." }, { status: 400 });
        }

        const passwordHash = await hashPassword(body.data.password);
        await prisma.$transaction([
            prisma.user.update({ where: { id: reset.userId }, data: { passwordHash } }),
            prisma.passwordReset.deleteMany({ where: { userId: reset.userId } }),
        ]);

        return NextResponse.json({ ok: true, message: "Password changed. Sign in with your new password." });
    } catch (error) {
        return handleRouteError(error, "Reset password");
    }
}
