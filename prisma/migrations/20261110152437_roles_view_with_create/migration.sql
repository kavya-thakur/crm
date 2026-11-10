-- A role with Create, Edit or Delete (or "Every ...") on leads, deals, contacts, members or roles,
-- but not View, couldn't open that page at all: its people could create leads they had nowhere to
-- create from. Those roles get the View they need (the roles screen and API now always add it;
-- see viewNeededFor in src/lib/validations/roles.ts). Nothing is taken away.
INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT DISTINCT rp."roleId", view."id"
FROM "RolePermission" rp
JOIN "Permission" p ON p."id" = rp."permissionId"
JOIN "Permission" view ON view."name" = split_part(p."name", ':', 1) || ':read'
WHERE split_part(p."name", ':', 1) IN ('lead', 'deal', 'contact', 'user', 'role')
  AND split_part(p."name", ':', 2) IN ('create', 'update', 'delete', 'all')
ON CONFLICT DO NOTHING;
