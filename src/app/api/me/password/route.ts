import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { createToken, SESSION_SECONDS, sessionCookie } from "@/lib/auth/jwt";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { changePasswordSchema } from "@/lib/validations/auth";
import { handleRouteError, parseBody } from "@/lib/api/http";
import { tooManyAttempts } from "@/lib/api/rateLimit";
import { getSocketServer, userRoom } from "@/lib/realtime/notify";
import { assertNotDemo } from "@/lib/demo/workspace";

export async function PATCH(req: NextRequest) {
    try {
        const user = await getCurrentUser();

        if (!user) {
            throw new Error("UNAUTHORIZED");
        }
        // the demo workspace stays the same for every visitor
        assertNotDemo(user);
        // it signs this account out everywhere else, which would include the real person
        if (user.actingAsId) {
            return NextResponse.json({ ok: false, message: "Go back to your own account to change a password" }, { status: 403 });
        }

        const body = await parseBody(req, changePasswordSchema);

        if (!body.success) {
            return body.response;
        }

        const { currentPassword, newPassword } = body.data;

        // a few tries at the current password, so nobody at an unlocked laptop can script guesses
        if (await tooManyAttempts(`change-password:${user.id}`, 10, 15 * 60 * 1000)) {
            return NextResponse.json({ ok: false, message: "Too many tries. Please wait 15 minutes and try again." }, { status: 429 });
        }

        // Being signed in isn't enough: someone at an unlocked laptop shouldn't be able to lock you out
        const isPasswordValid = await verifyPassword(currentPassword, user.passwordHash);

        if (!isPasswordValid) {
            return NextResponse.json(
                {
                    ok: false,
                    message: "Your current password is not correct",
                    errors: { currentPassword: ["Your current password is not correct"] },
                },
                { status: 400 }
            );
        }

        // every other session signed in before now ends (getCurrentUser); this one gets a fresh token
        await prisma.user.update({
            where: { id: user.id },
            data: { passwordHash: await hashPassword(newPassword), passwordChangedAt: new Date() },
        });
        // close their open live connections too; this browser reconnects with its new token (LiveUpdates)
        getSocketServer()?.in(userRoom(user.id)).disconnectSockets();

        const response = NextResponse.json({ ok: true, message: "Password changed. You've been signed out everywhere else." });
        response.cookies.set("access_token", createToken({ userId: user.id, organizationId: user.organizationId }), sessionCookie(SESSION_SECONDS));
        return response;
    } catch (error) {
        return handleRouteError(error, "Change password");
    }
}
