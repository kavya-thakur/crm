import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/auth/requirePermission";
import { handleRouteError, parseBody, validationError } from "@/lib/api/http";
import { idParamSchema } from "@/lib/validations/common";
import { emailTemplateSchema } from "@/lib/validations/emails";

type Context = { params: Promise<{ id: string }> };

export async function PUT(req: NextRequest, { params }: Context) {
    try {
        const user = await requirePermission("email-templates:manage");

        const id = idParamSchema.safeParse((await params).id);
        if (!id.success) return validationError(id.error);

        const body = await parseBody(req, emailTemplateSchema);
        if (!body.success) return body.response;

        // only this workspace's own template
        const { count } = await prisma.emailTemplate.updateMany({ where: { id: id.data, organizationId: user.organizationId }, data: body.data });
        if (count === 0) return NextResponse.json({ ok: false, message: "Template not found" }, { status: 404 });

        return NextResponse.json({ ok: true, message: "Template saved" });
    } catch (error) {
        return handleRouteError(error, "Update email template");
    }
}

export async function DELETE(_req: NextRequest, { params }: Context) {
    try {
        const user = await requirePermission("email-templates:manage");

        const id = idParamSchema.safeParse((await params).id);
        if (!id.success) return validationError(id.error);

        const { count } = await prisma.emailTemplate.deleteMany({ where: { id: id.data, organizationId: user.organizationId } });
        if (count === 0) return NextResponse.json({ ok: false, message: "Template not found" }, { status: 404 });

        return NextResponse.json({ ok: true, message: "Template deleted" });
    } catch (error) {
        return handleRouteError(error, "Delete email template");
    }
}
