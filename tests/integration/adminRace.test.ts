import { afterEach, describe, expect, it, vi, type Mock } from "vitest";
import { NextRequest } from "next/server";

import { prisma } from "@/lib/db/prisma";
import { createOrgWithUser, cleanupOrg } from "../helpers";

vi.mock("@/lib/auth/getCurrentUser", () => ({ getCurrentUser: vi.fn() }));
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { PATCH as editMember, DELETE as removeMember } from "@/app/api/agents/[id]/route";

const send = (method: string, body?: object) =>
    new NextRequest("http://localhost", { method, headers: { "content-type": "application/json" }, ...(body && { body: JSON.stringify(body) }) });
const params = (id: number) => ({ params: Promise.resolve({ id: String(id) }) });

// Two admins demoting (or removing) each other at the same moment: only one of them gets to
describe("two admins at once", () => {
    let organizationId = 0;
    afterEach(async () => {
        if (organizationId) await cleanupOrg(organizationId);
        organizationId = 0;
    });

    async function twoAdmins() {
        const { organization, user: first } = await createOrgWithUser(["user:read", "user:update", "user:delete"]);
        organizationId = organization.id;
        const second = await prisma.user.create({
            data: { organizationId, roleId: first.roleId, name: "Second", email: `second-${organizationId}@example.com`, passwordHash: "x" },
            include: { organization: true, role: { include: { permissions: { include: { permission: true } } } } },
        });
        const agentRole = await prisma.role.create({ data: { organizationId, name: "Agent" } });
        // each request sees the person as they were when it started: both still admins
        (getCurrentUser as Mock).mockResolvedValueOnce({ ...first, actingAsId: null }).mockResolvedValueOnce({ ...second, actingAsId: null });
        return { first, second, agentRole };
    }

    it("demoting each other: one goes through, the other is refused", async () => {
        const { first, second, agentRole } = await twoAdmins();
        const results = await Promise.all([
            editMember(send("PATCH", { roleId: agentRole.id }), params(second.id)),
            editMember(send("PATCH", { roleId: agentRole.id }), params(first.id)),
        ]);
        expect(results.map((res) => res.status).sort()).toEqual([200, 403]);

        const roles = await prisma.user.findMany({ where: { id: { in: [first.id, second.id] } }, select: { roleId: true } });
        expect(roles.filter((person) => person.roleId === first.roleId)).toHaveLength(1);
    });

    it("removing each other: one goes through, the other is refused", async () => {
        const { first, second } = await twoAdmins();
        const results = await Promise.all([removeMember(send("DELETE"), params(second.id)), removeMember(send("DELETE"), params(first.id))]);
        expect(results.map((res) => res.status).sort()).toEqual([200, 403]);
        expect(await prisma.user.count({ where: { id: { in: [first.id, second.id] } } })).toBe(1);
    });
});
