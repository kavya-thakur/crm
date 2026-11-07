import { NextRequest, NextResponse } from "next/server";

import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import { contactScope, hasPermission, requirePermission, type CurrentUser } from "@/lib/auth/requirePermission";
import { handleRouteError, parseBody, validationError } from "@/lib/api/http";
import { createCompanySchema, listCompaniesQuerySchema } from "@/lib/validations/companies";

const PAGE_SIZE = 50;

// The companies, A to Z, each with its contacts and its deals' open and won totals
export async function GET(req: NextRequest) {
    try {
        // companies are where contacts work, so seeing them is part of seeing contacts
        const user = await requirePermission("contact:read");

        const params = req.nextUrl.searchParams;
        const query = listCompaniesQuerySchema.safeParse({ search: params.get("search") || undefined, page: params.get("page") ?? undefined });
        if (!query.success) return validationError(query.error);
        const { search, page } = query.data;

        const where = {
            organizationId: user.organizationId,
            ...(search && {
                OR: [{ name: { contains: search, mode: "insensitive" as const } }, { industry: { contains: search, mode: "insensitive" as const } }],
            }),
        };
        const [companies, total] = await Promise.all([
            prisma.company.findMany({
                where,
                orderBy: [{ name: "asc" }, { id: "asc" }],
                skip: (page - 1) * PAGE_SIZE,
                take: PAGE_SIZE,
                select: {
                    id: true,
                    name: true,
                    website: true,
                    industry: true,
                    // only the contacts this person can see
                    _count: { select: { contacts: { where: contactScope(user) } } },
                },
            }),
            prisma.company.count({ where }),
        ]);

        const totals = await dealTotals(user, companies.map((company) => company.id));

        return NextResponse.json({
            ok: true,
            data: companies.map(({ _count, ...company }) => ({
                ...company,
                contacts: _count.contacts,
                deals: totals && (totals.get(company.id) ?? { open: 0, openValue: 0, wonValue: 0 }),
            })),
            total,
            pageSize: PAGE_SIZE,
        });
    } catch (error) {
        return handleRouteError(error, "List companies");
    }
}

export async function POST(req: NextRequest) {
    try {
        const user = await requirePermission("contact:create");

        const body = await parseBody(req, createCompanySchema);
        if (!body.success) return body.response;

        // one company per name: "acme" and "Acme" are the same company
        const existing = await prisma.company.findFirst({
            where: { organizationId: user.organizationId, name: { equals: body.data.name, mode: "insensitive" } },
            select: { id: true, name: true },
        });
        if (existing) {
            return NextResponse.json({ ok: false, message: `${existing.name} is already a company`, data: existing }, { status: 409 });
        }

        const company = await prisma.company.create({ data: { ...body.data, organizationId: user.organizationId } });
        return NextResponse.json({ ok: true, message: "Company created", data: company }, { status: 201 });
    } catch (error) {
        return handleRouteError(error, "Create company");
    }
}

/**
 * Each company's deals (a deal belongs to a company through its lead's contact): how many are open
 * and worth what, and what's been won. Only deals this person can see; null without deal access
 * (a company with no deals isn't in the map: it has none).
 * One grouped query for the whole page, not one per company.
 */
async function dealTotals(user: CurrentUser, companyIds: number[]) {
    if (!hasPermission(user, "deal:read")) return null;
    const totals = new Map<number, { open: number; openValue: number; wonValue: number }>();
    if (companyIds.length === 0) return totals;

    const mine = hasPermission(user, "deal:all") ? Prisma.empty : Prisma.sql`AND d."assignedToId" = ${user.id}`;
    const rows = await prisma.$queryRaw<{ companyId: number; open: bigint; openValue: Prisma.Decimal | null; wonValue: Prisma.Decimal | null }[]>`
        SELECT c."companyId",
               COUNT(*) FILTER (WHERE d."closedAt" IS NULL) AS "open",
               SUM(d."amount") FILTER (WHERE d."closedAt" IS NULL) AS "openValue",
               SUM(d."amount") FILTER (WHERE s."isWon") AS "wonValue"
        FROM "Deal" d
        JOIN "Lead" l ON l."id" = d."leadId"
        JOIN "Contact" c ON c."id" = l."contactId"
        JOIN "PipelineStage" s ON s."id" = d."pipelineStageId"
        WHERE d."organizationId" = ${user.organizationId} AND c."companyId" IN (${Prisma.join(companyIds)}) ${mine}
        GROUP BY c."companyId"`;

    for (const row of rows) {
        totals.set(row.companyId, { open: Number(row.open), openValue: Number(row.openValue ?? 0), wonValue: Number(row.wonValue ?? 0) });
    }
    return totals;
}
