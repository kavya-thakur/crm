import { readFileSync, readdirSync } from "node:fs";
import { afterEach, describe, expect, it, vi, type Mock } from "vitest";
import { NextRequest } from "next/server";

import { prisma } from "@/lib/db/prisma";
import { viewNeededFor } from "@/lib/validations/roles";
import { createOrgWithUser, cleanupOrg } from "../helpers";

vi.mock("@/lib/auth/getCurrentUser", () => ({ getCurrentUser: vi.fn() }));

import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { POST as createRole } from "@/app/api/roles/route";
import { PATCH as updateRole } from "@/app/api/roles/[id]/route";

const send = (method: string, body: object) => new NextRequest("http://localhost", { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const params = (id: number) => ({ params: Promise.resolve({ id: String(id) }) });
const idsOf = async (names: string[]) => (await prisma.permission.findMany({ where: { name: { in: names } } })).map((permission) => permission.id);
const namesOf = async (roleId: number) =>
    (await prisma.rolePermission.findMany({ where: { roleId }, include: { permission: true } })).map((row) => row.permission.name).sort();

describe("roles: Create, Edit and Delete come with View", () => {
    let organizationId = 0;
    afterEach(async () => {
        if (organizationId) await cleanupOrg(organizationId);
        organizationId = 0;
    });

    async function admin() {
        const { organization, user } = await createOrgWithUser(["role:create", "role:read", "role:update", "lead:read", "lead:create", "lead:update", "lead:all", "deal:read", "deal:delete"]);
        organizationId = organization.id;
        (getCurrentUser as Mock).mockResolvedValue(user);
        return { organization, user };
    }

    it("knows what each permission needs", () => {
        expect(viewNeededFor("lead:create")).toBe("lead:read");
        expect(viewNeededFor("deal:all")).toBe("deal:read");
        expect(viewNeededFor("lead:read")).toBeNull();
        expect(viewNeededFor("workspace:manage")).toBeNull();
    });

    it("adds View when a role is saved with only Create, Edit or Delete", async () => {
        await admin();
        const created = await createRole(send("POST", { name: "Lead entry", permissionIds: await idsOf(["lead:create"]) }));
        expect(created.status).toBe(201);
        const role = await prisma.role.findFirstOrThrow({ where: { organizationId, name: "Lead entry" } });
        expect(await namesOf(role.id)).toEqual(["lead:create", "lead:read"]);

        expect((await updateRole(send("PATCH", { permissionIds: await idsOf(["deal:delete", "lead:all"]) }), params(role.id))).status).toBe(200);
        expect(await namesOf(role.id)).toEqual(["deal:delete", "deal:read", "lead:all", "lead:read"]);
    });

    it("repairs roles already saved without View (the migration)", async () => {
        const { organization } = await admin();
        const broken = await prisma.role.create({
            data: { organizationId: organization.id, name: "Broken", permissions: { create: (await idsOf(["lead:create", "contact:update"])).map((permissionId) => ({ permissionId })) } },
        });

        const folder = readdirSync("prisma/migrations").find((name) => name.endsWith("_roles_view_with_create"))!;
        await prisma.$executeRawUnsafe(readFileSync(`prisma/migrations/${folder}/migration.sql`, "utf8"));

        expect(await namesOf(broken.id)).toEqual(["contact:read", "contact:update", "lead:create", "lead:read"]);
    });
});
