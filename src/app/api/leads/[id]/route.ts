import { leadScope, requirePermission } from "@/lib/auth/requirePermission";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/generated/prisma/client";
import { updateLeadSchema } from "@/lib/validations/leads";
import { idParamSchema } from "@/lib/validations/common";
import { handleRouteError, parseBody, validationError } from "@/lib/api/http";
import { validateCustomFieldValues } from "@/lib/customFields";
import { NextRequest, NextResponse } from "next/server";

type Params = { params: Promise<{ id: string }> };

function leadNotFound() {
    return NextResponse.json(
        {
            ok: false,
            message: "Lead not found",
        },
        { status: 404 }
    );
}

export async function GET(req: NextRequest, { params }: Params) {
    try {
        const user = await requirePermission("lead:read");

        const id = idParamSchema.safeParse((await params).id);

        if (!id.success) {
            return validationError(id.error);
        }

        const lead = await prisma.lead.findFirst({
            where: {
                id: id.data,
                ...leadScope(user),
            },
            include: {
                assignedTo: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                    },
                },
                contact: {
                    select: { id: true, name: true },
                },
                stage: true,
                source: true,
            },
        });

        if (!lead) {
            return leadNotFound();
        }

        return NextResponse.json({
            ok: true,
            data: lead,
        });
    } catch (error) {
        return handleRouteError(error, "Get lead");
    }
}

export async function PUT(req: NextRequest, { params }: Params) {
    try {
        const user = await requirePermission("lead:update");

        const id = idParamSchema.safeParse((await params).id);

        if (!id.success) {
            return validationError(id.error);
        }

        const body = await parseBody(req, updateLeadSchema);

        if (!body.success) {
            return body.response;
        }

        const existingLead = await prisma.lead.findFirst({
            where: {
                id: id.data,
                ...leadScope(user),
            },
            select: {
                stageId: true,
                stage: { select: { name: true } },
                customFields: true,
            },
        });

        if (!existingLead) {
            return leadNotFound();
        }

        const { stageId, customFields: submittedCustomFields, ...fields } = body.data;
        const stageChanged = stageId !== undefined && stageId !== existingLead.stageId;
        let newStageName: string | undefined;

        if (stageChanged) {
            const stage = await prisma.leadStage.findFirst({
                where: { id: stageId, organizationId: user.organizationId },
                select: { name: true },
            });

            if (!stage) {
                return NextResponse.json(
                    { ok: false, message: "Invalid lead stage" },
                    { status: 400 }
                );
            }

            newStageName = stage.name;
        }

        // Verify that the source belongs to this organization, if changing it.
        if (fields.sourceId != null) {
            const source = await prisma.leadSource.findFirst({
                where: { id: fields.sourceId, organizationId: user.organizationId },
                select: { id: true },
            });

            if (!source) {
                return NextResponse.json(
                    { ok: false, message: "Invalid lead source" },
                    { status: 400 }
                );
            }
        }

        // Custom fields are edited one at a time (like every other field here),
        // so only the submitted keys are validated and merged into what's there.
        let customFields: Prisma.InputJsonObject | undefined;

        if (submittedCustomFields) {
            const definitions = await prisma.customFieldDefinition.findMany({
                where: { organizationId: user.organizationId, entity: "lead" },
            });

            const result = validateCustomFieldValues(definitions, submittedCustomFields);

            if (!result.ok) {
                return NextResponse.json(
                    { ok: false, message: "Invalid custom field values", errors: result.errors },
                    { status: 400 }
                );
            }

            customFields = {
                ...(existingLead.customFields as Prisma.InputJsonObject | null),
                ...result.data,
            } as Prisma.InputJsonObject;
        }

        // scope in the where too, so the write itself is checked; if the lead is
        // deleted or reassigned away in between, Prisma throws P2025 -> 404
        const updatedLead = await prisma.lead.update({
            where: {
                id: id.data,
                ...leadScope(user),
            },
            data: {
                ...fields,
                stageId,
                ...(customFields && { customFields }),
                // same timeline entry the bulk route logs, saved in the same query as the update
                ...(stageChanged && {
                    timeline: {
                        create: {
                            userId: user.id,
                            type: "STATUS_CHANGED",
                            message: `Lead stage changed from ${existingLead.stage.name} to ${newStageName}`,
                        },
                    },
                }),
            },
            include: {
                assignedTo: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                    },
                },
                contact: {
                    select: { id: true, name: true },
                },
                stage: true,
                source: true,
            },
        });

        return NextResponse.json({
            ok: true,
            data: updatedLead,
        });
    } catch (error) {
        return handleRouteError(error, "Update lead");
    }
}

export async function DELETE(req: NextRequest, { params }: Params) {
    try {
        const user = await requirePermission("lead:delete");

        const id = idParamSchema.safeParse((await params).id);

        if (!id.success) {
            return validationError(id.error);
        }

        // One query that checks the scope and deletes, so there's no gap for a race
        const { count } = await prisma.lead.deleteMany({
            where: {
                id: id.data,
                ...leadScope(user),
            },
        });

        if (count === 0) {
            return leadNotFound();
        }

        return NextResponse.json({
            ok: true,
            message: "Lead deleted successfully",
        });
    } catch (error) {
        return handleRouteError(error, "Delete lead");
    }
}
