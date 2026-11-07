import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/db/prisma";
import { dealScope, requirePermission } from "@/lib/auth/requirePermission";
import { handleRouteError, parseBody, validationError } from "@/lib/api/http";
import { idParamSchema } from "@/lib/validations/common";
import { addDealProductSchema } from "@/lib/validations/products";
import { syncDealAmount } from "@/lib/deals/dealProducts";

type Context = { params: Promise<{ id: string }> };

// Adds a line to the deal's quote; the deal's amount becomes the new total
export async function POST(req: NextRequest, { params }: Context) {
    try {
        const user = await requirePermission("deal:update");

        const id = idParamSchema.safeParse((await params).id);
        if (!id.success) return validationError(id.error);

        const body = await parseBody(req, addDealProductSchema);
        if (!body.success) return body.response;
        const { productId, quantity, discountPercent, ...typed } = body.data;

        const deal = await prisma.deal.findFirst({ where: { id: id.data, ...dealScope(user) }, select: { id: true } });
        if (!deal) return NextResponse.json({ ok: false, message: "Deal not found" }, { status: 404 });

        // a catalogue product: its name, price and tax are copied onto the deal (and can be changed there)
        const product =
            productId !== undefined ? await prisma.product.findFirst({ where: { id: productId, organizationId: user.organizationId } }) : null;
        if (productId !== undefined && !product) return NextResponse.json({ ok: false, message: "Product not found" }, { status: 400 });

        const line = await prisma.$transaction(async (tx) => {
            const created = await tx.dealProduct.create({
                data: {
                    dealId: deal.id,
                    productId: product?.id ?? null,
                    name: typed.name ?? product!.name,
                    price: typed.price ?? product!.price,
                    taxPercent: typed.taxPercent ?? product?.taxPercent ?? 0,
                    quantity,
                    discountPercent,
                },
            });
            await syncDealAmount(tx, deal.id, user.id);
            return created;
        });

        return NextResponse.json({ ok: true, message: "Product added", data: line }, { status: 201 });
    } catch (error) {
        return handleRouteError(error, "Add deal product");
    }
}
