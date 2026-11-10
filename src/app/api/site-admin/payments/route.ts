import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/generated/prisma/client";
import { handleRouteError, validationError } from "@/lib/api/http";
import { requireSiteAdmin } from "@/lib/auth/siteAdmin";

const PAGE_SIZE = 50;

const querySchema = z.object({
    // a company, who paid, a Razorpay id or a manual reference
    search: z.string().trim().max(100).optional(),
    method: z.enum(["RAZORPAY", "MANUAL"]).optional(),
    period: z.enum(["thisMonth", "lastMonth"]).optional(),
    page: z.coerce.number().int().min(1).max(10_000).default(1),
});

// Site admin > Payments: every payment, newest first, with the total of what's listed
export async function GET(req: NextRequest) {
    try {
        await requireSiteAdmin();

        const params = req.nextUrl.searchParams;
        const query = querySchema.safeParse({
            search: params.get("search") || undefined,
            method: params.get("method") || undefined,
            period: params.get("period") || undefined,
            page: params.get("page") ?? undefined,
        });
        if (!query.success) return validationError(query.error);
        const { search, method, period, page } = query.data;

        // calendar months, the same as the overview's "this month"
        const now = new Date();
        const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const createdAt =
            period === "thisMonth" ? { gte: thisMonth } : period === "lastMonth" ? { gte: new Date(now.getFullYear(), now.getMonth() - 1, 1), lt: thisMonth } : undefined;

        const contains = { contains: search, mode: "insensitive" as const };
        const where: Prisma.PaymentWhereInput = {
            ...(method && { method }),
            ...(createdAt && { createdAt }),
            ...(search && {
                OR: [{ organization: { name: contains } }, { paidBy: contains }, { razorpayPaymentId: contains }, { note: contains }],
            }),
        };
        const [payments, total, sum] = await Promise.all([
            prisma.payment.findMany({
                where,
                orderBy: [{ createdAt: "desc" }, { id: "desc" }],
                skip: (page - 1) * PAGE_SIZE,
                take: PAGE_SIZE,
                include: { organization: { select: { id: true, name: true } } },
            }),
            prisma.payment.count({ where }),
            prisma.payment.aggregate({ where, _sum: { amount: true } }),
        ]);

        return NextResponse.json({
            ok: true,
            data: payments.map((payment) => ({ ...payment, amount: payment.amount / 100 })),
            total,
            pageSize: PAGE_SIZE,
            // in rupees, of every payment the search and filter match (not only this page)
            sum: (sum._sum.amount ?? 0) / 100,
        });
    } catch (error) {
        return handleRouteError(error, "Site admin payments");
    }
}
