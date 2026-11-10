import { NextResponse } from "next/server";

import { prisma } from "@/lib/db/prisma";
import { handleRouteError } from "@/lib/api/http";
import { requireSiteAdmin } from "@/lib/auth/siteAdmin";
import { accessOf } from "@/lib/billing/plans";

const DEMO_SLUG = "flash-demo";
// trials and paid periods ending within this many days: the ones to follow up with
const SOON_DAYS = 7;
const rupees = (paise: number | null) => (paise ?? 0) / 100;

/**
 * Site admin > Overview: how the business is doing. Companies on trial, on Pro and ended; revenue
 * (online and recorded by hand) this month and in all; how many companies have paid; and the
 * trials and Pro plans ending in the next week. The demo workspace isn't counted.
 */
export async function GET() {
    try {
        await requireSiteAdmin();

        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const [workspaces, allTime, thisMonth, payers] = await Promise.all([
            prisma.organization.findMany({
                where: { slug: { not: DEMO_SLUG } },
                select: {
                    id: true,
                    name: true,
                    createdAt: true,
                    plan: true,
                    trialEndsAt: true,
                    paidUntil: true,
                    planRequest: true,
                    users: { where: { isOwner: true }, select: { name: true, email: true }, take: 1 },
                    _count: { select: { users: true } },
                },
            }),
            prisma.payment.aggregate({ _sum: { amount: true }, _count: true }),
            prisma.payment.aggregate({ where: { createdAt: { gte: monthStart } }, _sum: { amount: true }, _count: true }),
            prisma.payment.groupBy({ by: ["organizationId"], where: { amount: { gt: 0 } } }),
        ]);

        const withAccess = workspaces.map((workspace) => ({ ...workspace, access: accessOf(workspace, now) }));
        const counts = { total: withAccess.length, trial: 0, pro: 0, ended: 0 };
        for (const workspace of withAccess) counts[workspace.access.state] += 1;

        const endingSoon = (state: "trial" | "pro") =>
            withAccess
                .filter((workspace) => workspace.access.state === state && workspace.access.daysLeft <= SOON_DAYS)
                .sort((a, b) => a.access.endsAt!.getTime() - b.access.endsAt!.getTime())
                .map(({ id, name, planRequest, users, _count, access }) => ({
                    id,
                    name,
                    owner: users[0] ?? null,
                    users: _count.users,
                    daysLeft: access.daysLeft,
                    endsAt: access.endsAt,
                    wantsPro: planRequest,
                }));

        return NextResponse.json({
            ok: true,
            data: {
                workspaces: counts,
                newThisMonth: workspaces.filter((workspace) => workspace.createdAt >= monthStart).length,
                revenue: {
                    thisMonth: rupees(thisMonth._sum.amount),
                    thisMonthPayments: thisMonth._count,
                    allTime: rupees(allTime._sum.amount),
                    allTimePayments: allTime._count,
                },
                // companies that have paid at least once, out of every company signed up
                payingCustomers: payers.length,
                trialsEnding: endingSoon("trial"),
                proEnding: endingSoon("pro"),
            },
        });
    } catch (error) {
        return handleRouteError(error, "Site admin overview");
    }
}
