-- Only admins connect email, once for the whole workspace: personal mailboxes go.
-- A workspace whose owner had connected their own, and has no team mailbox yet, keeps sending: the
-- owner's becomes the team mailbox. Any other personal mailbox is removed.
UPDATE "EmailAccount" AS mailbox
SET "organizationId" = owner."organizationId", "userId" = NULL
FROM "User" AS owner
WHERE mailbox."userId" = owner."id"
  AND owner."isOwner" = true
  AND NOT EXISTS (SELECT 1 FROM "EmailAccount" AS team WHERE team."organizationId" = owner."organizationId");

DELETE FROM "EmailAccount" WHERE "organizationId" IS NULL;

ALTER TABLE "EmailAccount" DROP CONSTRAINT "EmailAccount_one_owner";

-- DropForeignKey
ALTER TABLE "EmailAccount" DROP CONSTRAINT "EmailAccount_userId_fkey";

-- DropIndex
DROP INDEX "EmailAccount_userId_key";

-- AlterTable
ALTER TABLE "EmailAccount" DROP COLUMN "userId",
ALTER COLUMN "organizationId" SET NOT NULL;
