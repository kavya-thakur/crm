import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/db/prisma";
import { contactScope, requirePermission } from "@/lib/auth/requirePermission";
import { updateNoteSchema } from "@/lib/validations/notes";
import { idParamSchema } from "@/lib/validations/common";
import { handleRouteError, parseBody, validationError } from "@/lib/api/http";
import { noteEntry, noteOnTimeline } from "@/lib/work/timeline";

const authorSelect = { select: { id: true, name: true, email: true } };

type Params = { params: Promise<{ id: string; noteId: string }> };

function noteNotFound() {
    return NextResponse.json({ ok: false, message: "Note not found" }, { status: 404 });
}

export async function PATCH(req: NextRequest, { params }: Params) {
    try {
        const user = await requirePermission("contact:read");

        const { id, noteId } = await params;
        const contactId = idParamSchema.safeParse(id);
        const parsedNoteId = idParamSchema.safeParse(noteId);

        if (!contactId.success) return validationError(contactId.error);
        if (!parsedNoteId.success) return validationError(parsedNoteId.error);

        const body = await parseBody(req, updateNoteSchema);

        if (!body.success) {
            return body.response;
        }

        const contact = await prisma.contact.findFirst({
            where: { id: contactId.data, ...contactScope(user) },
            select: { id: true },
        });

        if (!contact) return noteNotFound();

        const existing = await prisma.contactNote.findFirst({
            where: { id: parsedNoteId.data, contactId: contact.id },
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

        // the note, and its card on the timeline
        const note = await prisma.$transaction(async (tx) => {
            const note = await tx.contactNote.update({
                where: { id: parsedNoteId.data },
                data: { body: text, mentionedUserIds: mentioned.map((agent) => agent.id) },
                include: { author: authorSelect },
            });
            await tx.contactTimeline.updateMany({ where: { contactId: contact.id, ...noteEntry(note.id) }, data: noteOnTimeline(note) });
            return note;
        });

        return NextResponse.json({ ok: true, data: note });
    } catch (error) {
        return handleRouteError(error, "Update contact note");
    }
}

export async function DELETE(req: NextRequest, { params }: Params) {
    try {
        const user = await requirePermission("contact:read");

        const { id, noteId } = await params;
        const contactId = idParamSchema.safeParse(id);
        const parsedNoteId = idParamSchema.safeParse(noteId);

        if (!contactId.success) return validationError(contactId.error);
        if (!parsedNoteId.success) return validationError(parsedNoteId.error);

        const contact = await prisma.contact.findFirst({
            where: { id: contactId.data, ...contactScope(user) },
            select: { id: true },
        });

        if (!contact) return noteNotFound();

        const existing = await prisma.contactNote.findFirst({
            where: { id: parsedNoteId.data, contactId: contact.id },
            select: { authorId: true },
        });

        if (!existing) return noteNotFound();

        if (existing.authorId !== user.id) {
            throw new Error("FORBIDDEN");
        }

        // gone from the timeline too
        await prisma.$transaction([
            prisma.contactTimeline.deleteMany({ where: { contactId: contact.id, ...noteEntry(parsedNoteId.data) } }),
            prisma.contactNote.delete({ where: { id: parsedNoteId.data } }),
        ]);

        return NextResponse.json({ ok: true, message: "Note deleted successfully" });
    } catch (error) {
        return handleRouteError(error, "Delete contact note");
    }
}
