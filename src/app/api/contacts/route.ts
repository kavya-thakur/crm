import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/generated/prisma/client";
import { contactScope, hasPermission, requirePermission } from "@/lib/auth/requirePermission";
import { createContactSchema, listContactsQuerySchema } from "@/lib/validations/contact";
import { dayRange, escapeLike, searchParamsToObject } from "@/lib/validations/common";
import { handleRouteError, parseBody, validationError } from "@/lib/api/http";
import { validateCustomFieldValues } from "@/lib/customFields";

export async function POST(req: NextRequest) {
    try {
        const user = await requirePermission("contact:create");

        const body = await parseBody(req, createContactSchema);

        if (!body.success) {
            return body.response;
        }

        const { assignedToId: requestedAssignee, companyId, customFields: submittedCustomFields, ...fields } = body.data;

        // omitted = the creator owns it, null = unassigned
        const assignedToId = requestedAssignee === undefined ? user.id : requestedAssignee;

        // Without contact:all you'd create a contact you then can't see; assigning is a manager action
        if (assignedToId !== user.id && !hasPermission(user, "contact:all")) {
            return NextResponse.json(
                { ok: false, message: "You can only create contacts assigned to yourself" },
                { status: 403 }
            );
        }

        // Verify that the company belongs to this organization, if supplied.
        if (companyId != null) {
            const company = await prisma.company.findFirst({
                where: {
                    id: companyId,
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

        // Verify that the assigned agent belongs to this organization.
        if (assignedToId !== null && assignedToId !== user.id) {
            const agent = await prisma.user.findFirst({
                where: {
                    id: assignedToId,
                    organizationId: user.organizationId,
                },
                select: { id: true },
            });

            if (!agent) {
                return NextResponse.json(
                    { ok: false, message: "Agent not found in your organization" },
                    { status: 404 }
                );
            }
        }

        // Contacts are unique by phone within an org (also enforced at the DB
        // level — this just gives a clearer message than a raw P2002 would).
        const duplicate = await prisma.contact.findFirst({
            where: { organizationId: user.organizationId, phone: fields.phone },
            select: { id: true, name: true },
        });

        if (duplicate) {
            return NextResponse.json(
                { ok: false, message: `A contact with this phone number already exists (${duplicate.name})` },
                { status: 409 }
            );
        }

        const definitions = await prisma.customFieldDefinition.findMany({
            where: { organizationId: user.organizationId, entity: "contact" },
        });

        const customFields = validateCustomFieldValues(definitions, submittedCustomFields ?? {});

        if (!customFields.ok) {
            return NextResponse.json(
                { ok: false, message: "Invalid custom field values", errors: customFields.errors },
                { status: 400 }
            );
        }

        const contact = await prisma.contact.create({
            data: {
                ...fields,
                companyId,
                assignedToId,
                customFields: customFields.data as Prisma.InputJsonObject,
                organizationId: user.organizationId,
                createdById: user.id,
                updatedById: user.id,
                // nested create: the contact and its first timeline entry are saved in one query
                timeline: {
                    create: {
                        userId: user.id,
                        type: "CREATED",
                        message: "Contact created",
                    },
                },
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

        return NextResponse.json(
            {
                ok: true,
                message: "Contact created successfully",
                data: contact,
            },
            { status: 201 }
        );
    } catch (error) {
        return handleRouteError(error, "Create contact");
    }
}

export async function GET(req: NextRequest) {
    try {
        const user = await requirePermission("contact:read");

        const query = listContactsQuerySchema.safeParse(
            searchParamsToObject(req.nextUrl.searchParams)
        );

        if (!query.success) {
            return validationError(query.error);
        }

        const { page, limit, search, companyId, assignedTo, createdBy, updatedBy, createdFrom, createdTo, updatedFrom, updatedTo, customFields: customFieldsParam, sortBy, sortOrder } = query.data;

        const term = search && escapeLike(search);
        const createdAt = dayRange(createdFrom, createdTo);
        const updatedAt = dayRange(updatedFrom, updatedTo);

        let customFieldFilters: Prisma.ContactWhereInput[] = [];

        if (customFieldsParam) {
            let submitted: Record<string, unknown>;

            try {
                submitted = JSON.parse(customFieldsParam);
            } catch {
                return NextResponse.json(
                    { ok: false, message: "Invalid customFields filter" },
                    { status: 400 }
                );
            }

            // only ever filter by fields this org actually marked filterable
            const filterableKeys = await prisma.customFieldDefinition.findMany({
                where: { organizationId: user.organizationId, entity: "contact", showInFilter: true },
                select: { key: true },
            });
            const allowedKeys = new Set(filterableKeys.map((def) => def.key));

            customFieldFilters = Object.entries(submitted)
                .filter(([key, value]) => allowedKeys.has(key) && value !== undefined && value !== "")
                .map(([key, value]) => ({ customFields: { path: [key], equals: value as Prisma.InputJsonValue } }));
        }

        const where: Prisma.ContactWhereInput = {
            ...(customFieldFilters.length > 0 && { AND: customFieldFilters }),
            ...(term && {
                OR: [
                    { name: { contains: term, mode: "insensitive" } },
                    { email: { contains: term, mode: "insensitive" } },
                    { phone: { contains: term, mode: "insensitive" } },
                ],
            }),

            ...(companyId && { companyId }),

            ...(assignedTo !== undefined && {
                assignedToId:
                    assignedTo === "me"
                        ? user.id
                        : assignedTo === "unassigned"
                            ? null
                            : assignedTo,
            }),

            ...(createdBy !== undefined && { createdById: createdBy === "me" ? user.id : createdBy }),

            ...(updatedBy !== undefined && { updatedById: updatedBy === "me" ? user.id : updatedBy }),

            ...(updatedAt && { updatedAt }),

            ...(createdAt && { createdAt }),

            // last, so the ?assignedTo filter can't override the scope
            ...contactScope(user),
        };

        const [contacts, total] = await Promise.all([
            prisma.contact.findMany({
                where,
                // id as tie-breaker: without it, rows with equal sort values can
                // shift between pages and show up twice or not at all
                orderBy: [{ [sortBy]: sortOrder }, { id: sortOrder }],
                skip: (page - 1) * limit,
                take: limit,
                include: {
                    company: {
                        select: { id: true, name: true },
                    },
                    assignedTo: {
                        select: { id: true, name: true, email: true },
                    },
                    // who made it and who changed it last, for the table's columns
                    createdBy: { select: { id: true, name: true } },
                    updatedBy: { select: { id: true, name: true } },
                },
            }),

            prisma.contact.count({ where }),
        ]);

        return NextResponse.json({
            ok: true,
            data: contacts,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        });
    } catch (error) {
        return handleRouteError(error, "Get contacts");
    }
}
