-- AlterTable
ALTER TABLE "Deal" ADD COLUMN     "closedAt" TIMESTAMP(3);

-- Deals already won or lost: the last time they changed is the best guess we have
UPDATE "Deal" AS d
SET "closedAt" = d."updatedAt"
FROM "PipelineStage" AS s
WHERE s."id" = d."pipelineStageId" AND (s."isWon" OR s."isLost");

-- CreateIndex
CREATE INDEX "Deal_organizationId_closedAt_idx" ON "Deal"("organizationId", "closedAt");
