import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { hasPermission, leadScope, dealScope, contactScope } from "@/lib/auth/requirePermission";
import { listNoteFeedQuerySchema } from "@/lib/validations/notes";
import { searchParamsToObject } from "@/lib/validations/common";
import { handleRouteError, validationError } from "@/lib/api/http";

const authorSelect = { select: { id: true, name: true, email: true } } as const;

export type NoteFeedEntity = "lead" | "deal" | "contact";

export interface NoteFeedItem {
    id: number;
    entity: NoteFeedEntity;
    recordId: number;
    recordLabel: string;
    body: string;
    mentionedUserIds: number[];
    createdAt: string;
    author: { id: number; name: string; email: string };
}

// Notes live in three separate tables (LeadNote/DealNote/ContactNote, mirroring
// the per-entity Timeline tables), so this feed queries each one the caller
// can read and merges the results in memory. ponytail: an approximate merge
// (top `limit` from each table, then re-sliced), not true cross-table cursor
// pagination — fine at CRM-demo scale; a single notes table with an
// entity+id column would be the upgrade path if volume ever demands it.
export async function GET(req: NextRequest) {
    try {
        const user = await getCurrentUser();

        if (!user) {
            throw new Error("UNAUTHORIZED");
        }

        const query = listNoteFeedQuerySchema.safeParse(searchParamsToObject(req.nextUrl.searchParams));

        if (!query.success) {
            return validationError(query.error);
        }

        const { scope, limit } = query.data;

        const mentionFilter = (userId: number) =>
            scope === "mine"
                ? { authorId: userId }
                : scope === "mentions"
                    ? { mentionedUserIds: { has: userId } }
                    : { OR: [{ authorId: userId }, { mentionedUserIds: { has: userId } }] };

        const items: NoteFeedItem[] = [];

        if (hasPermission(user, "lead:read")) {
            const notes = await prisma.leadNote.findMany({
                where: { lead: { ...leadScope(user) }, ...mentionFilter(user.id) },
                include: { author: authorSelect, lead: { select: { id: true, name: true } } },
                orderBy: { createdAt: "desc" },
                take: limit,
            });

            items.push(
                ...notes.map((note) => ({
                    id: note.id,
                    entity: "lead" as const,
                    recordId: note.leadId,
                    recordLabel: note.lead.name,
                    body: note.body,
                    mentionedUserIds: note.mentionedUserIds,
                    createdAt: note.createdAt.toISOString(),
                    author: note.author,
                }))
            );
        }

        if (hasPermission(user, "deal:read")) {
            const notes = await prisma.dealNote.findMany({
                where: { deal: { ...dealScope(user) }, ...mentionFilter(user.id) },
                include: { author: authorSelect, deal: { select: { id: true, title: true } } },
                orderBy: { createdAt: "desc" },
                take: limit,
            });

            items.push(
                ...notes.map((note) => ({
                    id: note.id,
                    entity: "deal" as const,
                    recordId: note.dealId,
                    recordLabel: note.deal.title,
                    body: note.body,
                    mentionedUserIds: note.mentionedUserIds,
                    createdAt: note.createdAt.toISOString(),
                    author: note.author,
                }))
            );
        }

        if (hasPermission(user, "contact:read")) {
            const notes = await prisma.contactNote.findMany({
                where: { contact: { ...contactScope(user) }, ...mentionFilter(user.id) },
                include: { author: authorSelect, contact: { select: { id: true, name: true } } },
                orderBy: { createdAt: "desc" },
                take: limit,
            });

            items.push(
                ...notes.map((note) => ({
                    id: note.id,
                    entity: "contact" as const,
                    recordId: note.contactId,
                    recordLabel: note.contact.name,
                    body: note.body,
                    mentionedUserIds: note.mentionedUserIds,
                    createdAt: note.createdAt.toISOString(),
                    author: note.author,
                }))
            );
        }

        items.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

        return NextResponse.json({ ok: true, data: items.slice(0, limit) });
    } catch (error) {
        return handleRouteError(error, "Get notes feed");
    }
}
