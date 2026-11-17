import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/db/prisma";
import { leadScope, requirePermission } from "@/lib/auth/requirePermission";
import { createNoteSchema } from "@/lib/validations/notes";
import { idParamSchema, paginationSchema, searchParamsToObject } from "@/lib/validations/common";
import { handleRouteError, parseBody, validationError } from "@/lib/api/http";
import { firstName, notify } from "@/lib/realtime/notify";
import { notePreview } from "@/lib/work/timeline";

const authorSelect = { select: { id: true, name: true, email: true } };

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const user = await requirePermission("lead:read");

        const id = idParamSchema.safeParse((await params).id);

        if (!id.success) {
            return validationError(id.error);
        }

        const query = paginationSchema.safeParse(searchParamsToObject(req.nextUrl.searchParams));

        if (!query.success) {
            return validationError(query.error);
        }

        const { page, limit } = query.data;
        const leadId = id.data;
        const skip = (page - 1) * limit;

        // Make sure the lead is one this user can see
        const lead = await prisma.lead.findFirst({
            where: { id: leadId, ...leadScope(user) },
            select: { id: true },
        });

        if (!lead) {
            return NextResponse.json({ ok: false, message: "Lead not found" }, { status: 404 });
        }

        const [notes, total] = await Promise.all([
            prisma.leadNote.findMany({
                where: { leadId: lead.id },
                include: { author: authorSelect },
                // oldest first, like a comment thread
                orderBy: [{ createdAt: "asc" }, { id: "asc" }],
                skip,
                take: limit,
            }),
            prisma.leadNote.count({ where: { leadId: lead.id } }),
        ]);

        return NextResponse.json({
            ok: true,
            data: notes,
            pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
        });
    } catch (error) {
        return handleRouteError(error, "Get lead notes");
    }
}

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const user = await requirePermission("lead:read");

        const id = idParamSchema.safeParse((await params).id);

        if (!id.success) {
            return validationError(id.error);
        }

        const body = await parseBody(req, createNoteSchema);

        if (!body.success) {
            return body.response;
        }

        const lead = await prisma.lead.findFirst({
            where: { id: id.data, ...leadScope(user) },
            select: { id: true, name: true },
        });

        if (!lead) {
            return NextResponse.json({ ok: false, message: "Lead not found" }, { status: 404 });
        }

        const { body: text, mentionedUserIds } = body.data;

        // Only mention agents that actually exist in this org
        const mentioned = mentionedUserIds.length > 0
            ? await prisma.user.findMany({
                where: { id: { in: mentionedUserIds }, organizationId: user.organizationId },
                select: { id: true },
            })
            : [];

        // the note, and a line on the lead's timeline saying it was added
        const [note] = await prisma.$transaction([
            prisma.leadNote.create({
                data: {
                    leadId: lead.id,
                    authorId: user.id,
                    body: text,
                    mentionedUserIds: mentioned.map((agent) => agent.id),
                },
                include: { author: authorSelect },
            }),
            prisma.leadTimeline.create({ data: { leadId: lead.id, userId: user.id, type: "NOTE_ADDED", message: notePreview(text) } }),
        ]);

        // everyone @-mentioned hears about it
        await notify(note.mentionedUserIds, {
            organizationId: user.organizationId,
            actorId: user.id,
            type: "MENTIONED",
            title: `${firstName(user.name)} mentioned you on ${lead.name}`,
            body: text.length > 140 ? `${text.slice(0, 140)}…` : text,
            link: `/leads?open=${lead.id}`,
        });

        return NextResponse.json({ ok: true, data: note }, { status: 201 });
    } catch (error) {
        return handleRouteError(error, "Create lead note");
    }
}
