-- A changed or reset password ends the sessions signed in before it
ALTER TABLE "User" ADD COLUMN "passwordChangedAt" TIMESTAMP(3);
