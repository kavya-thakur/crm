import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { hasPermission, leadScope, requirePermission } from "@/lib/auth/requirePermission";
import { mergeLeadsSchema, type MergeField } from "@/lib/validations/leads";
import { idParamSchema } from "@/lib/validations/common";
import { handleRouteError, parseBody, validationError } from "@/lib/api/http";

function isEmpty(value: unknown) {
    return value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0);
}

// a lead's custom field values, without the blank ones
function filledIn(customFields: Prisma.JsonValue) {
    return Object.fromEntries(Object.entries((customFields ?? {}) as Record<string, unknown>).filter(([, value]) => !isEmpty(value)));
}

/**
 * Folds a duplicate lead into this one: the duplicate's timeline, notes, tasks, activities
 * and deals all move here, then the duplicate is deleted. Where the two disagree, the fields
 * in `fromDuplicate` take the duplicate's value; empty fields are filled from it either way.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const user = await requirePermission("lead:update");

        // the duplicate is deleted, so merging needs the right to delete leads too
        if (!hasPermission(user, "lead:delete")) {
            throw new Error("FORBIDDEN");
        }

        const id = idParamSchema.safeParse((await params).id);

        if (!id.success) {
            return validationError(id.error);
        }

        const body = await parseBody(req, mergeLeadsSchema);

        if (!body.success) {
            return body.response;
        }

        const { duplicateId, fromDuplicate } = body.data;

        if (duplicateId === id.data) {
            return NextResponse.json({ ok: false, message: "Pick two different leads to merge" }, { status: 400 });
        }

        // both have to be leads this person can see; without lead:all that means both are
        // their own, so the owner can't change hands here without the right to reassign
        const [kept, duplicate] = await Promise.all(
            [id.data, duplicateId].map((leadId) => prisma.lead.findFirst({ where: { id: leadId, ...leadScope(user) } }))
        );

        if (!kept || !duplicate) {
            return NextResponse.json({ ok: false, message: "Lead not found" }, { status: 404 });
        }

        const pick = <K extends MergeField>(field: K) => (fromDuplicate.includes(field) ? duplicate[field] : kept[field] ?? duplicate[field]);
        const stageFromDuplicate = fromDuplicate.includes("stageId");
        const contact = [duplicate.email, duplicate.phone].filter(Boolean).join(" · ");

        const merged = await prisma.$transaction(async (tx) => {
            // everything that hangs off the duplicate moves over, keeping its own dates
            const move = { where: { leadId: duplicate.id }, data: { leadId: kept.id } };
            await tx.leadTimeline.updateMany(move);
            await tx.leadNote.updateMany(move);
            await tx.task.updateMany(move);
            await tx.scheduledActivity.updateMany(move);
            await tx.deal.updateMany(move);

            await tx.lead.delete({ where: { id: duplicate.id } });

            return tx.lead.update({
                where: { id: kept.id },
                data: {
                    name: pick("name"),
                    email: pick("email"),
                    phone: pick("phone"),
                    companyName: pick("companyName"),
                    sourceId: pick("sourceId"),
                    stageId: pick("stageId"),
                    assignedToId: pick("assignedToId"),
                    // the reason belongs to whichever stage was kept
                    lostReason: stageFromDuplicate ? duplicate.lostReason : kept.lostReason,
                    contactId: kept.contactId ?? duplicate.contactId,
                    // both sets of custom field values; where both have one, this lead's wins
                    customFields: { ...filledIn(duplicate.customFields), ...filledIn(kept.customFields) } as Prisma.InputJsonObject,
                    // the person first showed up when the older of the two was added
                    createdAt: duplicate.createdAt < kept.createdAt ? duplicate.createdAt : kept.createdAt,
                    updatedById: user.id,
                    timeline: {
                        create: {
                            userId: user.id,
                            type: "MERGED",
                            message: `Merged with a duplicate: ${duplicate.name}${contact ? ` (${contact})` : ""}`,
                        },
                    },
                },
                include: {
                    assignedTo: { select: { id: true, name: true, email: true } },
                    contact: { select: { id: true, name: true } },
                    stage: true,
                    source: true,
                },
            });
        });

        return NextResponse.json({ ok: true, data: merged });
    } catch (error) {
        return handleRouteError(error, "Merge leads");
    }
}
