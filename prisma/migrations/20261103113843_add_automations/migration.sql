-- CreateTable
CREATE TABLE "AutomationRule" (
    "id" SERIAL NOT NULL,
    "organizationId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "conditions" JSONB NOT NULL DEFAULT '[]',
    "actions" JSONB NOT NULL DEFAULT '[]',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "turn" INTEGER NOT NULL DEFAULT 0,
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutomationRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutomationRun" (
    "id" SERIAL NOT NULL,
    "ruleId" INTEGER NOT NULL,
    "eventKey" TEXT NOT NULL,
    "leadId" INTEGER,
    "status" TEXT NOT NULL,
    "summary" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AutomationRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AutomationRule_organizationId_trigger_idx" ON "AutomationRule"("organizationId", "trigger");

-- CreateIndex
CREATE INDEX "AutomationRun_ruleId_createdAt_idx" ON "AutomationRun"("ruleId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AutomationRun_ruleId_eventKey_key" ON "AutomationRun"("ruleId", "eventKey");

-- AddForeignKey
ALTER TABLE "AutomationRule" ADD CONSTRAINT "AutomationRule_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationRun" ADD CONSTRAINT "AutomationRun_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "AutomationRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Setting up automations is a permission of its own, given to every role that can already
-- manage web forms (the admins), so existing workspaces have it without running the seed
INSERT INTO "Permission" ("name", "description")
VALUES ('automations:manage', 'Can create, edit and turn off the workspace''s automation rules')
ON CONFLICT ("name") DO NOTHING;

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT rp."roleId", (SELECT "id" FROM "Permission" WHERE "name" = 'automations:manage')
FROM "RolePermission" rp
JOIN "Permission" p ON p."id" = rp."permissionId"
WHERE p."name" = 'lead-forms:manage'
ON CONFLICT DO NOTHING;
