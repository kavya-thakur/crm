import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/auth/requirePermission";
import { handleRouteError, parseBody } from "@/lib/api/http";
import { createLeadFormSchema } from "@/lib/validations/leadForms";

// what the settings page shows for each form
const leadFormInclude = {
    source: { select: { id: true, name: true, color: true } },
    owner: { select: { id: true, name: true } },
} as const;

export async function GET() {
    try {
        const user = await requirePermission("lead-forms:manage");

        const forms = await prisma.leadForm.findMany({
            where: { organizationId: user.organizationId },
            orderBy: { createdAt: "asc" },
            include: leadFormInclude,
        });

        return NextResponse.json({ ok: true, data: forms });
    } catch (error) {
        return handleRouteError(error, "Get web forms");
    }
}

// A new form starts by giving its leads to whoever made it, with no source; both can be changed
export async function POST(req: NextRequest) {
    try {
        const user = await requirePermission("lead-forms:manage");

        const body = await parseBody(req, createLeadFormSchema);

        if (!body.success) {
            return body.response;
        }

        const form = await prisma.leadForm.create({
            data: {
                organizationId: user.organizationId,
                name: body.data.name,
                // 24 random characters: the form's public id, which nobody could guess
                key: randomBytes(18).toString("base64url"),
                ownerId: user.id,
            },
            include: leadFormInclude,
        });

        return NextResponse.json({ ok: true, message: "Form created", data: form }, { status: 201 });
    } catch (error) {
        return handleRouteError(error, "Create web form");
    }
}
