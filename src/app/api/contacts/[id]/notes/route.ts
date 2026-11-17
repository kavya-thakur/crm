import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/db/prisma";
import { contactScope, requirePermission } from "@/lib/auth/requirePermission";
import { createNoteSchema } from "@/lib/validations/notes";
import { idParamSchema, paginationSchema, searchParamsToObject } from "@/lib/validations/common";
import { handleRouteError, parseBody, validationError } from "@/lib/api/http";
import { firstName, notify } from "@/lib/realtime/notify";
import { noteOnTimeline } from "@/lib/work/timeline";

const authorSelect = { select: { id: true, name: true, email: true } };

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const user = await requirePermission("contact:read");

        const id = idParamSchema.safeParse((await params).id);

        if (!id.success) {
            return validationError(id.error);
        }

        const query = paginationSchema.safeParse(searchParamsToObject(req.nextUrl.searchParams));

        if (!query.success) {
            return validationError(query.error);
        }

        const { page, limit } = query.data;
        const contactId = id.data;
        const skip = (page - 1) * limit;

        const contact = await prisma.contact.findFirst({
            where: { id: contactId, ...contactScope(user) },
            select: { id: true },
        });

        if (!contact) {
            return NextResponse.json({ ok: false, message: "Contact not found" }, { status: 404 });
        }

        const [notes, total] = await Promise.all([
            prisma.contactNote.findMany({
                where: { contactId: contact.id },
                include: { author: authorSelect },
                orderBy: [{ createdAt: "asc" }, { id: "asc" }],
                skip,
                take: limit,
            }),
            prisma.contactNote.count({ where: { contactId: contact.id } }),
        ]);

        return NextResponse.json({
            ok: true,
            data: notes,
            pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
        });
    } catch (error) {
        return handleRouteError(error, "Get contact notes");
    }
}

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const user = await requirePermission("contact:read");

        const id = idParamSchema.safeParse((await params).id);

        if (!id.success) {
            return validationError(id.error);
        }

        const body = await parseBody(req, createNoteSchema);

        if (!body.success) {
            return body.response;
        }

        const contact = await prisma.contact.findFirst({
            where: { id: id.data, ...contactScope(user) },
            select: { id: true, name: true },
        });

        if (!contact) {
            return NextResponse.json({ ok: false, message: "Contact not found" }, { status: 404 });
        }

        const { body: text, mentionedUserIds } = body.data;

        const mentioned = mentionedUserIds.length > 0
            ? await prisma.user.findMany({
                where: { id: { in: mentionedUserIds }, organizationId: user.organizationId },
                select: { id: true },
            })
            : [];

        // the note, and the same note on the contact's timeline (kept in step when it's edited or deleted)
        const note = await prisma.$transaction(async (tx) => {
            const note = await tx.contactNote.create({
                data: {
                    contactId: contact.id,
                    authorId: user.id,
                    body: text,
                    mentionedUserIds: mentioned.map((agent) => agent.id),
                },
                include: { author: authorSelect },
            });
            await tx.contactTimeline.create({ data: { contactId: contact.id, userId: user.id, ...noteOnTimeline(note) } });
            return note;
        });

        // everyone @-mentioned hears about it
        await notify(note.mentionedUserIds, {
            organizationId: user.organizationId,
            actorId: user.id,
            type: "MENTIONED",
            title: `${firstName(user.name)} mentioned you on ${contact.name}`,
            body: text.length > 140 ? `${text.slice(0, 140)}…` : text,
            link: `/contacts?open=${contact.id}`,
        });

        return NextResponse.json({ ok: true, data: note }, { status: 201 });
    } catch (error) {
        return handleRouteError(error, "Create contact note");
    }
}
