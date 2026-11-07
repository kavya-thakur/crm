import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/db/prisma";
import { dealScope, requirePermission } from "@/lib/auth/requirePermission";
import { handleRouteError, parseBody, validationError } from "@/lib/api/http";
import { idParamSchema } from "@/lib/validations/common";
import { updateDealProductSchema } from "@/lib/validations/products";
import { syncDealAmount } from "@/lib/deals/dealProducts";
import type { CurrentUser } from "@/lib/auth/requirePermission";

type Context = { params: Promise<{ id: string; lineId: string }> };

const notFound = () => NextResponse.json({ ok: false, message: "Line not found" }, { status: 404 });

// The line, if it's on a deal this person can see
async function findLine(user: CurrentUser, params: Context["params"]) {
    const raw = await params;
    const dealId = idParamSchema.safeParse(raw.id);
    const lineId = idParamSchema.safeParse(raw.lineId);
    if (!dealId.success) return { error: validationError(dealId.error) };
    if (!lineId.success) return { error: validationError(lineId.error) };

    const line = await prisma.dealProduct.findFirst({ where: { id: lineId.data, dealId: dealId.data, deal: dealScope(user) }, select: { id: true, dealId: true } });
    return line ? { line } : { error: notFound() };
}

// Quantity, price, discount or tax on this deal only; the deal's amount follows
export async function PUT(req: NextRequest, { params }: Context) {
    try {
        const user = await requirePermission("deal:update");

        const found = await findLine(user, params);
        if (!found.line) return found.error;

        const body = await parseBody(req, updateDealProductSchema);
        if (!body.success) return body.response;

        await prisma.$transaction(async (tx) => {
            await tx.dealProduct.update({ where: { id: found.line.id }, data: body.data });
            await syncDealAmount(tx, found.line.dealId, user.id);
        });

        return NextResponse.json({ ok: true, message: "Line saved" });
    } catch (error) {
        return handleRouteError(error, "Update deal product");
    }
}

export async function DELETE(_req: NextRequest, { params }: Context) {
    try {
        const user = await requirePermission("deal:update");

        const found = await findLine(user, params);
        if (!found.line) return found.error;

        await prisma.$transaction(async (tx) => {
            await tx.dealProduct.delete({ where: { id: found.line.id } });
            await syncDealAmount(tx, found.line.dealId, user.id);
        });

        return NextResponse.json({ ok: true, message: "Line removed" });
    } catch (error) {
        return handleRouteError(error, "Remove deal product");
    }
}
