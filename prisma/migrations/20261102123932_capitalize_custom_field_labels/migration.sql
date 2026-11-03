-- Custom field names are shown as column headers and form labels, and are now saved with a
-- capital first letter. Fix the ones saved before that. Only the label changes: the key that
-- each record's values are stored under stays as it is.
UPDATE "CustomFieldDefinition"
SET "label" = upper(left("label", 1)) || substr("label", 2)
WHERE "label" ~ '^[a-z]';
