import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { updateProfileSchema } from "@/lib/validations/auth";
import { handleRouteError, parseBody } from "@/lib/api/http";

// The signed-in user editing their own profile. No permission needed: it's only ever yourself.
export async function PATCH(req: NextRequest) {
    try {
        const user = await getCurrentUser();

        if (!user) {
            throw new Error("UNAUTHORIZED");
        }

        const body = await parseBody(req, updateProfileSchema);

        if (!body.success) {
            return body.response;
        }

        const updated = await prisma.user.update({
            where: { id: user.id },
            data: { name: body.data.name },
            select: { id: true, name: true, email: true },
        });

        return NextResponse.json({
            ok: true,
            message: "Profile updated",
            data: updated,
        });
    } catch (error) {
        return handleRouteError(error, "Update profile");
    }
}
