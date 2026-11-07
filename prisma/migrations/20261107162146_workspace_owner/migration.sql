-- AlterTable
ALTER TABLE "User" ADD COLUMN     "canLogInAs" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isOwner" BOOLEAN NOT NULL DEFAULT false;

-- Every existing workspace's owner: the first person in it (whoever registered it)
UPDATE "User" SET "isOwner" = true
WHERE "id" IN (SELECT MIN("id") FROM "User" GROUP BY "organizationId");
