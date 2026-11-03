import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/auth/requirePermission";
import { handleRouteError, validationError } from "@/lib/api/http";
import { idParamSchema } from "@/lib/validations/common";

// What a lead integration has received lately, newest first (its log in Settings)
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const user = await requirePermission("lead-forms:manage");

        const id = idParamSchema.safeParse((await params).id);
        if (!id.success) return validationError(id.error);

        const form = await prisma.leadForm.findFirst({ where: { id: id.data, organizationId: user.organizationId }, select: { id: true } });
        if (!form) return NextResponse.json({ ok: false, message: "Not found" }, { status: 404 });

        const deliveries = await prisma.leadFormDelivery.findMany({ where: { formId: form.id }, orderBy: { id: "desc" }, take: 50 });

        return NextResponse.json({ ok: true, data: deliveries });
    } catch (error) {
        return handleRouteError(error, "Get integration deliveries");
    }
}
