-- Workspaces that already exist get a fresh 7-day trial from now (the column's default), so
-- nobody is locked out the moment this ships. A site admin switches Pro on for paying ones.
-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "billingCycle" TEXT,
ADD COLUMN     "paidUntil" TIMESTAMP(3),
ADD COLUMN     "plan" TEXT NOT NULL DEFAULT 'TRIAL',
ADD COLUMN     "planRequest" TEXT,
ADD COLUMN     "planRequestedAt" TIMESTAMP(3),
ADD COLUMN     "trialEndsAt" TIMESTAMP(3) NOT NULL DEFAULT (now() + '7 days'::interval);
