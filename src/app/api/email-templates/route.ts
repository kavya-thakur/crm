import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { requirePermission } from "@/lib/auth/requirePermission";
import { handleRouteError, parseBody } from "@/lib/api/http";
import { emailTemplateSchema } from "@/lib/validations/emails";

// Everyone can use the workspace's templates (the picker in the Emails tab); writing them needs email-templates:manage
export async function GET() {
    try {
        const user = await getCurrentUser();
        if (!user) throw new Error("UNAUTHORIZED");

        const templates = await prisma.emailTemplate.findMany({
            where: { organizationId: user.organizationId },
            orderBy: [{ name: "asc" }, { id: "asc" }],
        });

        // who's sending, for the {{me.name}} / {{workspace.name}} placeholders in the compose box
        const me = { name: user.name, email: user.email, workspace: user.organization.name };

        return NextResponse.json({ ok: true, data: templates, me });
    } catch (error) {
        return handleRouteError(error, "Get email templates");
    }
}

export async function POST(req: NextRequest) {
    try {
        const user = await requirePermission("email-templates:manage");

        const body = await parseBody(req, emailTemplateSchema);
        if (!body.success) return body.response;

        const template = await prisma.emailTemplate.create({ data: { ...body.data, organizationId: user.organizationId } });

        return NextResponse.json({ ok: true, message: "Template created", data: template }, { status: 201 });
    } catch (error) {
        return handleRouteError(error, "Create email template");
    }
}
