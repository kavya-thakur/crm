-- Pipelines: several deal boards per workspace, each with its own stages.
CREATE TABLE "Pipeline" (
    "id" SERIAL NOT NULL,
    "organizationId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Pipeline_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Pipeline_organizationId_order_idx" ON "Pipeline"("organizationId", "order");
CREATE UNIQUE INDEX "Pipeline_organizationId_name_key" ON "Pipeline"("organizationId", "name");
ALTER TABLE "Pipeline" ADD CONSTRAINT "Pipeline_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Every workspace's existing stages become one pipeline, "Sales pipeline", so its deals stay where they are
INSERT INTO "Pipeline" ("organizationId", "name", "order", "updatedAt")
SELECT "id", 'Sales pipeline', 0, CURRENT_TIMESTAMP FROM "Organization";

ALTER TABLE "PipelineStage" ADD COLUMN "pipelineId" INTEGER;
UPDATE "PipelineStage" AS stage SET "pipelineId" = pipeline."id"
FROM "Pipeline" AS pipeline WHERE pipeline."organizationId" = stage."organizationId";
ALTER TABLE "PipelineStage" ALTER COLUMN "pipelineId" SET NOT NULL;

-- a stage's name is unique within its pipeline now ("Won" in each), not the whole workspace
DROP INDEX "PipelineStage_organizationId_name_key";
CREATE UNIQUE INDEX "PipelineStage_pipelineId_name_key" ON "PipelineStage"("pipelineId", "name");
CREATE INDEX "PipelineStage_pipelineId_order_idx" ON "PipelineStage"("pipelineId", "order");
ALTER TABLE "PipelineStage" ADD CONSTRAINT "PipelineStage_pipelineId_fkey" FOREIGN KEY ("pipelineId") REFERENCES "Pipeline"("id") ON DELETE CASCADE ON UPDATE CASCADE;
