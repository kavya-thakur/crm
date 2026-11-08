import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { handleRouteError, parseBody } from "@/lib/api/http";
import { assertNotDemo } from "@/lib/demo/workspace";
import { BILLING_CYCLES } from "@/lib/billing/plans";

const requestSchema = z.object({ cycle: z.enum(BILLING_CYCLES as [string, ...string[]]) });

/**
 * The owner asks for Pro, monthly or yearly. Until online payments are added, this is a request:
 * a site admin sees it (Settings > Site admin > Workspaces), takes the payment and switches Pro on.
 * Open even while the workspace is locked (src/lib/billing/gate.ts).
 */
export async function POST(req: NextRequest) {
    try {
        const user = await getCurrentUser();
        if (!user) throw new Error("UNAUTHORIZED");
        assertNotDemo(user);
        // the one who pays; while logged in as them, it's still only theirs to decide
        if (!user.isOwner || user.actingAsId) {
            return NextResponse.json({ ok: false, message: "Only the workspace owner can choose a plan" }, { status: 403 });
        }

        const body = await parseBody(req, requestSchema);
        if (!body.success) return body.response;

        await prisma.organization.update({ where: { id: user.organizationId }, data: { planRequest: body.data.cycle, planRequestedAt: new Date() } });
        return NextResponse.json({ ok: true, message: "Request sent" });
    } catch (error) {
        return handleRouteError(error, "Request a plan");
    }
}
