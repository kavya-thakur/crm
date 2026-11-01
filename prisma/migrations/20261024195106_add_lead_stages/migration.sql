-- CreateTable
CREATE TABLE "LeadStage" (
    "id" SERIAL NOT NULL,
    "organizationId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "color" TEXT NOT NULL DEFAULT '#64748b',
    "isConverted" BOOLEAN NOT NULL DEFAULT false,
    "isLost" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeadStage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LeadStage_organizationId_order_idx" ON "LeadStage"("organizationId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "LeadStage_organizationId_name_key" ON "LeadStage"("organizationId", "name");

-- AddForeignKey
ALTER TABLE "LeadStage" ADD CONSTRAINT "LeadStage_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed every existing organization with the default lead stages (same shape as DEFAULT_PIPELINE_STAGES)
INSERT INTO "LeadStage" ("organizationId", "name", "order", "color", "isConverted", "isLost", "updatedAt")
SELECT o.id, d."name", d."order", d."color", d."isConverted", d."isLost", CURRENT_TIMESTAMP
FROM "Organization" o, (VALUES
    ('New', 0, '#00749e', false, false),
    ('Contacted', 1, '#a06e00', false, false),
    ('Qualified', 2, '#8145b5', false, false),
    ('Converted', 3, '#00824d', true, false),
    ('Lost', 4, '#ce2c31', false, true)
) AS d("name", "order", "color", "isConverted", "isLost");

-- AlterTable: add the new column nullable first, so existing rows can be backfilled below
ALTER TABLE "Lead" ADD COLUMN "stageId" INTEGER;

-- Backfill from the old enum status to the matching stage in the same organization
UPDATE "Lead" l
SET "stageId" = ls.id
FROM "LeadStage" ls
WHERE ls."organizationId" = l."organizationId"
  AND ls."name" = (CASE l."status"
        WHEN 'NEW' THEN 'New'
        WHEN 'CONTACTED' THEN 'Contacted'
        WHEN 'QUALIFIED' THEN 'Qualified'
        WHEN 'CONVERTED' THEN 'Converted'
        WHEN 'LOST' THEN 'Lost'
    END);

-- Every lead now has a stage
ALTER TABLE "Lead" ALTER COLUMN "stageId" SET NOT NULL;

-- DropIndex
DROP INDEX "Lead_status_idx";

-- AlterTable
ALTER TABLE "Lead" DROP COLUMN "status";

-- DropEnum
DROP TYPE "LeadStatus";

-- CreateIndex
CREATE INDEX "Lead_stageId_idx" ON "Lead"("stageId");

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "LeadStage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
