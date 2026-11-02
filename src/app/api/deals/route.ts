import { handleRouteError, parseBody, validationError } from "@/lib/api/http";
import { dealScope, hasPermission, requirePermission } from "@/lib/auth/requirePermission";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/generated/prisma/client";
import { createDealSchema, listDealsQuerySchema } from "@/lib/validations/deals";
import { dayRange, escapeLike, searchParamsToObject } from "@/lib/validations/common";
import { validateCustomFieldValues } from "@/lib/settings/customFields";
import { closedAtFor } from "@/lib/deals/stages";
import { NextRequest, NextResponse } from "next/server";
import { firstName, notify } from "@/lib/realtime/notify";
import { dealLeadSelect } from "@/lib/deals/select";
import { exportDeals } from "@/lib/api/csvExport";
import { MAX_BULK } from "@/lib/jobs/bulkActions";

export async function GET(req: NextRequest) {
    try {
        const user = await requirePermission("deal:read");

        const query = listDealsQuerySchema.safeParse(
            searchParamsToObject(req.nextUrl.searchParams)
        );

        if (!query.success) {
            return validationError(query.error);
        }

        const { page, limit, search, pipelineStageId, pipelineStageIds, assignedTo, createdBy, updatedBy, createdFrom, createdTo, updatedFrom, updatedTo, customFields: customFieldsParam, sortBy, sortOrder, format } =
            query.data;

        const term = search && escapeLike(search);
        const createdAt = dayRange(createdFrom, createdTo);
        const updatedAt = dayRange(updatedFrom, updatedTo);

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

            ...(pipelineStageIds && { pipelineStageId: { in: pipelineStageIds } }),

            // one board column; within the filter's stages when both are sent
            ...(pipelineStageId && { pipelineStageId }),

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
            ...dealScope(user),
        };

        // the same filters and permissions, as a file
        if (format === "csv") {
            return exportDeals(user.organizationId, where);
        }

        // every match's id (up to the bulk limit), for "select all N" and a bulk action on them
        if (format === "ids") {
            const rows = await prisma.deal.findMany({ where, select: { id: true }, orderBy: { id: "asc" }, take: MAX_BULK });
            return NextResponse.json({ ok: true, data: rows.map((row) => row.id) });
        }

        const [deals, total, sum] = await Promise.all([
            prisma.deal.findMany({
                where,
                // id as tie-breaker: without it, rows with equal sort values can
                // shift between pages and show up twice or not at all
                orderBy: [{ [sortBy]: sortOrder }, { id: sortOrder }],
                skip: (page - 1) * limit,
                take: limit,
                include: {
                    lead: dealLeadSelect,
                    assignedTo: {
                        select: { id: true, name: true, email: true },
                    },
                    pipelineStage: true,
                    // who made it and who changed it last, for the table's columns
                    createdBy: { select: { id: true, name: true } },
                    updatedBy: { select: { id: true, name: true } },
                },
            }),

            prisma.deal.count({ where }),

            // the board's column header shows the column's total value; adding it up only on
            // the first page keeps "load more" pages as cheap as before
            page === 1 ? prisma.deal.aggregate({ where, _sum: { amount: true } }) : null,
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
            ...(sum && { totalAmount: Number(sum._sum.amount ?? 0) }),
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
            select: { id: true, isWon: true, isLost: true },
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

        // Omitted = the creator's own deal. Giving it to someone else (or nobody) needs
        // deal:all, like assigning does: without it you'd create a deal you then can't see.
        const ownerId = assignedToId === undefined ? user.id : assignedToId;

        if (ownerId !== user.id && !hasPermission(user, "deal:all")) {
            return NextResponse.json(
                { ok: false, message: "You can only create deals assigned to yourself" },
                { status: 403 }
            );
        }

        // Verify that the assigned agent belongs to this organization.
        if (ownerId !== null && ownerId !== user.id) {
            const agent = await prisma.user.findFirst({
                where: {
                    id: ownerId,
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
                assignedToId: ownerId,
                pipelineStageId,
                closedAt: closedAtFor(stage),
                createdById: user.id,
                updatedById: user.id,
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
                lead: dealLeadSelect,
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

        // a deal made for someone else lands in their bell
        await notify([deal.assignedToId], {
            organizationId: user.organizationId,
            actorId: user.id,
            type: "DEAL_ASSIGNED",
            title: `${firstName(user.name)} gave you a new deal`,
            body: deal.title,
            link: `/deals?open=${deal.id}`,
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