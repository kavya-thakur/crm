import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { handleRouteError, parseBody } from "@/lib/api/http";
import { onboardingSchema } from "@/lib/validations/auth";

// The last step of /onboarding: names the workspace and its owner, sets the currency, and marks
// setup done. Only for someone who just signed up, so it can't be used to rename a workspace later.
export async function POST(req: NextRequest) {
    try {
        const user = await getCurrentUser();

        if (!user) {
            throw new Error("UNAUTHORIZED");
        }
        // finished already, or a site admin "logged in as" them: not theirs to fill in
        if (!user.needsOnboarding || user.actingAsId) {
            throw new Error("FORBIDDEN");
        }

        const body = await parseBody(req, onboardingSchema);

        if (!body.success) {
            return body.response;
        }

        const { workspaceName, name, currency } = body.data;

        await prisma.$transaction([
            prisma.organization.update({
                where: { id: user.organizationId },
                data: { name: workspaceName, currency },
            }),
            prisma.user.update({
                where: { id: user.id },
                data: { name, needsOnboarding: false },
            }),
        ]);

        return NextResponse.json({ ok: true, message: "Workspace ready" });
    } catch (error) {
        return handleRouteError(error, "Finish onboarding");
    }
}
