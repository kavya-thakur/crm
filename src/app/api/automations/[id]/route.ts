import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/auth/requirePermission";
import { handleRouteError, parseBody, validationError } from "@/lib/api/http";
import { idParamSchema } from "@/lib/validations/common";
import { automationRuleSchema, toggleAutomationSchema } from "@/lib/validations/automations";
import { checkReferences } from "@/lib/automations/checkRule";

type Context = { params: Promise<{ id: string }> };

// Saves the whole rule from the builder
export async function PUT(req: NextRequest, { params }: Context) {
    try {
        const user = await requirePermission("automations:manage");

        const id = idParamSchema.safeParse((await params).id);
        if (!id.success) return validationError(id.error);

        const body = await parseBody(req, automationRuleSchema);
        if (!body.success) return body.response;

        const problem = await checkReferences(user, body.data);
        if (problem) return NextResponse.json({ ok: false, message: problem }, { status: 400 });

        // organizationId in the where: another workspace's rule is a 404
        const { count } = await prisma.automationRule.updateMany({ where: { id: id.data, organizationId: user.organizationId }, data: body.data });
        if (count === 0) return NextResponse.json({ ok: false, message: "Automation not found" }, { status: 404 });

        return NextResponse.json({ ok: true, message: "Automation saved" });
    } catch (error) {
        return handleRouteError(error, "Update automation");
    }
}

// The on/off switch on the list
export async function PATCH(req: NextRequest, { params }: Context) {
    try {
        const user = await requirePermission("automations:manage");

        const id = idParamSchema.safeParse((await params).id);
        if (!id.success) return validationError(id.error);

        const body = await parseBody(req, toggleAutomationSchema);
        if (!body.success) return body.response;

        const { count } = await prisma.automationRule.updateMany({ where: { id: id.data, organizationId: user.organizationId }, data: body.data });
        if (count === 0) return NextResponse.json({ ok: false, message: "Automation not found" }, { status: 404 });

        return NextResponse.json({ ok: true, message: body.data.enabled ? "Automation turned on" : "Automation turned off" });
    } catch (error) {
        return handleRouteError(error, "Turn automation on or off");
    }
}

export async function DELETE(_req: NextRequest, { params }: Context) {
    try {
        const user = await requirePermission("automations:manage");

        const id = idParamSchema.safeParse((await params).id);
        if (!id.success) return validationError(id.error);

        const { count } = await prisma.automationRule.deleteMany({ where: { id: id.data, organizationId: user.organizationId } });
        if (count === 0) return NextResponse.json({ ok: false, message: "Automation not found" }, { status: 404 });

        return NextResponse.json({ ok: true, message: "Automation deleted" });
    } catch (error) {
        return handleRouteError(error, "Delete automation");
    }
}
