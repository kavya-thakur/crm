-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'INR';

-- Changing workspace-wide settings (the currency) is a permission of its own, given to every
-- role that can already manage web forms (the admins), so existing workspaces have it
INSERT INTO "Permission" ("name", "description")
VALUES ('workspace:manage', 'Can change the workspace''s settings, like its currency')
ON CONFLICT ("name") DO NOTHING;

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT rp."roleId", (SELECT "id" FROM "Permission" WHERE "name" = 'workspace:manage')
FROM "RolePermission" rp
JOIN "Permission" p ON p."id" = rp."permissionId"
WHERE p."name" = 'lead-forms:manage'
ON CONFLICT DO NOTHING;
