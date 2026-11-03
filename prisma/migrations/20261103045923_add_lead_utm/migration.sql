-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "utmCampaign" TEXT,
ADD COLUMN     "utmMedium" TEXT,
ADD COLUMN     "utmSource" TEXT;

-- CreateIndex
CREATE INDEX "Lead_organizationId_utmCampaign_idx" ON "Lead"("organizationId", "utmCampaign");
