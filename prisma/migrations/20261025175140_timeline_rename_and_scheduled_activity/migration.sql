-- RenameTable: LeadActivity/DealActivity/ContactActivity -> *Timeline
-- (renamed, not dropped+recreated, so existing rows survive)
ALTER TABLE "LeadActivity" RENAME TO "LeadTimeline";
ALTER TABLE "DealActivity" RENAME TO "DealTimeline";
ALTER TABLE "ContactActivity" RENAME TO "ContactTimeline";

-- RenameSequence
ALTER SEQUENCE "LeadActivity_id_seq" RENAME TO "LeadTimeline_id_seq";
ALTER SEQUENCE "DealActivity_id_seq" RENAME TO "DealTimeline_id_seq";
ALTER SEQUENCE "ContactActivity_id_seq" RENAME TO "ContactTimeline_id_seq";

-- RenameForeignKey
ALTER TABLE "LeadTimeline" RENAME CONSTRAINT "LeadActivity_leadId_fkey" TO "LeadTimeline_leadId_fkey";
ALTER TABLE "LeadTimeline" RENAME CONSTRAINT "LeadActivity_userId_fkey" TO "LeadTimeline_userId_fkey";
ALTER TABLE "DealTimeline" RENAME CONSTRAINT "DealActivity_dealId_fkey" TO "DealTimeline_dealId_fkey";
ALTER TABLE "DealTimeline" RENAME CONSTRAINT "DealActivity_userId_fkey" TO "DealTimeline_userId_fkey";
ALTER TABLE "ContactTimeline" RENAME CONSTRAINT "ContactActivity_contactId_fkey" TO "ContactTimeline_contactId_fkey";
ALTER TABLE "ContactTimeline" RENAME CONSTRAINT "ContactActivity_userId_fkey" TO "ContactTimeline_userId_fkey";

-- RenameIndex
ALTER INDEX "LeadActivity_pkey" RENAME TO "LeadTimeline_pkey";
ALTER INDEX "LeadActivity_leadId_idx" RENAME TO "LeadTimeline_leadId_idx";
ALTER INDEX "LeadActivity_userId_idx" RENAME TO "LeadTimeline_userId_idx";
ALTER INDEX "LeadActivity_createdAt_idx" RENAME TO "LeadTimeline_createdAt_idx";

ALTER INDEX "DealActivity_pkey" RENAME TO "DealTimeline_pkey";
ALTER INDEX "DealActivity_dealId_createdAt_idx" RENAME TO "DealTimeline_dealId_createdAt_idx";
ALTER INDEX "DealActivity_userId_idx" RENAME TO "DealTimeline_userId_idx";

ALTER INDEX "ContactActivity_pkey" RENAME TO "ContactTimeline_pkey";
ALTER INDEX "ContactActivity_contactId_createdAt_idx" RENAME TO "ContactTimeline_contactId_createdAt_idx";
ALTER INDEX "ContactActivity_userId_idx" RENAME TO "ContactTimeline_userId_idx";

-- CreateEnum
CREATE TYPE "ScheduledActivityType" AS ENUM ('CALL', 'MEETING', 'OTHER');

-- CreateEnum
CREATE TYPE "ScheduledActivityStatus" AS ENUM ('SCHEDULED', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "ScheduledActivity" (
    "id" SERIAL NOT NULL,
    "organizationId" INTEGER NOT NULL,
    "type" "ScheduledActivityType" NOT NULL,
    "status" "ScheduledActivityStatus" NOT NULL DEFAULT 'SCHEDULED',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "durationMinutes" INTEGER,
    "assignedToId" INTEGER NOT NULL,
    "createdById" INTEGER NOT NULL,
    "leadId" INTEGER,
    "dealId" INTEGER,
    "contactId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduledActivity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScheduledActivity_organizationId_scheduledAt_idx" ON "ScheduledActivity"("organizationId", "scheduledAt");

-- CreateIndex
CREATE INDEX "ScheduledActivity_assignedToId_scheduledAt_idx" ON "ScheduledActivity"("assignedToId", "scheduledAt");

-- CreateIndex
CREATE INDEX "ScheduledActivity_leadId_idx" ON "ScheduledActivity"("leadId");

-- CreateIndex
CREATE INDEX "ScheduledActivity_dealId_idx" ON "ScheduledActivity"("dealId");

-- CreateIndex
CREATE INDEX "ScheduledActivity_contactId_idx" ON "ScheduledActivity"("contactId");

-- AddForeignKey
ALTER TABLE "ScheduledActivity" ADD CONSTRAINT "ScheduledActivity_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledActivity" ADD CONSTRAINT "ScheduledActivity_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledActivity" ADD CONSTRAINT "ScheduledActivity_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledActivity" ADD CONSTRAINT "ScheduledActivity_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledActivity" ADD CONSTRAINT "ScheduledActivity_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledActivity" ADD CONSTRAINT "ScheduledActivity_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
