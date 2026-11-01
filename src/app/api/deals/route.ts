import { handleRouteError, parseBody, validationError } from "@/lib/api/http";
import { dealScope, requirePermission } from "@/lib/auth/requirePermission";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/generated/prisma/client";
import { createDealSchema, listDealsQuerySchema } from "@/lib/validations/deals";
import { createdAtRange, escapeLike, searchParamsToObject } from "@/lib/validations/common";
import { validateCustomFieldValues } from "@/lib/customFields";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
    try {
        const user = await requirePermission("deal:read");

        const query = listDealsQuerySchema.safeParse(
            searchParamsToObject(req.nextUrl.searchParams)
        );

        if (!query.success) {
            return validationError(query.error);
        }

        const { page, limit, search, pipelineStageId, assignedTo, createdFrom, createdTo, customFields: customFieldsParam, sortBy, sortOrder } =
            query.data;

        const term = search && escapeLike(search);
        const createdAt = createdAtRange(createdFrom, createdTo);

        let customFieldFilters: Prisma.DealWhereInput[] = [];

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
                where: { organizationId: user.organizationId, entity: "deal", showInFilter: true },
                select: { key: true },
            });
            const allowedKeys = new Set(filterableKeys.map((def) => def.key));

            customFieldFilters = Object.entries(submitted)
                .filter(([key, value]) => allowedKeys.has(key) && value !== undefined && value !== "")
                .map(([key, value]) => ({ customFields: { path: [key], equals: value as Prisma.InputJsonValue } }));
        }

        const where: Prisma.DealWhereInput = {
            ...(customFieldFilters.length > 0 && { AND: customFieldFilters }),
            ...(term && {
                title: { contains: term, mode: "insensitive" },
            }),

            ...(pipelineStageId && { pipelineStageId }),

            ...(assignedTo !== undefined && {
                assignedToId:
                    assignedTo === "me"
                        ? user.id
                        : assignedTo === "unassigned"
                            ? null
                            : assignedTo,
            }),

            ...(createdAt && { createdAt }),

            // last, so the ?assignedTo filter can't override the scope
            ...dealScope(user),
        };

        const [deals, total] = await Promise.all([
            prisma.deal.findMany({
                where,
                // id as tie-breaker: without it, rows with equal sort values can
                // shift between pages and show up twice or not at all
                orderBy: [{ [sortBy]: sortOrder }, { id: sortOrder }],
                skip: (page - 1) * limit,
                take: limit,
                include: {
                    lead: {
                        select: { id: true, name: true },
                    },
                    assignedTo: {
                        select: { id: true, name: true, email: true },
                    },
                    pipelineStage: true,
                },
            }),

            prisma.deal.count({ where }),
        ]);

        return NextResponse.json({
            ok: true,
            data: deals,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        });
    } catch (error) {
        return handleRouteError(error, "Get deals");
    }
}

export async function POST(req: NextRequest) {
    try {
        const user = await requirePermission("deal:create");

        const body = await parseBody(req, createDealSchema);

        if (!body.success) {
            return body.response;
        }

        const {
            title,
            amount,
            probability,
            leadId,
            assignedToId,
            pipelineStageId,
            expectedCloseDate,
            description,
            customFields: submittedCustomFields,
        } = body.data;

        // Verify that the pipeline stage belongs to this organization.
        const stage = await prisma.pipelineStage.findFirst({
            where: {
                id: pipelineStageId,
                organizationId: user.organizationId,
            },
            select: { id: true },
        });

        if (!stage) {
            return NextResponse.json(
                {
                    ok: false,
                    message: "Invalid pipeline stage",
                },
                { status: 400 }
            );
        }

        // Verify that the lead belongs to this organization, if supplied.
        if (leadId != null) {
            const lead = await prisma.lead.findFirst({
                where: {
                    id: leadId,
                    organizationId: user.organizationId,
                },
                select: { id: true },
            });

            if (!lead) {
                return NextResponse.json(
                    {
                        ok: false,
                        message: "Invalid lead",
                    },
                    { status: 400 }
                );
            }
        }

        // Verify that the assigned agent belongs to this organization.
        if (assignedToId != null) {
            const agent = await prisma.user.findFirst({
                where: {
                    id: assignedToId,
                    organizationId: user.organizationId,
                },
                select: { id: true },
            });

            if (!agent) {
                return NextResponse.json(
                    {
                        ok: false,
                        message: "Invalid assigned agent",
                    },
                    { status: 400 }
                );
            }
        }

        const definitions = await prisma.customFieldDefinition.findMany({
            where: { organizationId: user.organizationId, entity: "deal" },
        });

        const customFields = validateCustomFieldValues(definitions, submittedCustomFields ?? {});

        if (!customFields.ok) {
            return NextResponse.json(
                { ok: false, message: "Invalid custom field values", errors: customFields.errors },
                { status: 400 }
            );
        }

        const deal = await prisma.deal.create({
            data: {
                title,
                amount,
                probability,
                leadId: leadId ?? null,
                assignedToId: assignedToId ?? null,
                pipelineStageId,
                expectedCloseDate: expectedCloseDate
                    ? new Date(expectedCloseDate)
                    : null,
                description: description ?? null,
                customFields: customFields.data as Prisma.InputJsonObject,
                organizationId: user.organizationId,
                // nested create: the deal and its first timeline entry are saved in one query
                timeline: {
                    create: {
                        userId: user.id,
                        type: "CREATED",
                        message: "Deal created",
                    },
                },
            },
            include: {
                lead: {
                    select: {
                        id: true,
                        name: true,
                    },
                },
                assignedTo: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                    },
                },
                pipelineStage: true,
            },
        });

        return NextResponse.json(
            {
                ok: true,
                message: "Deal created successfully",
                data: deal,
            },
            { status: 201 }
        );
    } catch (error) {
        return handleRouteError(error, "creating the deal");
    }
}