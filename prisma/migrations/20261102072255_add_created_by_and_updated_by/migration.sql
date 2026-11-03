-- AlterTable
ALTER TABLE "Contact" ADD COLUMN     "createdById" INTEGER,
ADD COLUMN     "updatedById" INTEGER;

-- AlterTable
ALTER TABLE "Deal" ADD COLUMN     "createdById" INTEGER,
ADD COLUMN     "updatedById" INTEGER;

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "createdById" INTEGER,
ADD COLUMN     "updatedById" INTEGER;

-- CreateIndex
CREATE INDEX "Contact_organizationId_createdById_idx" ON "Contact"("organizationId", "createdById");

-- CreateIndex
CREATE INDEX "Contact_organizationId_updatedById_idx" ON "Contact"("organizationId", "updatedById");

-- CreateIndex
CREATE INDEX "Deal_organizationId_createdById_idx" ON "Deal"("organizationId", "createdById");

-- CreateIndex
CREATE INDEX "Deal_organizationId_updatedById_idx" ON "Deal"("organizationId", "updatedById");

-- CreateIndex
CREATE INDEX "Lead_organizationId_createdById_idx" ON "Lead"("organizationId", "createdById");

-- CreateIndex
CREATE INDEX "Lead_organizationId_updatedById_idx" ON "Lead"("organizationId", "updatedById");

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Records from before this was tracked: the creator is whoever is on the record's
-- "created" timeline entry, and the last person to change it is whoever is on its most
-- recent timeline entry (or the creator, if nothing has happened since)
UPDATE "Lead" AS r SET "createdById" = t."userId"
FROM "LeadTimeline" AS t WHERE t."leadId" = r."id" AND t."type" = 'CREATED';

UPDATE "Deal" AS r SET "createdById" = t."userId"
FROM "DealTimeline" AS t WHERE t."dealId" = r."id" AND t."type" = 'CREATED';

UPDATE "Contact" AS r SET "createdById" = t."userId"
FROM "ContactTimeline" AS t WHERE t."contactId" = r."id" AND t."type" = 'CREATED';

UPDATE "Lead" AS r SET "updatedById" = latest."userId"
FROM (SELECT DISTINCT ON ("leadId") "leadId", "userId" FROM "LeadTimeline" ORDER BY "leadId", "createdAt" DESC) AS latest
WHERE latest."leadId" = r."id";

UPDATE "Deal" AS r SET "updatedById" = latest."userId"
FROM (SELECT DISTINCT ON ("dealId") "dealId", "userId" FROM "DealTimeline" ORDER BY "dealId", "createdAt" DESC) AS latest
WHERE latest."dealId" = r."id";

UPDATE "Contact" AS r SET "updatedById" = latest."userId"
FROM (SELECT DISTINCT ON ("contactId") "contactId", "userId" FROM "ContactTimeline" ORDER BY "contactId", "createdAt" DESC) AS latest
WHERE latest."contactId" = r."id";

UPDATE "Lead" SET "updatedById" = "createdById" WHERE "updatedById" IS NULL;
UPDATE "Deal" SET "updatedById" = "createdById" WHERE "updatedById" IS NULL;
UPDATE "Contact" SET "updatedById" = "createdById" WHERE "updatedById" IS NULL;
