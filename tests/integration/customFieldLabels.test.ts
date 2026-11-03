import { afterEach, describe, expect, it, vi, type Mock } from "vitest";
import { NextRequest } from "next/server";

import { createOrgWithUser, cleanupOrg } from "../helpers";

vi.mock("@/lib/auth/getCurrentUser", () => ({ getCurrentUser: vi.fn() }));
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { POST as createField } from "@/app/api/custom-fields/route";
import { PATCH as updateField } from "@/app/api/custom-fields/[id]/route";

const json = (method: string, body: object) =>
    new NextRequest("http://localhost/api/custom-fields", { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

describe("custom field names", () => {
    let organizationId = 0;

    afterEach(async () => {
        if (organizationId) await cleanupOrg(organizationId);
        organizationId = 0;
    });

    it("start with a capital letter, while the key values are stored under stays as typed", async () => {
        const { organization, user } = await createOrgWithUser(["custom-fields:manage"]);
        organizationId = organization.id;
        (getCurrentUser as Mock).mockResolvedValue(user);

        const res = await createField(json("POST", { entity: "lead", key: "collaborator", label: "collaborator", type: "AGENT" }));
        const field = (await res.json()).data;
        expect(field).toMatchObject({ key: "collaborator", label: "Collaborator" });

        const renamed = await updateField(json("PATCH", { label: "main collaborator" }), { params: Promise.resolve({ id: String(field.id) }) });
        expect((await renamed.json()).data).toMatchObject({ key: "collaborator", label: "Main collaborator" });
    });
});
