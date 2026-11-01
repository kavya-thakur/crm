-- CreateTable
CREATE TABLE "_ActivityAttendees" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL,

    CONSTRAINT "_ActivityAttendees_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_ActivityAttendees_B_index" ON "_ActivityAttendees"("B");

-- AddForeignKey
ALTER TABLE "_ActivityAttendees" ADD CONSTRAINT "_ActivityAttendees_A_fkey" FOREIGN KEY ("A") REFERENCES "ScheduledActivity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ActivityAttendees" ADD CONSTRAINT "_ActivityAttendees_B_fkey" FOREIGN KEY ("B") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
