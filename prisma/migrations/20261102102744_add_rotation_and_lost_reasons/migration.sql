-- AlterTable
ALTER TABLE "Deal" ADD COLUMN     "lostReason" TEXT;

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "lostReason" TEXT;

-- AlterTable
ALTER TABLE "LeadForm" ADD COLUMN     "assigneeIds" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
ADD COLUMN     "turn" INTEGER NOT NULL DEFAULT 0;
