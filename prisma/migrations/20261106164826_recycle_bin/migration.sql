-- CreateTable
CREATE TABLE "DeletedRecord" (
    "id" SERIAL NOT NULL,
    "organizationId" INTEGER NOT NULL,
    "entity" TEXT NOT NULL,
    "recordId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "ownerId" INTEGER,
    "deletedById" INTEGER,
    "deletedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeletedRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DeletedRecord_organizationId_deletedAt_idx" ON "DeletedRecord"("organizationId", "deletedAt");

-- AddForeignKey
ALTER TABLE "DeletedRecord" ADD CONSTRAINT "DeletedRecord_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeletedRecord" ADD CONSTRAINT "DeletedRecord_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
