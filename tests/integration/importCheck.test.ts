import { afterEach, describe, expect, it, vi, type Mock } from "vitest";
import { NextRequest } from "next/server";
import Papa from "papaparse";

import { prisma } from "@/lib/db/prisma";
import { runImport } from "@/lib/jobs/leadImport";
import { createOrgWithUser, createLeadStage, cleanupOrg } from "../helpers";

vi.mock("@/lib/auth/getCurrentUser", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/jobs/queues", () => ({ importsQueue: () => ({ add: async () => undefined }) }));

import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { POST as checkImport } from "@/app/api/imports/check/route";
import { POST as startImport } from "@/app/api/imports/route";

const MAPPING = { Name: "name", Phone: "phone", Email: "email", Owner: "owner", Stage: "stage", Budget: "cf:budget" };
const FILE = Papa.unparse([
    ["Name", "Phone", "Email", "Owner", "Stage", "Budget"],
    ["Rahul Mehta", "9811111101", "rahul@acme.example", "Rahul K", "Hot", "5L"],
    ["", "9811111102", "", "", "", ""],
    ["Meera Iyer", "9811111103", "not-an-email", "", "", "Billions"],
    ["No Phone", "", "", "", "", ""],
    ["Already There", "9000000001", "", "", "", ""],
]);

const upload = (url: string, settings: object) => {
    const form = new FormData();
    form.set("file", new File([FILE], "leads.csv", { type: "text/csv" }));
    form.set("settings", JSON.stringify(settings));
    return new NextRequest(url, { method: "POST", body: form });
};

describe("checking an import before it starts", () => {
    let organizationId = 0;
    afterEach(async () => {
        if (organizationId) await cleanupOrg(organizationId);
        organizationId = 0;
    });

    async function setUp() {
        const { organization, user } = await createOrgWithUser(["lead:create", "lead:read", "lead:all"]);
        organizationId = organization.id;
        (getCurrentUser as Mock).mockResolvedValue(user);
        const org = { organizationId };
        const [fresh, hot] = await Promise.all([createLeadStage(organizationId, { name: "New", order: 0 }), createLeadStage(organizationId, { name: "Hot lead", order: 1 })]);
        await prisma.customFieldDefinition.create({ data: { ...org, entity: "lead", key: "budget", label: "Budget", type: "SELECT", options: ["5L", "10L+"] } });
        await prisma.lead.create({ data: { ...org, name: "Already There", phone: "9000000001", stageId: fresh.id } });
        const priya = await prisma.user.create({ data: { ...org, roleId: user.roleId, name: "Priya Sharma", email: `priya-${organizationId}@example.com`, passwordHash: "x" } });
        return { user, fresh, hot, priya };
    }
    const check = async (settings: object) => (await (await checkImport(upload("http://localhost/api/imports/check", settings))).json()).data;

    it("shows every problem grouped, with the rows, and the values that match nothing", async () => {
        await setUp();
        const result = await check({ mapping: MAPPING, defaults: {} });

        expect(result).toMatchObject({ total: 5, willAdd: 1, skipped: { alreadyLeads: 1 } });
        expect(result.problems.map((problem: { code: string; field: string; count: number; lines: number[] }) => [problem.code, problem.field, problem.count, problem.lines])).toEqual([
            ["missing-phone", "phone", 1, [5]],
            ["missing-name", "name", 1, [3]],
            ["bad-email", "email", 1, [4]],
        ]);
        // matchable: the owner and stage that aren't in Flash, and the dropdown value that isn't an option
        expect(result.values.map((field: { field: string; items: { value: string }[] }) => [field.field, field.items.map((item) => item.value)])).toEqual([
            ["owner", ["Rahul K"]],
            ["stage", ["Hot"]],
            ["cf:budget", ["Billions"]],
        ]);
    });

    it("keeps the rows its fixes save, and the import then adds exactly what the check said", async () => {
        const { user, hot, priya } = await setUp();
        const settings = {
            mapping: MAPPING,
            defaults: {
                values: { owner: { "rahul k": priya.id }, stage: { hot: hot.id }, "cf:budget": { billions: "10L+" } },
                fixes: { nameFromPhone: true, leaveEmpty: ["email"] },
            },
        };
        const result = await check(settings);
        // only the row without a phone can't be saved; the one that's already a lead is skipped
        expect(result).toMatchObject({ willAdd: 3, skipped: { alreadyLeads: 1 } });
        expect(result.problems.map((problem: { code: string }) => problem.code)).toEqual(["missing-phone"]);

        const started = await startImport(upload("http://localhost/api/imports", settings));
        await runImport((await started.json()).data.id);
        const leads = await prisma.lead.findMany({ where: { organizationId, name: { not: "Already There" } }, orderBy: { phone: "asc" } });
        expect(leads.map((lead) => [lead.name, lead.email, lead.assignedToId, lead.stageId, (lead.customFields as { budget?: string } | null)?.budget ?? null])).toEqual([
            ["Rahul Mehta", "rahul@acme.example", priya.id, hot.id, "5L"],
            // no name: the phone became it
            ["9811111102", null, user.id, expect.any(Number), null],
            // a bad email left out, the dropdown value matched to an option
            ["Meera Iyer", null, user.id, expect.any(Number), "10L+"],
        ]);
    });

    it("ignores a match to something not in this workspace", async () => {
        const { user } = await setUp();
        const other = await createOrgWithUser([]);
        try {
            const settings = { mapping: MAPPING, defaults: { values: { owner: { "rahul k": other.user.id } }, fixes: { nameFromPhone: true, leaveEmpty: ["email", "cf:budget"] } } };
            const started = await startImport(upload("http://localhost/api/imports", settings));
            await runImport((await started.json()).data.id);
            expect((await prisma.lead.findFirstOrThrow({ where: { organizationId, name: "Rahul Mehta" } })).assignedToId).toBe(user.id);
        } finally {
            await cleanupOrg(other.organization.id);
        }
    });
});
