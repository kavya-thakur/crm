import { cache } from "react";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/auth/jwt";
import { prisma } from "@/lib/db/prisma";

// cache(): the layout and the page both ask for the user, but the DB is hit once per request
export const getCurrentUser = cache(async () => {
    const cookieStore = await cookies();

    const token = cookieStore.get("access_token")?.value;

    if (!token) {
        return null;
    }

    try {
        const payload = verifyToken(token);

        if (
            typeof payload !== "object" ||
            !("userId" in payload) ||
            typeof payload.userId !== "number"
        ) {
            return null;
        }

        const user = await prisma.user.findUnique({
            where: {
                id: payload.userId,
            },
            include: {
                organization: true,
                role: {
                    include: {
                        permissions: {
                            include: {
                                permission: true,
                            },
                        },
                    },
                },
            },
        });

        if (!user) {
            return null;
        }

        // while someone is logged in as this person ("Log in as"): who that really is
        const actingAsId = "actingAs" in payload && typeof payload.actingAs === "number" ? payload.actingAs : null;

        return { ...user, actingAsId };
    } catch {
        return null;
    }
});
