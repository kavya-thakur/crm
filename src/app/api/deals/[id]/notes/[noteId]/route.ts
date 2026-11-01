import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/db/prisma";
import { dealScope, requirePermission } from "@/lib/auth/requirePermission";
import { updateNoteSchema } from "@/lib/validations/notes";
import { idParamSchema } from "@/lib/validations/common";
import { handleRouteError, parseBody, validationError } from "@/lib/api/http";

const authorSelect = { select: { id: true, name: true, email: true } };

type Params = { params: Promise<{ id: string; noteId: string }> };

function noteNotFound() {
    return NextResponse.json({ ok: false, message: "Note not found" }, { status: 404 });
}

export async function PATCH(req: NextRequest, { params }: Params) {
    try {
        const user = await requirePermission("deal:read");

        const { id, noteId } = await params;
        const dealId = idParamSchema.safeParse(id);
        const parsedNoteId = idParamSchema.safeParse(noteId);

        if (!dealId.success) return validationError(dealId.error);
        if (!parsedNoteId.success) return validationError(parsedNoteId.error);

        const body = await parseBody(req, updateNoteSchema);

        if (!body.success) {
            return body.response;
        }

        const deal = await prisma.deal.findFirst({
            where: { id: dealId.data, ...dealScope(user) },
            select: { id: true },
        });

        if (!deal) return noteNotFound();

        const existing = await prisma.dealNote.findFirst({
            where: { id: parsedNoteId.data, dealId: deal.id },
            select: { authorId: true },
        });

        if (!existing) return noteNotFound();

        if (existing.authorId !== user.id) {
            throw new Error("FORBIDDEN");
        }

        const { body: text, mentionedUserIds } = body.data;

        const mentioned = mentionedUserIds.length > 0
            ? await prisma.user.findMany({
                where: { id: { in: mentionedUserIds }, organizationId: user.organizationId },
                select: { id: true },
            })
            : [];

        const note = await prisma.dealNote.update({
            where: { id: parsedNoteId.data },
            data: { body: text, mentionedUserIds: mentioned.map((agent) => agent.id) },
            include: { author: authorSelect },
        });

        return NextResponse.json({ ok: true, data: note });
    } catch (error) {
        return handleRouteError(error, "Update deal note");
    }
}

export async function DELETE(req: NextRequest, { params }: Params) {
    try {
        const user = await requirePermission("deal:read");

        const { id, noteId } = await params;
        const dealId = idParamSchema.safeParse(id);
        const parsedNoteId = idParamSchema.safeParse(noteId);

        if (!dealId.success) return validationError(dealId.error);
        if (!parsedNoteId.success) return validationError(parsedNoteId.error);

        const deal = await prisma.deal.findFirst({
            where: { id: dealId.data, ...dealScope(user) },
            select: { id: true },
        });

        if (!deal) return noteNotFound();

        const existing = await prisma.dealNote.findFirst({
            where: { id: parsedNoteId.data, dealId: deal.id },
            select: { authorId: true },
        });

        if (!existing) return noteNotFound();

        if (existing.authorId !== user.id) {
            throw new Error("FORBIDDEN");
        }

        await prisma.dealNote.delete({ where: { id: parsedNoteId.data } });

        return NextResponse.json({ ok: true, message: "Note deleted successfully" });
    } catch (error) {
        return handleRouteError(error, "Delete deal note");
    }
}
