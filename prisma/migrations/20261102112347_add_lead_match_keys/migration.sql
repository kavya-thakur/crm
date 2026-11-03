-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "emailKey" TEXT,
ADD COLUMN     "phoneKey" TEXT;

-- CreateIndex
CREATE INDEX "Lead_organizationId_phoneKey_idx" ON "Lead"("organizationId", "phoneKey");

-- CreateIndex
CREATE INDEX "Lead_organizationId_emailKey_idx" ON "Lead"("organizationId", "emailKey");

-- Keep phoneKey/emailKey in step with phone/email on every insert and update, whoever
-- writes the row. Too few digits (or no "@") means too little to match on: null.
CREATE FUNCTION lead_match_keys() RETURNS trigger AS $$
DECLARE
    digits text := regexp_replace(COALESCE(NEW."phone", ''), '\D', '', 'g');
BEGIN
    NEW."phoneKey" := CASE WHEN length(digits) >= 7 THEN right(digits, 10) END;
    NEW."emailKey" := CASE WHEN NEW."email" LIKE '%@%' THEN lower(trim(NEW."email")) END;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER lead_match_keys
    BEFORE INSERT OR UPDATE OF "phone", "email" ON "Lead"
    FOR EACH ROW EXECUTE FUNCTION lead_match_keys();

-- fill them in for the leads that already exist (the trigger runs for each one)
UPDATE "Lead" SET "phone" = "phone";
