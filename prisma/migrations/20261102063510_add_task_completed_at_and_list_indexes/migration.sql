-- DropIndex
DROP INDEX "Deal_organizationId_pipelineStageId_idx";

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "completedAt" TIMESTAMP(3);

-- Tasks already done: the last time they changed is the best guess we have
UPDATE "Task" SET "completedAt" = "updatedAt" WHERE "status" = 'COMPLETED';

-- CreateIndex
CREATE INDEX "Contact_organizationId_createdAt_idx" ON "Contact"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "Deal_organizationId_createdAt_idx" ON "Deal"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "Deal_organizationId_pipelineStageId_createdAt_idx" ON "Deal"("organizationId", "pipelineStageId", "createdAt");

-- CreateIndex
CREATE INDEX "Lead_organizationId_createdAt_idx" ON "Lead"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "Lead_organizationId_stageId_createdAt_idx" ON "Lead"("organizationId", "stageId", "createdAt");

-- CreateIndex
CREATE INDEX "Task_organizationId_completedAt_idx" ON "Task"("organizationId", "completedAt");
