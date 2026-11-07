import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/db/prisma";
import { contactScope, dealScope, hasPermission, requirePermission } from "@/lib/auth/requirePermission";
import { handleRouteError, parseBody, validationError } from "@/lib/api/http";
import { idParamSchema } from "@/lib/validations/common";
import { updateCompanySchema } from "@/lib/validations/companies";

type Context = { params: Promise<{ id: string }> };

const notFound = () => NextResponse.json({ ok: false, message: "Company not found" }, { status: 404 });

// How many of a company's contacts and deals the panel lists; the totals count them all
const SHOWN = 100;

// One company: its details, its contacts, and the deals made with them (each as far as this person can see)
export async function GET(_req: NextRequest, { params }: Context) {
    try {
        const user = await requirePermission("contact:read");

        const id = idParamSchema.safeParse((await params).id);
        if (!id.success) return validationError(id.error);

        const company = await prisma.company.findFirst({ where: { id: id.data, organizationId: user.organizationId } });
        if (!company) return notFound();

        const ofCompany = { companyId: company.id, ...contactScope(user) };
        const seesDeals = hasPermission(user, "deal:read");
        // a deal is the company's when the lead it came from is one of the company's contacts
        const dealsWhere = { ...dealScope(user), lead: { contact: { companyId: company.id } } };

        const [contacts, contactTotal, deals, dealTotal] = await Promise.all([
            prisma.contact.findMany({
                where: ofCompany,
                orderBy: { name: "asc" },
                take: SHOWN,
                select: { id: true, name: true, email: true, phone: true, jobTitle: true },
            }),
            prisma.contact.count({ where: ofCompany }),
            seesDeals
                ? prisma.deal.findMany({
                      where: dealsWhere,
                      orderBy: [{ closedAt: { sort: "desc", nulls: "first" } }, { createdAt: "desc" }],
                      take: SHOWN,
                      select: {
                          id: true,
                          title: true,
                          amount: true,
                          closedAt: true,
                          expectedCloseDate: true,
                          pipelineStage: { select: { name: true, color: true, isWon: true, isLost: true } },
                      },
                  })
                : null,
            seesDeals ? prisma.deal.count({ where: dealsWhere }) : 0,
        ]);

        // the money, over every deal (not only the ones listed)
        const sums = seesDeals
            ? await Promise.all([
                  prisma.deal.aggregate({ where: { ...dealsWhere, closedAt: null }, _sum: { amount: true }, _count: true }),
                  prisma.deal.aggregate({ where: { ...dealsWhere, pipelineStage: { isWon: true } }, _sum: { amount: true }, _count: true }),
              ])
            : null;

        return NextResponse.json({
            ok: true,
            data: {
                ...company,
                contacts: { total: contactTotal, items: contacts },
                deals: deals && {
                    total: dealTotal,
                    items: deals.map((deal) => ({ ...deal, amount: Number(deal.amount) })),
                    open: { count: sums![0]._count, value: Number(sums![0]._sum.amount ?? 0) },
                    won: { count: sums![1]._count, value: Number(sums![1]._sum.amount ?? 0) },
                },
            },
        });
    } catch (error) {
        return handleRouteError(error, "Get company");
    }
}

export async function PUT(req: NextRequest, { params }: Context) {
    try {
        const user = await requirePermission("contact:update");

        const id = idParamSchema.safeParse((await params).id);
        if (!id.success) return validationError(id.error);

        const body = await parseBody(req, updateCompanySchema);
        if (!body.success) return body.response;

        // a new name can't be another company's
        if (body.data.name) {
            const taken = await prisma.company.findFirst({
                where: { organizationId: user.organizationId, name: { equals: body.data.name, mode: "insensitive" }, id: { not: id.data } },
                select: { name: true },
            });
            if (taken) return NextResponse.json({ ok: false, message: `${taken.name} is already a company` }, { status: 409 });
        }

        const { count } = await prisma.company.updateMany({ where: { id: id.data, organizationId: user.organizationId }, data: body.data });
        if (count === 0) return notFound();

        return NextResponse.json({ ok: true, message: "Company saved" });
    } catch (error) {
        return handleRouteError(error, "Update company");
    }
}

// Deletes the company only: its contacts stay, just without a company
export async function DELETE(_req: NextRequest, { params }: Context) {
    try {
        const user = await requirePermission("contact:delete");

        const id = idParamSchema.safeParse((await params).id);
        if (!id.success) return validationError(id.error);

        const { count } = await prisma.company.deleteMany({ where: { id: id.data, organizationId: user.organizationId } });
        if (count === 0) return notFound();

        return NextResponse.json({ ok: true, message: "Company deleted" });
    } catch (error) {
        return handleRouteError(error, "Delete company");
    }
}
