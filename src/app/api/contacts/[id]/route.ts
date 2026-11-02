import { contactScope, requirePermission } from "@/lib/auth/requirePermission";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/generated/prisma/client";
import { updateContactSchema } from "@/lib/validations/contact";
import { idParamSchema } from "@/lib/validations/common";
import { handleRouteError, parseBody, validationError } from "@/lib/api/http";
import { validateCustomFieldValues } from "@/lib/settings/customFields";
import { NextRequest, NextResponse } from "next/server";

type Params = { params: Promise<{ id: string }> };

function contactNotFound() {
    return NextResponse.json(
        {
            ok: false,
            message: "Contact not found",
        },
        { status: 404 }
    );
}

export async function GET(req: NextRequest, { params }: Params) {
    try {
        const user = await requirePermission("contact:read");

        const id = idParamSchema.safeParse((await params).id);

        if (!id.success) {
            return validationError(id.error);
        }

        const contact = await prisma.contact.findFirst({
            where: {
                id: id.data,
                ...contactScope(user),
            },
            include: {
                company: {
                    select: { id: true, name: true },
                },
                assignedTo: {
                    select: { id: true, name: true, email: true },
                },
            },
        });

        if (!contact) {
            return contactNotFound();
        }

        return NextResponse.json({
            ok: true,
            data: contact,
        });
    } catch (error) {
        return handleRouteError(error, "Get contact");
    }
}

export async function PUT(req: NextRequest, { params }: Params) {
    try {
        const user = await requirePermission("contact:update");

        const id = idParamSchema.safeParse((await params).id);

        if (!id.success) {
            return validationError(id.error);
        }

        const body = await parseBody(req, updateContactSchema);

        if (!body.success) {
            return body.response;
        }

        const existingContact = await prisma.contact.findFirst({
            where: {
                id: id.data,
                ...contactScope(user),
            },
            select: { id: true, customFields: true },
        });

        if (!existingContact) {
            return contactNotFound();
        }

        const { customFields: submittedCustomFields, ...fields } = body.data;

        // Custom fields are edited one at a time (like every other field here),
        // so only the submitted keys are validated and merged into what's there.
        let customFields: Prisma.InputJsonObject | undefined;

        if (submittedCustomFields) {
            const definitions = await prisma.customFieldDefinition.findMany({
                where: { organizationId: user.organizationId, entity: "contact" },
            });

            const result = validateCustomFieldValues(definitions, submittedCustomFields, { partial: true });

            if (!result.ok) {
                return NextResponse.json(
                    { ok: false, message: "Invalid custom field values", errors: result.errors },
                    { status: 400 }
                );
            }

            customFields = {
                ...(existingContact.customFields as Prisma.InputJsonObject | null),
                ...result.data,
            } as Prisma.InputJsonObject;
        }

        // Verify that the company belongs to this organization, if changing it.
        if (body.data.companyId != null) {
            const company = await prisma.company.findFirst({
                where: {
                    id: body.data.companyId,
                    organizationId: user.organizationId,
                },
                select: { id: true },
            });

            if (!company) {
                return NextResponse.json(
                    { ok: false, message: "Invalid company" },
                    { status: 400 }
                );
            }
        }

        // Contacts are unique by phone within an org — check if changing it would collide.
        if (body.data.phone) {
            const duplicate = await prisma.contact.findFirst({
                where: {
                    organizationId: user.organizationId,
                    phone: body.data.phone,
                    id: { not: id.data },
                },
                select: { id: true, name: true },
            });

            if (duplicate) {
                return NextResponse.json(
                    { ok: false, message: `A contact with this phone number already exists (${duplicate.name})` },
                    { status: 409 }
                );
            }
        }

        // scope in the where too, so the write itself is checked; if the contact is
        // deleted or reassigned away in between, Prisma throws P2025 -> 404
        const updatedContact = await prisma.contact.update({
            where: {
                id: id.data,
                ...contactScope(user),
            },
            data: {
                ...fields,
                updatedById: user.id,
                ...(customFields && { customFields }),
            },
            include: {
                company: {
                    select: { id: true, name: true },
                },
                assignedTo: {
                    select: { id: true, name: true, email: true },
                },
            },
        });

        return NextResponse.json({
            ok: true,
            data: updatedContact,
        });
    } catch (error) {
        return handleRouteError(error, "Update contact");
    }
}

export async function DELETE(req: NextRequest, { params }: Params) {
    try {
        const user = await requirePermission("contact:delete");

        const id = idParamSchema.safeParse((await params).id);

        if (!id.success) {
            return validationError(id.error);
        }

        // One query that checks the scope and deletes, so there's no gap for a race
        const { count } = await prisma.contact.deleteMany({
            where: {
                id: id.data,
                ...contactScope(user),
            },
        });

        if (count === 0) {
            return contactNotFound();
        }

        return NextResponse.json({
            ok: true,
            message: "Contact deleted successfully",
        });
    } catch (error) {
        return handleRouteError(error, "Delete contact");
    }
}
