import { afterEach, describe, expect, it, vi, type Mock } from "vitest";
import { NextRequest } from "next/server";

import { prisma } from "@/lib/db/prisma";
import { createOrgWithUser, createLeadStage, cleanupOrg } from "../helpers";

vi.mock("@/lib/auth/getCurrentUser", () => ({ getCurrentUser: vi.fn() }));
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { POST as createLead } from "@/app/api/leads/route";

function createRequest(body: object) {
    return new NextRequest("http://localhost/api/leads", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
    });
}

describe("POST /api/leads — contact linking", () => {
    let organizationId: number;

    afterEach(async () => {
        if (organizationId) await cleanupOrg(organizationId);
    });

    it("reuses an existing contact with the same phone instead of creating a duplicate", async () => {
        const { organization, user } = await createOrgWithUser(["lead:create", "lead:read"]);
        organizationId = organization.id;
        (getCurrentUser as Mock).mockResolvedValue(user);

        const stage = await createLeadStage(organization.id);
        const existingContact = await prisma.contact.create({
            data: { organizationId: organization.id, name: "Sadaf", phone: "9318467595" },
        });

        const res = await createLead(
            createRequest({ name: "New Lead Same Phone", phone: "9318467595", stageId: stage.id }),
        );
        const json = await res.json();

        expect(res.status).toBe(201);
        expect(json.data.contactId).toBe(existingContact.id);

        const contactCount = await prisma.contact.count({ where: { organizationId: organization.id, phone: "9318467595" } });
        expect(contactCount).toBe(1);
    });

    it("links to an explicitly picked contact instead of matching by phone", async () => {
        const { organization, user } = await createOrgWithUser(["lead:create", "lead:read"]);
        organizationId = organization.id;
        (getCurrentUser as Mock).mockResolvedValue(user);

        const stage = await createLeadStage(organization.id);
        const picked = await prisma.contact.create({
            data: { organizationId: organization.id, name: "Picked Contact", phone: "1111111111" },
        });

        const res = await createLead(
            createRequest({ name: "New Lead", phone: "2222222222", stageId: stage.id, contactId: picked.id }),
        );
        const json = await res.json();

        expect(res.status).toBe(201);
        expect(json.data.contactId).toBe(picked.id);

        const contactCount = await prisma.contact.count({ where: { organizationId: organization.id } });
        expect(contactCount).toBe(1);
    });

    it("rejects a contactId from another organization", async () => {
        const { organization, user } = await createOrgWithUser(["lead:create", "lead:read"]);
        organizationId = organization.id;
        (getCurrentUser as Mock).mockResolvedValue(user);

        const other = await createOrgWithUser([]);
        const otherContact = await prisma.contact.create({
            data: { organizationId: other.organization.id, name: "Other Org Contact", phone: "9999999999" },
        });

        const stage = await createLeadStage(organization.id);

        const res = await createLead(
            createRequest({ name: "New Lead", phone: "3333333333", stageId: stage.id, contactId: otherContact.id }),
        );

        expect(res.status).toBe(400);

        await cleanupOrg(other.organization.id);
    });

    it("creates a new contact when there's no match", async () => {
        const { organization, user } = await createOrgWithUser(["lead:create", "lead:read"]);
        organizationId = organization.id;
        (getCurrentUser as Mock).mockResolvedValue(user);

        const stage = await createLeadStage(organization.id);

        const res = await createLead(
            createRequest({ name: "Brand New", phone: "4444444444", stageId: stage.id }),
        );
        const json = await res.json();

        expect(res.status).toBe(201);
        const contact = await prisma.contact.findUniqueOrThrow({ where: { id: json.data.contactId } });
        expect(contact.phone).toBe("4444444444");
    });
});
