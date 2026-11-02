import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/db/prisma";
import { dealScope, requirePermission } from "@/lib/auth/requirePermission";
import { createNoteSchema } from "@/lib/validations/notes";
import { idParamSchema, paginationSchema, searchParamsToObject } from "@/lib/validations/common";
import { handleRouteError, parseBody, validationError } from "@/lib/api/http";
import { firstName, notify } from "@/lib/realtime/notify";

const authorSelect = { select: { id: true, name: true, email: true } };

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const user = await requirePermission("deal:read");

        const id = idParamSchema.safeParse((await params).id);

        if (!id.success) {
            return validationError(id.error);
        }

        const query = paginationSchema.safeParse(searchParamsToObject(req.nextUrl.searchParams));

        if (!query.success) {
            return validationError(query.error);
        }

        const { page, limit } = query.data;
        const dealId = id.data;
        const skip = (page - 1) * limit;

        const deal = await prisma.deal.findFirst({
            where: { id: dealId, ...dealScope(user) },
            select: { id: true },
        });

        if (!deal) {
            return NextResponse.json({ ok: false, message: "Deal not found" }, { status: 404 });
        }

        const [notes, total] = await Promise.all([
            prisma.dealNote.findMany({
                where: { dealId: deal.id },
                include: { author: authorSelect },
                orderBy: [{ createdAt: "asc" }, { id: "asc" }],
                skip,
                take: limit,
            }),
            prisma.dealNote.count({ where: { dealId: deal.id } }),
        ]);

        return NextResponse.json({
            ok: true,
            data: notes,
            pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
        });
    } catch (error) {
        return handleRouteError(error, "Get deal notes");
    }
}

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const user = await requirePermission("deal:read");

        const id = idParamSchema.safeParse((await params).id);

        if (!id.success) {
            return validationError(id.error);
        }

        const body = await parseBody(req, createNoteSchema);

        if (!body.success) {
            return body.response;
        }

        const deal = await prisma.deal.findFirst({
            where: { id: id.data, ...dealScope(user) },
            select: { id: true, title: true },
        });

        if (!deal) {
            return NextResponse.json({ ok: false, message: "Deal not found" }, { status: 404 });
        }

        const { body: text, mentionedUserIds } = body.data;

        const mentioned = mentionedUserIds.length > 0
            ? await prisma.user.findMany({
                where: { id: { in: mentionedUserIds }, organizationId: user.organizationId },
                select: { id: true },
            })
            : [];

        const note = await prisma.dealNote.create({
            data: {
                dealId: deal.id,
                authorId: user.id,
                body: text,
                mentionedUserIds: mentioned.map((agent) => agent.id),
            },
            include: { author: authorSelect },
        });

        // everyone @-mentioned hears about it
        await notify(note.mentionedUserIds, {
            organizationId: user.organizationId,
            actorId: user.id,
            type: "MENTIONED",
            title: `${firstName(user.name)} mentioned you on ${deal.title}`,
            body: text.length > 140 ? `${text.slice(0, 140)}…` : text,
            link: `/deals?open=${deal.id}`,
        });

        return NextResponse.json({ ok: true, data: note }, { status: 201 });
    } catch (error) {
        return handleRouteError(error, "Create deal note");
    }
}
