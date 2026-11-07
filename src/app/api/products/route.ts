import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { requirePermission } from "@/lib/auth/requirePermission";
import { handleRouteError, parseBody } from "@/lib/api/http";
import { productSchema } from "@/lib/validations/products";

// ponytail: the whole catalogue in one go; add search and paging if a workspace sells thousands
const MAX = 1000;

// The catalogue, A to Z: Settings > Products, and the picker on a deal's Products tab
export async function GET() {
    try {
        const user = await getCurrentUser();
        if (!user) throw new Error("UNAUTHORIZED");

        const products = await prisma.product.findMany({ where: { organizationId: user.organizationId }, orderBy: [{ name: "asc" }, { id: "asc" }], take: MAX });
        return NextResponse.json({ ok: true, data: products });
    } catch (error) {
        return handleRouteError(error, "Get products");
    }
}

export async function POST(req: NextRequest) {
    try {
        // the catalogue is part of how the workspace is set up, like its currency
        const user = await requirePermission("workspace:manage");

        const body = await parseBody(req, productSchema);
        if (!body.success) return body.response;

        const product = await prisma.product.create({ data: { ...body.data, organizationId: user.organizationId } });
        return NextResponse.json({ ok: true, message: "Product added", data: product }, { status: 201 });
    } catch (error) {
        return handleRouteError(error, "Create product");
    }
}
