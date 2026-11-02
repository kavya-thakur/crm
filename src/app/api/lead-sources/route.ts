import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/auth/requirePermission";
import { placeholderName, planOptionList } from "@/lib/settings/optionLists";
import { handleRouteError, parseBody } from "@/lib/api/http";
import { createLeadSourceSchema, saveLeadSourcesSchema } from "@/lib/validations/leadSources";

export async function GET() {
    try {
        // sources show up in the lead form's picker, so anyone who can see leads needs them
        const user = await requirePermission("lead:read");

        const sources = await prisma.leadSource.findMany({
            where: { organizationId: user.organizationId },
            // id as tie-breaker so sources with the same order never swap places
            orderBy: [{ order: "asc" }, { id: "asc" }],
        });

        return NextResponse.json({ ok: true, data: sources });
    } catch (error) {
        return handleRouteError(error, "Get lead sources");
    }
}

export async function POST(req: NextRequest) {
    try {
        const user = await requirePermission("lead-sources:manage");

        const body = await parseBody(req, createLeadSourceSchema);

        if (!body.success) {
            return body.response;
        }

        // new sources go at the end of the list
        const last = await prisma.leadSource.findFirst({
            where: { organizationId: user.organizationId },
            orderBy: { order: "desc" },
            select: { order: true },
        });

        const source = await prisma.leadSource.create({
            data: {
                ...body.data,
                order: (last?.order ?? -1) + 1,
                organizationId: user.organizationId,
            },
        });

        return NextResponse.json({ ok: true, data: source }, { status: 201 });
    } catch (error) {
        return handleRouteError(error, "Create lead source");
    }
}

// Saves the whole list from the settings page in one go: renames, colours, order, new
// sources and removed ones. All or nothing. Removing a source just clears it on the
// leads that used it (Lead.sourceId is optional).
export async function PUT(req: NextRequest) {
    try {
        const user = await requirePermission("lead-sources:manage");

        const body = await parseBody(req, saveLeadSourcesSchema);

        if (!body.success) {
            return body.response;
        }

        const existing = await prisma.leadSource.findMany({
            where: { organizationId: user.organizationId },
            select: { id: true },
        });

        const plan = planOptionList(existing.map((source) => source.id), body.data.options);

        if (!plan.ok) {
            return NextResponse.json({ ok: false, message: plan.message }, { status: 400 });
        }

        await prisma.$transaction(async (tx) => {
            await tx.leadSource.deleteMany({
                where: { id: { in: plan.removeIds }, organizationId: user.organizationId },
            });

            for (const source of plan.updates) {
                await tx.leadSource.update({
                    where: { id: source.id, organizationId: user.organizationId },
                    data: { name: placeholderName(source.id) },
                });
            }

            for (const { id, ...source } of plan.updates) {
                await tx.leadSource.update({
                    where: { id, organizationId: user.organizationId },
                    data: source,
                });
            }

            for (const source of plan.creates) {
                await tx.leadSource.create({
                    data: { ...source, organizationId: user.organizationId },
                });
            }
        });

        const sources = await prisma.leadSource.findMany({
            where: { organizationId: user.organizationId },
            orderBy: [{ order: "asc" }, { id: "asc" }],
        });

        return NextResponse.json({ ok: true, data: sources });
    } catch (error) {
        return handleRouteError(error, "Save lead sources");
    }
}
