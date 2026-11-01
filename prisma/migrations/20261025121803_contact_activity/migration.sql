-- CreateTable
CREATE TABLE "ContactActivity" (
    "id" SERIAL NOT NULL,
    "contactId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContactActivity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContactActivity_contactId_createdAt_idx" ON "ContactActivity"("contactId", "createdAt");

-- CreateIndex
CREATE INDEX "ContactActivity_userId_idx" ON "ContactActivity"("userId");

-- AddForeignKey
ALTER TABLE "ContactActivity" ADD CONSTRAINT "ContactActivity_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactActivity" ADD CONSTRAINT "ContactActivity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
