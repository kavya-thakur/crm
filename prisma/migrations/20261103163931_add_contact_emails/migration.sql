-- AlterTable
ALTER TABLE "Email" ADD COLUMN     "contactId" INTEGER;

-- CreateIndex
CREATE INDEX "Email_contactId_createdAt_idx" ON "Email"("contactId", "createdAt");

-- AddForeignKey
ALTER TABLE "Email" ADD CONSTRAINT "Email_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
