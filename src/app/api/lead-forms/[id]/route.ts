import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { allAgentsInOrganization } from "@/lib/work/activities";
import { requirePermission } from "@/lib/auth/requirePermission";
import { handleRouteError, parseBody, validationError } from "@/lib/api/http";
import { idParamSchema } from "@/lib/validations/common";
import { updateLeadFormSchema } from "@/lib/validations/leadForms";

type Params = { params: Promise<{ id: string }> };

const include = {
    source: { select: { id: true, name: true, color: true } },
    owner: { select: { id: true, name: true } },
} as const;

export async function PATCH(req: NextRequest, { params }: Params) {
    try {
        const user = await requirePermission("lead-forms:manage");

        const id = idParamSchema.safeParse((await params).id);

        if (!id.success) {
            return validationError(id.error);
        }

        const body = await parseBody(req, updateLeadFormSchema);

        if (!body.success) {
            return body.response;
        }

        const { sourceId, ownerId, assigneeIds, settings } = body.data;

        // the source and owner have to be this organization's own
        if (sourceId) {
            const source = await prisma.leadSource.findFirst({ where: { id: sourceId, organizationId: user.organizationId }, select: { id: true } });
            if (!source) return NextResponse.json({ ok: false, message: "Invalid lead source" }, { status: 400 });
        }

        if (ownerId) {
            const owner = await prisma.user.findFirst({ where: { id: ownerId, organizationId: user.organizationId }, select: { id: true } });
            if (!owner) return NextResponse.json({ ok: false, message: "Invalid owner" }, { status: 400 });
        }

        if (assigneeIds?.length && !(await allAgentsInOrganization(assigneeIds, user.organizationId))) {
            return NextResponse.json({ ok: false, message: "Everyone in the rotation has to be in this workspace" }, { status: 400 });
        }

        // the custom fields a form asks for have to be this workspace's lead fields, each once.
        // An Agent field is left out: a visitor can't pick one of the team.
        if (settings) {
            const keys = settings.customFields.map((field) => field.key);
            const usable = await prisma.customFieldDefinition.count({
                where: { organizationId: user.organizationId, entity: "lead", key: { in: keys }, type: { not: "AGENT" } },
            });
            if (usable !== keys.length || new Set(keys).size !== keys.length) {
                return NextResponse.json({ ok: false, message: "A form can only ask for your lead custom fields, each once" }, { status: 400 });
            }
        }

        // organizationId in the where, so a form from another workspace is a 404 (P2025)
        const form = await prisma.leadForm.update({
            where: { id: id.data, organizationId: user.organizationId },
            // a fresh rotation starts from its first person
            data: { ...body.data, ...(assigneeIds && { assigneeIds: [...new Set(assigneeIds)], turn: 0 }) },
            include,
        });

        return NextResponse.json({ ok: true, data: form });
    } catch (error) {
        return handleRouteError(error, "Update web form");
    }
}

// Deleting a form makes its key stop working; the leads it already brought in stay
export async function DELETE(req: NextRequest, { params }: Params) {
    try {
        const user = await requirePermission("lead-forms:manage");

        const id = idParamSchema.safeParse((await params).id);

        if (!id.success) {
            return validationError(id.error);
        }

        const { count } = await prisma.leadForm.deleteMany({ where: { id: id.data, organizationId: user.organizationId } });

        if (count === 0) {
            return NextResponse.json({ ok: false, message: "Form not found" }, { status: 404 });
        }

        return NextResponse.json({ ok: true, message: "Form deleted" });
    } catch (error) {
        return handleRouteError(error, "Delete web form");
    }
}
