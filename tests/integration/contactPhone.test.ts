import { afterEach, describe, expect, it, vi, type Mock } from "vitest";
import { NextRequest } from "next/server";

import { prisma } from "@/lib/db/prisma";
import { createOrgWithUser, cleanupOrg } from "../helpers";

vi.mock("@/lib/auth/getCurrentUser", () => ({ getCurrentUser: vi.fn() }));
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { POST as createContact } from "@/app/api/contacts/route";
import { PUT as updateContact } from "@/app/api/contacts/[id]/route";

function postRequest(body: object) {
    return new NextRequest("http://localhost/api/contacts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
    });
}

function putRequest(body: object) {
    return new NextRequest("http://localhost/api/contacts/1", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
    });
}

describe("Contacts are unique by phone", () => {
    let organizationId: number;

    afterEach(async () => {
        if (organizationId) await cleanupOrg(organizationId);
    });

    it("rejects creating a second contact with the same phone", async () => {
        const { organization, user } = await createOrgWithUser(["contact:create", "contact:read"]);
        organizationId = organization.id;
        (getCurrentUser as Mock).mockResolvedValue(user);

        const first = await createContact(postRequest({ name: "Sadaf", phone: "9318467595" }));
        expect(first.status).toBe(201);

        const second = await createContact(postRequest({ name: "Kavya", phone: "9318467595" }));
        const json = await second.json();

        expect(second.status).toBe(409);
        expect(json.ok).toBe(false);

        const count = await prisma.contact.count({ where: { organizationId: organization.id, phone: "9318467595" } });
        expect(count).toBe(1);
    });

    it("requires a phone number to create a contact", async () => {
        const { organization, user } = await createOrgWithUser(["contact:create"]);
        organizationId = organization.id;
        (getCurrentUser as Mock).mockResolvedValue(user);

        const res = await createContact(postRequest({ name: "No Phone" }));

        expect(res.status).toBe(400);
    });

    it("rejects editing a contact's phone to match another contact's", async () => {
        const { organization, user } = await createOrgWithUser(["contact:create", "contact:update"]);
        organizationId = organization.id;
        (getCurrentUser as Mock).mockResolvedValue(user);

        await prisma.contact.create({ data: { organizationId: organization.id, name: "A", phone: "1111111111", assignedToId: user.id } });
        const b = await prisma.contact.create({ data: { organizationId: organization.id, name: "B", phone: "2222222222", assignedToId: user.id } });

        const res = await updateContact(putRequest({ phone: "1111111111" }), { params: Promise.resolve({ id: String(b.id) }) });
        const json = await res.json();

        expect(res.status).toBe(409);
        expect(json.ok).toBe(false);

        const unchanged = await prisma.contact.findUniqueOrThrow({ where: { id: b.id } });
        expect(unchanged.phone).toBe("2222222222");
    });
});
