import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db/prisma";
import { handleRouteError, parseBody, validationError } from "@/lib/api/http";
import { idParamSchema } from "@/lib/validations/common";
import { requireSiteAdmin } from "@/lib/auth/siteAdmin";
import { broadcastChange } from "@/lib/realtime/notify";
import { accessOf, BILLING_CYCLES, PRO_PLANS, TRIAL_DAYS, type BillingCycle } from "@/lib/billing/plans";
import { activatePro } from "@/lib/billing/gate";
import { emailReceipt } from "@/lib/billing/receipts";

type Params = { params: Promise<{ id: string }> };

const SHOWN = 50;
const rupees = (paise: number) => paise / 100;

/**
 * One company, for its panel in Site admin: who owns it, where its plan stands, how much it uses
 * Flash, its people, and every payment it has made (online or recorded by hand).
 */
export async function GET(_req: NextRequest, { params }: Params) {
    try {
        await requireSiteAdmin();

        const id = idParamSchema.safeParse((await params).id);
        if (!id.success) return validationError(id.error);

        const workspace = await prisma.organization.findUnique({
            where: { id: id.data },
            select: {
                id: true,
                name: true,
                createdAt: true,
                currency: true,
                plan: true,
                trialEndsAt: true,
                paidUntil: true,
                billingCycle: true,
                planRequest: true,
                planRequestedAt: true,
                emailAccount: { select: { email: true } },
                _count: { select: { users: true, leads: true, deals: true, contacts: true } },
            },
        });
        if (!workspace) return NextResponse.json({ ok: false, message: "Workspace not found" }, { status: 404 });

        const [members, payments, paidTotal] = await Promise.all([
            prisma.user.findMany({
                where: { organizationId: workspace.id },
                orderBy: [{ isOwner: "desc" }, { createdAt: "asc" }],
                take: SHOWN,
                select: { id: true, name: true, email: true, isOwner: true, createdAt: true, role: { select: { name: true } } },
            }),
            prisma.payment.findMany({ where: { organizationId: workspace.id }, orderBy: { createdAt: "desc" }, take: SHOWN }),
            prisma.payment.aggregate({ where: { organizationId: workspace.id }, _sum: { amount: true } }),
        ]);

        const { _count, emailAccount, ...rest } = workspace;
        const { state, endsAt, daysLeft } = accessOf(workspace);
        return NextResponse.json({
            ok: true,
            data: {
                ...rest,
                access: { state, endsAt, daysLeft },
                counts: _count,
                teamEmail: emailAccount?.email ?? null,
                owner: members.find((member) => member.isOwner) ?? null,
                members,
                payments: payments.map((payment) => ({ ...payment, amount: rupees(payment.amount) })),
                paidTotal: rupees(paidTotal._sum.amount ?? 0),
            },
        });
    } catch (error) {
        return handleRouteError(error, "Get workspace");
    }
}

const changeSchema = z.discriminatedUnion("action", [
    // Pro switched on by hand, after a payment taken another way (UPI, bank transfer, cash): it's
    // recorded as a payment, with what was received (0 for a free month or year) and a reference
    z.object({
        action: z.literal("activate"),
        cycle: z.enum(BILLING_CYCLES as [string, ...string[]]),
        amount: z.coerce.number().finite().min(0).max(10_000_000).optional(),
        note: z.string().trim().max(200).optional(),
    }),
    // more time to try it: another 7 days from now (or from the trial's end, if it hasn't ended).
    // Never for a workspace on Pro: a trial would replace the plan they paid for
    z.object({ action: z.literal("extendTrial") }),
]);

const DAY = 24 * 60 * 60 * 1000;

// A site admin changes a workspace's plan by hand
export async function PUT(req: NextRequest, { params }: Params) {
    try {
        const admin = await requireSiteAdmin();

        const id = idParamSchema.safeParse((await params).id);
        if (!id.success) return validationError(id.error);

        const body = await parseBody(req, changeSchema);
        if (!body.success) return body.response;

        const workspace = await prisma.organization.findUnique({
            where: { id: id.data },
            select: { id: true, name: true, plan: true, paidUntil: true, trialEndsAt: true, users: { where: { isOwner: true }, select: { email: true }, take: 1 } },
        });
        if (!workspace) return NextResponse.json({ ok: false, message: "Workspace not found" }, { status: 404 });

        const now = new Date();
        let message: string;
        if (body.data.action === "activate") {
            const { cycle: picked, amount, note } = body.data;
            const cycle = picked as BillingCycle;
            // the plan's price unless said otherwise, in paise like online payments
            const paise = Math.round((amount ?? PRO_PLANS[cycle].price) * 100);
            const { paidUntil, paymentId } = await prisma.$transaction(async (tx) => {
                const until = await activatePro(workspace.id, cycle, tx);
                const payment = await tx.payment.create({
                    data: {
                        organizationId: workspace.id,
                        paidBy: workspace.users[0]?.email ?? "",
                        method: "MANUAL",
                        cycle,
                        amount: paise,
                        paidUntil: until,
                        note: note || null,
                        recordedBy: admin.email,
                    },
                });
                return { paidUntil: until, paymentId: payment.id };
            });
            // the owner gets their receipt (not for a free month or year)
            await emailReceipt(paymentId);
            message = `${workspace.name} is on Pro until ${paidUntil.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`;
        } else {
            if (accessOf(workspace, now).state === "pro") {
                return NextResponse.json({ ok: false, message: `${workspace.name} is on Pro, so it doesn't need a trial. To give more time, record a payment of 0.` }, { status: 409 });
            }
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
