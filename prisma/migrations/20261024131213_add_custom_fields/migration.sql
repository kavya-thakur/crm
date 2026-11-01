-- CreateEnum
CREATE TYPE "CustomFieldType" AS ENUM ('TEXT', 'NUMBER', 'DATE', 'SELECT', 'BOOLEAN');

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "customFields" JSONB;

-- CreateTable
CREATE TABLE "CustomFieldDefinition" (
    "id" SERIAL NOT NULL,
    "organizationId" INTEGER NOT NULL,
    "entity" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" "CustomFieldType" NOT NULL,
    "options" JSONB,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "showInFilter" BOOLEAN NOT NULL DEFAULT false,
    "showInList" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomFieldDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CustomFieldDefinition_organizationId_entity_idx" ON "CustomFieldDefinition"("organizationId", "entity");

-- CreateIndex
CREATE UNIQUE INDEX "CustomFieldDefinition_organizationId_entity_key_key" ON "CustomFieldDefinition"("organizationId", "entity", "key");

-- AddForeignKey
ALTER TABLE "CustomFieldDefinition" ADD CONSTRAINT "CustomFieldDefinition_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

