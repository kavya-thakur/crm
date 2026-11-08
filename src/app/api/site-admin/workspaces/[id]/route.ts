import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db/prisma";
import { handleRouteError, parseBody, validationError } from "@/lib/api/http";
import { idParamSchema } from "@/lib/validations/common";
import { requireSiteAdmin } from "@/lib/auth/siteAdmin";
import { broadcastChange } from "@/lib/realtime/notify";
import { BILLING_CYCLES, TRIAL_DAYS, type BillingCycle } from "@/lib/billing/plans";
import { activatePro } from "@/lib/billing/gate";

type Params = { params: Promise<{ id: string }> };

const changeSchema = z.discriminatedUnion("action", [
    // they've paid: Pro for a month or a year (added on to a period still running)
    z.object({ action: z.literal("activate"), cycle: z.enum(BILLING_CYCLES as [string, ...string[]]) }),
    // more time to try it: another 7 days from now (or from the trial's end, if it hasn't ended)
    z.object({ action: z.literal("extendTrial") }),
]);

const DAY = 24 * 60 * 60 * 1000;

// A site admin changes a workspace's plan, by hand, until online payments do it
export async function PUT(req: NextRequest, { params }: Params) {
    try {
        await requireSiteAdmin();

        const id = idParamSchema.safeParse((await params).id);
        if (!id.success) return validationError(id.error);

        const body = await parseBody(req, changeSchema);
        if (!body.success) return body.response;

        const workspace = await prisma.organization.findUnique({ where: { id: id.data }, select: { id: true, name: true, plan: true, paidUntil: true, trialEndsAt: true } });
        if (!workspace) return NextResponse.json({ ok: false, message: "Workspace not found" }, { status: 404 });

        const now = new Date();
        let message: string;
        if (body.data.action === "activate") {
            const paidUntil = await activatePro(workspace.id, body.data.cycle as BillingCycle);
            message = `${workspace.name} is on Pro until ${paidUntil.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`;
        } else {
            const from = workspace.plan !== "PRO" && workspace.trialEndsAt > now ? workspace.trialEndsAt : now;
            await prisma.organization.update({ where: { id: workspace.id }, data: { plan: "TRIAL", trialEndsAt: new Date(from.getTime() + TRIAL_DAYS * DAY) } });
            message = `${workspace.name}'s trial is ${TRIAL_DAYS} days longer`;
        }

        // their open pages re-render, so a locked app opens up straight away
        broadcastChange(workspace.id, "billing");
        return NextResponse.json({ ok: true, message });
    } catch (error) {
        return handleRouteError(error, "Change workspace plan");
    }
}
