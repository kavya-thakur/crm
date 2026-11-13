import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import { STAGE_COLORS } from "@/lib/settings/stageColors";

// Every organization starts with one pipeline of these stages (created on register, back-filled by the seed).
export const DEFAULT_PIPELINE_NAME = "Sales pipeline";
export const DEFAULT_PIPELINE_STAGES = [
    { name: "New", order: 0, color: STAGE_COLORS.sky },
    { name: "Qualified", order: 1, color: STAGE_COLORS.purple },
    { name: "Proposal", order: 2, color: STAGE_COLORS.amber },
    { name: "Negotiation", order: 3, color: STAGE_COLORS.orange },
    { name: "Won", order: 4, color: STAGE_COLORS.green, isWon: true },
    { name: "Lost", order: 5, color: STAGE_COLORS.red, isLost: true },
];

// A pipeline an admin adds starts shorter: they rename and add stages to fit it
export const NEW_PIPELINE_STAGES = [
    { name: "New", order: 0, color: STAGE_COLORS.sky },
    { name: "Qualified", order: 1, color: STAGE_COLORS.purple },
    { name: "Won", order: 2, color: STAGE_COLORS.green, isWon: true },
    { name: "Lost", order: 3, color: STAGE_COLORS.red, isLost: true },
];

// A pipeline's stages in board order (id breaks ties, so stages with the same order never swap places)
export const STAGE_ORDER = [{ order: "asc" }, { id: "asc" }] satisfies Prisma.PipelineStageOrderByWithRelationInput[];

// Every pipeline with its stages, in order: the deals board's switcher, and the stage pickers
export const pipelineWithStages = { stages: { orderBy: STAGE_ORDER } } satisfies Prisma.PipelineInclude;

// A pipeline with its stages, in one write: a new workspace's first, or one an admin adds
export function createPipeline(
    db: Prisma.TransactionClient,
    pipeline: { organizationId: number; name: string; order: number },
    stages: { name: string; order: number; color: string; isWon?: boolean; isLost?: boolean }[] = NEW_PIPELINE_STAGES,
) {
    return db.pipeline.create({
        data: { ...pipeline, stages: { create: stages.map((stage) => ({ ...stage, organizationId: pipeline.organizationId })) } },
        include: pipelineWithStages,
    });
}

// Two pipelines called "Renewals" and "renewals" would be one too many in the switcher: what to
// say when the name is taken, or null when it's free. (The unique index still catches a race, as a 409.)
export async function pipelineNameTaken(organizationId: number, name: string, exceptId?: number) {
    const same = await prisma.pipeline.findFirst({
        where: { organizationId, name: { equals: name, mode: "insensitive" }, ...(exceptId && { id: { not: exceptId } }) },
        select: { name: true },
    });
    return same ? `There's already a pipeline called ${same.name}` : null;
}

// A deal entering a won or lost stage closes now; entering any other stage reopens it.
// Every route that puts a deal in a stage sets Deal.closedAt from this.
export function closedAtFor(stage: { isWon: boolean; isLost: boolean }) {
    return stage.isWon || stage.isLost ? new Date() : null;
}
