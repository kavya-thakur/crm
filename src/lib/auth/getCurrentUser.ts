import { cache } from "react";
import { cookies } from "next/headers";
import { signedBefore, verifyToken } from "@/lib/auth/jwt";
import { prisma } from "@/lib/db/prisma";
import { isSiteAdmin } from "@/lib/auth/siteAdmin";

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

        // signed in before the password last changed (or was reset): that session is over
        const iat = typeof payload.iat === "number" ? payload.iat : 0;
        if (signedBefore(iat, user.passwordChangedAt)) {
            return null;
        }

        // while someone is logged in as this person ("Log in as"): who that really is
        const actingAsId = "actingAs" in payload && typeof payload.actingAs === "number" ? payload.actingAs : null;

        // ...and they must still be allowed to: the owner, someone the owner still lets, or a site
        // admin. Taking that away (or deleting them) ends the session at once, not when its hour is up
        if (actingAsId) {
            const actor = await prisma.user.findUnique({
                where: { id: actingAsId },
                select: { organizationId: true, isOwner: true, canLogInAs: true, isSiteAdmin: true, email: true, passwordChangedAt: true },
            });
            const allowed = !!actor && (isSiteAdmin(actor) || (actor.organizationId === user.organizationId && (actor.isOwner || actor.canLogInAs)));
            if (!allowed || signedBefore(iat, actor.passwordChangedAt)) {
                return null;
            }
        }

        return { ...user, actingAsId };
    } catch {
        return null;
    }
});
