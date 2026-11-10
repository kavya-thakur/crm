-- A mailbox can belong to the workspace (the shared one everyone sends from) as well as to a person
-- AlterTable
ALTER TABLE "EmailAccount" ADD COLUMN     "organizationId" INTEGER,
ALTER COLUMN "userId" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "EmailAccount_organizationId_key" ON "EmailAccount"("organizationId");

-- AddForeignKey
ALTER TABLE "EmailAccount" ADD CONSTRAINT "EmailAccount_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Exactly one owner: a person or the workspace, never both or neither
ALTER TABLE "EmailAccount" ADD CONSTRAINT "EmailAccount_one_owner" CHECK (("userId" IS NULL) <> ("organizationId" IS NULL));
