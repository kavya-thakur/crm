import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/auth/requirePermission";
import { handleRouteError, parseBody, validationError } from "@/lib/api/http";
import { idParamSchema } from "@/lib/validations/common";
import { updateProductSchema } from "@/lib/validations/products";

type Context = { params: Promise<{ id: string }> };

const notFound = () => NextResponse.json({ ok: false, message: "Product not found" }, { status: 404 });

// A new price or name is for deals from now on: lines already on deals keep what they copied
export async function PUT(req: NextRequest, { params }: Context) {
    try {
        const user = await requirePermission("workspace:manage");

        const id = idParamSchema.safeParse((await params).id);
        if (!id.success) return validationError(id.error);

        const body = await parseBody(req, updateProductSchema);
        if (!body.success) return body.response;

        const { count } = await prisma.product.updateMany({ where: { id: id.data, organizationId: user.organizationId }, data: body.data });
        if (count === 0) return notFound();

        return NextResponse.json({ ok: true, message: "Product saved" });
    } catch (error) {
        return handleRouteError(error, "Update product");
    }
}

// Deals that have it keep their line (the schema unlinks it, SetNull)
export async function DELETE(_req: NextRequest, { params }: Context) {
    try {
        const user = await requirePermission("workspace:manage");

        const id = idParamSchema.safeParse((await params).id);
        if (!id.success) return validationError(id.error);

        const { count } = await prisma.product.deleteMany({ where: { id: id.data, organizationId: user.organizationId } });
        if (count === 0) return notFound();

        return NextResponse.json({ ok: true, message: "Product deleted" });
    } catch (error) {
        return handleRouteError(error, "Delete product");
    }
}
