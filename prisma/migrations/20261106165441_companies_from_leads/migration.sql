-- Fills in the Companies page from what's already there: every company name on a lead becomes a
-- company (one per name per workspace, ignoring case), and each contact without a company goes
-- under the one its newest lead names. New leads do the same as they arrive (src/lib/companies.ts).

INSERT INTO "Company" ("organizationId", "name", "createdAt", "updatedAt")
SELECT DISTINCT ON (l."organizationId", lower(trim(l."companyName")))
    l."organizationId", left(trim(l."companyName"), 200), now(), now()
FROM "Lead" l
WHERE l."contactId" IS NOT NULL
  AND trim(coalesce(l."companyName", '')) <> ''
  AND NOT EXISTS (
      SELECT 1 FROM "Company" c
      WHERE c."organizationId" = l."organizationId" AND lower(c."name") = lower(left(trim(l."companyName"), 200))
  )
ORDER BY l."organizationId", lower(trim(l."companyName")), l."createdAt" DESC;

UPDATE "Contact" ct
SET "companyId" = matched."companyId"
FROM (
    SELECT DISTINCT ON (latest."contactId") latest."contactId", c."id" AS "companyId"
    FROM (
        SELECT DISTINCT ON (l."contactId") l."contactId", l."organizationId", lower(left(trim(l."companyName"), 200)) AS "name"
        FROM "Lead" l
        WHERE l."contactId" IS NOT NULL AND trim(coalesce(l."companyName", '')) <> ''
        ORDER BY l."contactId", l."createdAt" DESC
    ) latest
    JOIN "Company" c ON c."organizationId" = latest."organizationId" AND lower(c."name") = latest."name"
    ORDER BY latest."contactId", c."id"
) matched
WHERE ct."id" = matched."contactId" AND ct."companyId" IS NULL;
