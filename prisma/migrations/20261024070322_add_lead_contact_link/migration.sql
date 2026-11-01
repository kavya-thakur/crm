-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "contactId" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "Lead_contactId_key" ON "Lead"("contactId");

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

