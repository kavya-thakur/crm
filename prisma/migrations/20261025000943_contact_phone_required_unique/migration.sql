-- Dedupe contacts sharing a phone within an org before the constraint below
-- makes that impossible: keep whichever one a Lead already points to (else
-- the oldest row), remap any Lead pointing at a loser, then drop the losers.
CREATE TEMP TABLE "contact_merge" AS
SELECT
    id,
    "organizationId",
    phone,
    FIRST_VALUE(id) OVER (
        PARTITION BY "organizationId", phone
        ORDER BY (EXISTS (SELECT 1 FROM "Lead" l WHERE l."contactId" = "Contact".id)) DESC, id ASC
    ) AS keep_id
FROM "Contact"
WHERE phone IS NOT NULL AND phone <> '';

UPDATE "Lead" l
SET "contactId" = cm.keep_id
FROM "contact_merge" cm
WHERE l."contactId" = cm.id AND cm.id <> cm.keep_id;

DELETE FROM "Contact" c
USING "contact_merge" cm
WHERE c.id = cm.id AND cm.id <> cm.keep_id;

DROP TABLE "contact_merge";

-- AlterTable
ALTER TABLE "Contact" ALTER COLUMN "phone" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Contact_organizationId_phone_key" ON "Contact"("organizationId", "phone");
