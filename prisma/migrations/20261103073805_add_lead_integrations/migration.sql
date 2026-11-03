-- AlterTable
ALTER TABLE "LeadForm" ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'FORM';

-- CreateTable
CREATE TABLE "LeadFormDelivery" (
    "id" SERIAL NOT NULL,
    "formId" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "leadId" INTEGER,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadFormDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LeadFormDelivery_formId_createdAt_idx" ON "LeadFormDelivery"("formId", "createdAt");

-- AddForeignKey
ALTER TABLE "LeadFormDelivery" ADD CONSTRAINT "LeadFormDelivery_formId_fkey" FOREIGN KEY ("formId") REFERENCES "LeadForm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
