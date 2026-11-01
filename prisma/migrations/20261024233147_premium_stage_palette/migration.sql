-- Data-only migration: every organization's default Lead/Pipeline stages are
-- replaced with the new premium-palette names and colors. No schema change.
-- Old rows are renamed first (both sets share some names, e.g. "New",
-- "Proposal") so the (organizationId, name) unique constraint doesn't collide
-- with the new rows while both briefly exist.

-- ===================== LeadStage =====================

UPDATE "LeadStage"
SET name = name || '__old_migrate'
WHERE name IN ('New', 'Contacted', 'Qualified', 'Converted', 'Lost');

INSERT INTO "LeadStage" ("organizationId", "name", "order", "color", "isConverted", "isLost", "updatedAt")
SELECT o.id, d."name", d."order", d."color", d."isConverted", d."isLost", CURRENT_TIMESTAMP
FROM "Organization" o, (VALUES
    ('New', 0, '#E05252', false, false),
    ('Screening', 1, '#9333EA', false, false),
    ('Meeting', 2, '#0284C7', false, false),
    ('Proposal', 3, '#059669', false, false),
    ('Customer', 4, '#CA8A04', true, false),
    ('Lost', 5, '#475569', false, true)
) AS d("name", "order", "color", "isConverted", "isLost")
-- only organizations that actually had the old default stages
WHERE EXISTS (SELECT 1 FROM "LeadStage" ls WHERE ls."organizationId" = o.id AND ls.name LIKE '%__old_migrate');

UPDATE "Lead" l
SET "stageId" = ns.id
FROM "LeadStage" os
JOIN "LeadStage" ns ON ns."organizationId" = os."organizationId" AND ns.name = (
    CASE os.name
        WHEN 'New__old_migrate' THEN 'New'
        WHEN 'Contacted__old_migrate' THEN 'Screening'
        WHEN 'Qualified__old_migrate' THEN 'Meeting'
        WHEN 'Converted__old_migrate' THEN 'Customer'
        WHEN 'Lost__old_migrate' THEN 'Lost'
    END
)
WHERE l."stageId" = os.id;

DELETE FROM "LeadStage" WHERE name LIKE '%__old_migrate';

-- ===================== PipelineStage =====================

UPDATE "PipelineStage"
SET name = name || '__old_migrate'
WHERE name IN ('Qualification', 'Proposal', 'Negotiation', 'Won', 'Lost');

INSERT INTO "PipelineStage" ("organizationId", "name", "order", "color", "isWon", "isLost", "updatedAt")
SELECT o.id, d."name", d."order", d."color", d."isWon", d."isLost", CURRENT_TIMESTAMP
FROM "Organization" o, (VALUES
    ('New', 0, '#0284C7', false, false),
    ('Qualified', 1, '#9333EA', false, false),
    ('Proposal', 2, '#CA8A04', false, false),
    ('Negotiation', 3, '#EA580C', false, false),
    ('Won', 4, '#059669', true, false),
    ('Lost', 5, '#E05252', false, true)
) AS d("name", "order", "color", "isWon", "isLost")
WHERE EXISTS (SELECT 1 FROM "PipelineStage" ps WHERE ps."organizationId" = o.id AND ps.name LIKE '%__old_migrate');

UPDATE "Deal" d
SET "pipelineStageId" = ns.id
FROM "PipelineStage" os
JOIN "PipelineStage" ns ON ns."organizationId" = os."organizationId" AND ns.name = (
    CASE os.name
        WHEN 'Qualification__old_migrate' THEN 'Qualified'
        WHEN 'Proposal__old_migrate' THEN 'Proposal'
        WHEN 'Negotiation__old_migrate' THEN 'Negotiation'
        WHEN 'Won__old_migrate' THEN 'Won'
        WHEN 'Lost__old_migrate' THEN 'Lost'
    END
)
WHERE d."pipelineStageId" = os.id;

DELETE FROM "PipelineStage" WHERE name LIKE '%__old_migrate';
