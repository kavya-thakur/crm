import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { changePasswordSchema } from "@/lib/validations/auth";
import { handleRouteError, parseBody } from "@/lib/api/http";

export async function PATCH(req: NextRequest) {
    try {
        const user = await getCurrentUser();

        if (!user) {
            throw new Error("UNAUTHORIZED");
        }

        const body = await parseBody(req, changePasswordSchema);

        if (!body.success) {
            return body.response;
        }

        const { currentPassword, newPassword } = body.data;

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

        await prisma.user.update({
            where: { id: user.id },
            data: { passwordHash: await hashPassword(newPassword) },
        });

        return NextResponse.json({ ok: true, message: "Password changed" });
    } catch (error) {
        return handleRouteError(error, "Change password");
    }
}
