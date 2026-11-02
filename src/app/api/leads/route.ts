import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/generated/prisma/client";
import { hasPermission, leadScope, requirePermission } from "@/lib/auth/requirePermission";
import { createLeadSchema, listLeadsQuerySchema } from "@/lib/validations/leads";
import { dayRange, escapeLike, searchParamsToObject } from "@/lib/validations/common";
import { handleRouteError, parseBody, validationError } from "@/lib/api/http";
import { validateCustomFieldValues } from "@/lib/customFields";

export async function POST(req: NextRequest) {
    try {
        const user = await requirePermission("lead:create");

        const body = await parseBody(req, createLeadSchema);

        if (!body.success) {
            return body.response;
        }

        const {
            assignedToId: requestedAssignee,
            customFields: submittedCustomFields,
            contactId: requestedContactId,
            ...fields
        } = body.data;

        // Verify that the stage belongs to this organization.
        const stage = await prisma.leadStage.findFirst({
            where: {
                id: fields.stageId,
                organizationId: user.organizationId,
            },
            select: { id: true },
        });

        if (!stage) {
            return NextResponse.json(
                { ok: false, message: "Invalid lead stage" },
                { status: 400 }
            );
        }

        // Verify that the source belongs to this organization, if supplied.
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

        // omitted = the creator owns it, null = unassigned
        const assignedToId =
            requestedAssignee === undefined ? user.id : requestedAssignee;

        // Without lead:all you'd create a lead you then can't see; assigning is a manager action
        if (assignedToId !== user.id && !hasPermission(user, "lead:all")) {
            return NextResponse.json(
                { ok: false, message: "You can only create leads assigned to yourself" },
                { status: 403 }
            );
        }

        if (assignedToId !== null && assignedToId !== user.id) {
            const agent = await prisma.user.findFirst({
                where: {
                    id: assignedToId,
                    organizationId: user.organizationId,
                },
                select: {
                    id: true,
                },
            });

            if (!agent) {
                return NextResponse.json(
                    {
                        ok: false,
                        message: "Agent not found in your organization",
                    },
                    { status: 404 }
                );
            }
        }

        const definitions = await prisma.customFieldDefinition.findMany({
            where: { organizationId: user.organizationId, entity: "lead" },
        });

        const customFields = validateCustomFieldValues(definitions, submittedCustomFields ?? {});

        if (!customFields.ok) {
            return NextResponse.json(
                { ok: false, message: "Invalid custom field values", errors: customFields.errors },
                { status: 400 }
            );
        }

        // Resolve which contact this lead attaches to: one explicitly picked
        // in the form, an existing one with the same phone (so the same
        // person doesn't get a duplicate contact for every lead), or a new one.
        let contactId: number | undefined;

        if (requestedContactId !== undefined) {
            const contact = await prisma.contact.findFirst({
                where: { id: requestedContactId, organizationId: user.organizationId },
                select: { id: true },
            });

            if (!contact) {
                return NextResponse.json(
                    { ok: false, message: "Invalid contact" },
                    { status: 400 }
                );
            }

            contactId = contact.id;
        } else if (fields.phone) {
            const existing = await prisma.contact.findFirst({
                where: { organizationId: user.organizationId, phone: fields.phone },
                select: { id: true },
            });
            contactId = existing?.id;
        }

        // Every lead is a person worth keeping in the address book, whether or
        // not it ever closes, so it gets a matching contact right away unless
        // one was already resolved above.
        // Two inserts (a to-one relation can't be nested in Prisma's
        // "unchecked" create form), wrapped so they commit together.
        const lead = await prisma.$transaction(async (tx) => {
            const resolvedContactId = contactId ?? (await tx.contact.create({
                data: {
                    name: fields.name,
                    email: fields.email ?? null,
                    phone: fields.phone ?? null,
                    assignedToId,
                    organizationId: user.organizationId,
                    createdById: user.id,
                    updatedById: user.id,
                },
            })).id;

            return tx.lead.create({
                data: {
                    ...fields,
                    organizationId: user.organizationId,
                    assignedToId,
                    contactId: resolvedContactId,
                    customFields: customFields.data as Prisma.InputJsonObject,
                    createdById: user.id,
                    updatedById: user.id,
                    timeline: {
                        create: {
                            userId: user.id,
                            type: "CREATED",
                            message: "Lead created",
                        },
                    },
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
        });

        return NextResponse.json(
            {
                ok: true,
                data: lead,
            },
            { status: 201 }
        );
    } catch (error) {
        return handleRouteError(error, "Create lead");
    }
}

export async function GET(req: NextRequest) {
    try {
        const user = await requirePermission("lead:read");

        const query = listLeadsQuerySchema.safeParse(
            searchParamsToObject(req.nextUrl.searchParams)
        );

        if (!query.success) {
            return validationError(query.error);
        }

        const { page, limit, search, stageId, stageIds, sourceId, assignedTo, createdBy, updatedBy, createdFrom, createdTo, updatedFrom, updatedTo, customFields: customFieldsParam, sortBy, sortOrder } =
            query.data;

        const term = search && escapeLike(search);
        const createdAt = dayRange(createdFrom, createdTo);
        const updatedAt = dayRange(updatedFrom, updatedTo);

        let customFieldFilters: Prisma.LeadWhereInput[] = [];

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
                where: { organizationId: user.organizationId, entity: "lead", showInFilter: true },
                select: { key: true },
            });
            const allowedKeys = new Set(filterableKeys.map((def) => def.key));

            customFieldFilters = Object.entries(submitted)
                .filter(([key, value]) => allowedKeys.has(key) && value !== undefined && value !== "")
                .map(([key, value]) => ({ customFields: { path: [key], equals: value as Prisma.InputJsonValue } }));
        }

        const where: Prisma.LeadWhereInput = {
            ...(customFieldFilters.length > 0 && { AND: customFieldFilters }),
            ...(term && {
                OR: [
                    { name: { contains: term, mode: "insensitive" } },
                    { email: { contains: term, mode: "insensitive" } },
                    { phone: { contains: term, mode: "insensitive" } },
                    { companyName: { contains: term, mode: "insensitive" } },
                ],
            }),

            ...(stageIds && { stageId: { in: stageIds } }),

            // one board column; within the filter's stages when both are sent
            ...(stageId && { stageId }),

            ...(sourceId && { sourceId }),

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
            ...leadScope(user),
        };

        const [leads, total] = await Promise.all([
            prisma.lead.findMany({
                where,
                // id as tie-breaker: without it, rows with equal sort values can
                // shift between pages and show up twice or not at all
                orderBy: [{ [sortBy]: sortOrder }, { id: sortOrder }],
                skip: (page - 1) * limit,
                take: limit,
                include: {
                    assignedTo: {
                        select: {
                            id: true,
                            name: true,
                            email: true,
                        },
                    },
                    stage: true,
                    source: true,
                    // who made it and who changed it last, for the table's columns
                    createdBy: { select: { id: true, name: true } },
                    updatedBy: { select: { id: true, name: true } },
                },
            }),

            prisma.lead.count({
                where,
            }),
        ]);

        return NextResponse.json({
            ok: true,
            data: leads,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        });
    } catch (error) {
        return handleRouteError(error, "Get leads");
    }
}
