import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { idParamSchema } from "@/lib/validations/common";
import { handleRouteError, validationError } from "@/lib/api/http";

export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const user = await getCurrentUser();

        if (!user) {
            throw new Error("UNAUTHORIZED");
        }

        const id = idParamSchema.safeParse((await params).id);

        if (!id.success) {
            return validationError(id.error);
        }

        // scoped to this user: nothing to find (or delete) if it's someone else's
        const { count } = await prisma.savedFilter.deleteMany({
            where: { id: id.data, userId: user.id },
        });

        if (count === 0) {
            return NextResponse.json(
                { ok: false, message: "Saved filter not found" },
                { status: 404 }
            );
        }

        return NextResponse.json({
            ok: true,
            message: "Saved filter deleted successfully",
        });
    } catch (error) {
        return handleRouteError(error, "Delete saved filter");
    }
}
