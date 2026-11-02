import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { dealScope, hasPermission, requirePermission } from "@/lib/auth/requirePermission";
import { mergeDealsSchema, MERGE_DEAL_FIELDS } from "@/lib/validations/deals";
import { idParamSchema } from "@/lib/validations/common";
import { handleRouteError, parseBody, validationError } from "@/lib/api/http";
import { dealLeadSelect } from "@/lib/deals";

type MergeField = (typeof MERGE_DEAL_FIELDS)[number];

function isEmpty(value: unknown) {
    return value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0);
}

// a deal's custom field values, without the blank ones
function filledIn(customFields: Prisma.JsonValue) {
    return Object.fromEntries(Object.entries((customFields ?? {}) as Record<string, unknown>).filter(([, value]) => !isEmpty(value)));
}

/**
 * Folds a duplicate deal into this one: the duplicate's timeline, notes, tasks and activities
 * move here, then the duplicate is deleted. Where the two disagree, the fields in
 * `fromDuplicate` take the duplicate's value; empty fields are filled from it either way.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const user = await requirePermission("deal:update");

        // the duplicate is deleted, so merging needs the right to delete deals too
        if (!hasPermission(user, "deal:delete")) {
            throw new Error("FORBIDDEN");
        }

        const id = idParamSchema.safeParse((await params).id);

        if (!id.success) {
            return validationError(id.error);
        }

        const body = await parseBody(req, mergeDealsSchema);

        if (!body.success) {
            return body.response;
        }

        const { duplicateId, fromDuplicate } = body.data;

        if (duplicateId === id.data) {
            return NextResponse.json({ ok: false, message: "Pick two different deals to merge" }, { status: 400 });
        }

        // both have to be deals this person can see; without deal:all that means both are
        // their own, so the owner can't change hands here without the right to reassign
        const [kept, duplicate] = await Promise.all(
            [id.data, duplicateId].map((dealId) => prisma.deal.findFirst({ where: { id: dealId, ...dealScope(user) } }))
        );

        if (!kept || !duplicate) {
            return NextResponse.json({ ok: false, message: "Deal not found" }, { status: 404 });
        }

        // an amount of 0 is the default for "not known yet", so it counts as empty
        const blank = <K extends MergeField>(field: K, value: (typeof kept)[K]) => value === null || (field === "amount" && Number(value) === 0);
        const pick = <K extends MergeField>(field: K) =>
            fromDuplicate.includes(field) || blank(field, kept[field]) ? duplicate[field] : kept[field];
        // whether it's open, won or lost (and when, and why) goes with the stage that's kept
        const stageOwner = fromDuplicate.includes("pipelineStageId") ? duplicate : kept;

        const merged = await prisma.$transaction(async (tx) => {
            // everything that hangs off the duplicate moves over, keeping its own dates
            const move = { where: { dealId: duplicate.id }, data: { dealId: kept.id } };
            await tx.dealTimeline.updateMany(move);
            await tx.dealNote.updateMany(move);
            await tx.task.updateMany(move);
            await tx.scheduledActivity.updateMany(move);

            await tx.deal.delete({ where: { id: duplicate.id } });

            return tx.deal.update({
                where: { id: kept.id },
                data: {
                    title: pick("title"),
                    amount: pick("amount"),
                    probability: pick("probability"),
                    expectedCloseDate: pick("expectedCloseDate"),
                    leadId: pick("leadId"),
                    assignedToId: pick("assignedToId"),
                    description: pick("description"),
                    pipelineStageId: stageOwner.pipelineStageId,
                    closedAt: stageOwner.closedAt,
                    lostReason: stageOwner.lostReason,
                    // both sets of custom field values; where both have one, this deal's wins
                    customFields: { ...filledIn(duplicate.customFields), ...filledIn(kept.customFields) } as Prisma.InputJsonObject,
                    createdAt: duplicate.createdAt < kept.createdAt ? duplicate.createdAt : kept.createdAt,
                    updatedById: user.id,
                    timeline: {
                        create: {
                            userId: user.id,
                            type: "MERGED",
                            message: `Merged with a duplicate: ${duplicate.title}`,
                        },
                    },
                },
                include: {
                    lead: dealLeadSelect,
                    assignedTo: { select: { id: true, name: true, email: true } },
                    pipelineStage: true,
                },
            });
        });

        return NextResponse.json({ ok: true, data: merged });
    } catch (error) {
        return handleRouteError(error, "Merge deals");
    }
}
