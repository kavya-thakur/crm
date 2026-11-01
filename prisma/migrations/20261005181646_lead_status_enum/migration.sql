-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('NEW', 'CONTACTED', 'QUALIFIED', 'LOST', 'CONVERTED');

-- AlterTable
-- Hand-written: Prisma's generated version drops and re-adds the column (losing every status).
-- Casting in place keeps existing values; it fails loudly if any row holds an invalid status.
ALTER TABLE "Lead" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Lead" ALTER COLUMN "status" TYPE "LeadStatus" USING ("status"::"LeadStatus");
ALTER TABLE "Lead" ALTER COLUMN "status" SET DEFAULT 'NEW';
