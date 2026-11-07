import { leadScope, requirePermission } from "@/lib/auth/requirePermission";
import { deleteToBin } from "@/lib/recycleBin";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/generated/prisma/client";
import { updateLeadSchema } from "@/lib/validations/leads";
import { idParamSchema } from "@/lib/validations/common";
import { handleRouteError, parseBody, validationError } from "@/lib/api/http";
import { validateCustomFieldValues } from "@/lib/settings/customFields";
import { stageMessage } from "@/lib/leads/stages";
import { alreadyALead, findOpenCopy, isOpen } from "@/lib/leads/duplicates";
import { stageEvents, startAutomations } from "@/lib/automations/engine";
import { moveToCompany } from "@/lib/companies";
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
                stage: { select: { name: true, isConverted: true, isLost: true } },
                email: true,
                phone: true,
                customFields: true,
            },
        });

        if (!existingLead) {
            return leadNotFound();
        }

        const { stageId, customFields: submittedCustomFields, ...fields } = body.data;
        const stageChanged = stageId !== undefined && stageId !== existingLead.stageId;
        let newStage: { name: string; isConverted: boolean; isLost: boolean } | undefined;

        if (stageChanged) {
            const stage = await prisma.leadStage.findFirst({
                where: { id: stageId, organizationId: user.organizationId },
                select: { name: true, isConverted: true, isLost: true },
            });

            if (!stage) {
                return NextResponse.json(
                    { ok: false, message: "Invalid lead stage" },
                    { status: 400 }
                );
            }

            newStage = stage;
        }

        // One open lead per person: a new phone or email, or reopening a lost lead, can't make
        // it a second open lead for someone who already has one
        const identityChanged = fields.phone !== undefined || fields.email !== undefined;
        const reopened = newStage && !isOpen(existingLead.stage);

        if (isOpen(newStage ?? existingLead.stage) && (identityChanged || reopened)) {
            const copy = await findOpenCopy(user.organizationId, {
                email: fields.email !== undefined ? fields.email : existingLead.email,
                phone: fields.phone ?? existingLead.phone,
                exceptId: id.data,
            });

            if (copy) {
                return alreadyALead(copy, user);
            }
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

            const result = validateCustomFieldValues(definitions, submittedCustomFields, { partial: true });

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
                updatedById: user.id,
                ...(customFields && { customFields }),
                // a lead that's no longer lost has no reason to be
                ...(newStage && !newStage.isLost && { lostReason: null }),
                // same timeline entry the bulk route logs, saved in the same query as the update
                ...(newStage && {
                    timeline: {
                        create: {
                            userId: user.id,
                            type: "STATUS_CHANGED",
                            message: stageMessage(existingLead.stage.name, newStage, fields.lostReason),
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

        // its contact moves to the company it now names (or out of its company, when cleared)
        if (fields.companyName !== undefined) await moveToCompany(prisma, user.organizationId, [updatedLead.id], fields.companyName);

        // the workspace's "lead moves to a stage" (and "lead is lost") rules
        if (newStage) {
            await startAutomations(...stageEvents("lead", user.organizationId, [updatedLead.id], { id: updatedLead.stageId, isLost: newStage.isLost }));
        }

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

        // Into the recycle bin (a copy, with its history), then deleted, in one transaction;
        // the scope is in the where, so someone else's lead is a 404
        const count = await prisma.$transaction((tx) => deleteToBin(tx, user, "lead", { id: id.data, ...leadScope(user) }));

        if (count === 0) {
            return leadNotFound();
        }

        return NextResponse.json({
            ok: true,
            message: "Lead moved to the recycle bin",
        });
    } catch (error) {
        return handleRouteError(error, "Delete lead");
    }
}
