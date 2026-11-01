-- DropIndex
DROP INDEX "Lead_contactId_key";

-- CreateIndex
CREATE INDEX "Lead_contactId_idx" ON "Lead"("contactId");
