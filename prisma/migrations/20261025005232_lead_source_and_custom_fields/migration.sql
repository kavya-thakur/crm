-- AlterTable
ALTER TABLE "Contact" ADD COLUMN     "customFields" JSONB;

-- AlterTable
ALTER TABLE "Deal" ADD COLUMN     "customFields" JSONB;

-- AlterTable: no existing Lead had a free-text source set, so a plain drop is safe
ALTER TABLE "Lead" DROP COLUMN "source",
ADD COLUMN     "sourceId" INTEGER;

-- CreateTable
CREATE TABLE "LeadSource" (
    "id" SERIAL NOT NULL,
    "organizationId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "color" TEXT NOT NULL DEFAULT '#64748b',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeadSource_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LeadSource_organizationId_order_idx" ON "LeadSource"("organizationId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "LeadSource_organizationId_name_key" ON "LeadSource"("organizationId", "name");

-- CreateIndex
CREATE INDEX "Lead_sourceId_idx" ON "Lead"("sourceId");

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "LeadSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadSource" ADD CONSTRAINT "LeadSource_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed every existing organization with the default lead sources
INSERT INTO "LeadSource" ("organizationId", "name", "order", "color", "updatedAt")
SELECT o.id, d."name", d."order", d."color", CURRENT_TIMESTAMP
FROM "Organization" o, (VALUES
    ('Website', 0, '#0284C7'),
    ('Referral', 1, '#059669'),
    ('Social Media', 2, '#9333EA'),
    ('Email', 3, '#CA8A04'),
    ('Phone', 4, '#BE123C'),
    ('Other', 5, '#475569')
) AS d("name", "order", "color");
