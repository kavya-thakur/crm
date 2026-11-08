import { afterEach, describe, expect, it, vi, type Mock } from "vitest";
import { NextRequest } from "next/server";
import Papa from "papaparse";

import { prisma } from "@/lib/db/prisma";
import { runImport } from "@/lib/jobs/leadImport";
import { createOrgWithUser, createLeadStage, cleanupOrg } from "../helpers";

vi.mock("@/lib/auth/getCurrentUser", () => ({ getCurrentUser: vi.fn() }));
// no Redis needed: the route's queue is replaced by a stand-in that records what was added
const added: unknown[] = [];
vi.mock("@/lib/jobs/queues", () => ({ importsQueue: () => ({ add: async (...args: unknown[]) => added.push(args) }) }));
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { POST as startImport } from "@/app/api/imports/route";
import { GET as listLeads } from "@/app/api/leads/route";
import { GET as sampleFile } from "@/app/api/imports/sample/route";

const CSV = `Full Name,Mobile No.,Email,Status,Budget,Owner,Remarks
Rahul Mehta,+91 98765 43210,rahul@acme.example,Meeting,5–10L,priya@flash.example,Wants a 3BHK quote
Already There,9000000001,,New,,,
Meera Iyer,9000000002,meera@acme.example,,Under 5L,,
Meera again,90000 00002,,,,,
No Phone,,nophone@acme.example,,,,
Bad Budget,9000000003,,,Billions,,`;

const MAPPING = { "Full Name": "name", "Mobile No.": "phone", Email: "email", Status: "stage", Budget: "cf:budget", Owner: "owner", Remarks: "note" };

describe("CSV import", () => {
    let organizationId = 0;

    afterEach(async () => {
        if (organizationId) await cleanupOrg(organizationId);
        organizationId = 0;
        added.length = 0;
    });

    async function setUp(permissions = ["lead:create", "lead:read", "lead:all"]) {
        const { organization, user } = await createOrgWithUser(permissions);
        organizationId = organization.id;
        (getCurrentUser as Mock).mockResolvedValue(user);
        const org = { organizationId };
        const [fresh, meeting] = await Promise.all([
            createLeadStage(organizationId, { name: "New", order: 0 }),
            createLeadStage(organizationId, { name: "Meeting", order: 1 }),
        ]);
        await prisma.customFieldDefinition.create({ data: { ...org, entity: "lead", key: "budget", label: "Budget", type: "SELECT", options: ["Under 5L", "5–10L", "10L+"] } });
        const priya = await prisma.user.create({
            data: { ...org, roleId: user.roleId, name: "Priya Sharma", email: `priya@flash.example`.replace("@", `+${organizationId}@`), passwordHash: "x" },
        });
        // already an open lead, so their row is skipped
        await prisma.lead.create({ data: { ...org, name: "Already There", phone: "9000000001", stageId: fresh.id } });
        return { org, user, fresh, meeting, priya };
    }

    async function importJob(org: { organizationId: number }, userId: number, csv: string, extra: object = {}) {
        const total = Papa.parse(csv, { header: true, skipEmptyLines: "greedy" }).data.length;
        return prisma.importJob.create({ data: { ...org, userId, entity: "lead", fileName: "leads.csv", mapping: MAPPING, csv, total, ...extra } });
    }

    it("adds new people, skips ones already being worked on, and keeps the rows it couldn't add", async () => {
        const { org, user, meeting, priya } = await setUp();
        const csv = CSV.replace("priya@flash.example", priya.email);
        const job = await importJob(org, user.id, csv);

        await runImport(job.id);

        const done = await prisma.importJob.findUniqueOrThrow({ where: { id: job.id } });
        expect(done).toMatchObject({ status: "DONE", total: 6, processed: 6, created: 2, skipped: 2, failed: 2, csv: null });

        const rahul = await prisma.lead.findFirstOrThrow({ where: { ...org, name: "Rahul Mehta" }, include: { notes: true, timeline: true } });
        expect(rahul).toMatchObject({ stageId: meeting.id, assignedToId: priya.id, customFields: { budget: "5–10L" }, createdById: user.id });
        expect(rahul.notes[0].body).toBe("Wants a 3BHK quote");
        expect(rahul.timeline[0].message).toBe("Imported from leads.csv");
        // no owner column value: the importer's own
        expect((await prisma.lead.findFirstOrThrow({ where: { ...org, name: "Meera Iyer" } })).assignedToId).toBe(user.id);

        const problems = Papa.parse<Record<string, string>>(done.errorsCsv!, { header: true }).data;
        expect(problems.map((row) => `${row["Full Name"]}: ${row.Problem}`)).toEqual([
            "Already There: Already a lead: Already There",
            "Meera again: Appears earlier in this file",
            expect.stringMatching(/^No Phone: Phone/),
            "Bad Budget: Budget: \"Billions\" isn't one of its options",
        ]);

        // whoever started it is told it's done
        expect(await prisma.notification.findFirst({ where: { userId: user.id, type: "IMPORT_FINISHED" } })).toMatchObject({ title: "Import finished: 2 leads added" });
    });

    it("carries on from where it stopped, so a retried job adds nobody twice", async () => {
        const { org, user } = await setUp();
        // as if the first 3 rows were done before the server stopped
        const job = await importJob(org, user.id, CSV, { processed: 3, created: 1, skipped: 1, status: "RUNNING" });

        await runImport(job.id);

        expect(await prisma.lead.count({ where: { ...org, name: "Rahul Mehta" } })).toBe(0);
        expect(await prisma.importJob.findUniqueOrThrow({ where: { id: job.id } })).toMatchObject({ processed: 6, status: "DONE" });
    });

    it("gives everything to the importer when they can only work their own leads", async () => {
        const { org, user, priya } = await setUp(["lead:create", "lead:read"]);
        const job = await importJob(org, user.id, CSV.replace("priya@flash.example", priya.email));

        await runImport(job.id);

        expect((await prisma.lead.findFirstOrThrow({ where: { ...org, name: "Rahul Mehta" } })).assignedToId).toBe(user.id);
    });

    it("checks the file and its mapping before anything is queued", async () => {
        await setUp();
        const send = (mapping: object, csv = CSV) => {
            const form = new FormData();
            form.set("file", new File([csv], "leads.csv", { type: "text/csv" }));
            form.set("settings", JSON.stringify({ mapping, defaults: {} }));
            return startImport(new NextRequest("http://localhost/api/imports", { method: "POST", body: form }));
        };

        expect((await send({ "Full Name": "name" })).status).toBe(400);
        expect((await send({ ...MAPPING, Email: "name" })).status).toBe(400);
        expect((await send({ ...MAPPING, Budget: "cf:no_such_field" })).status).toBe(400);
        expect(added).toHaveLength(0);

        const res = await send(MAPPING);
        expect(res.status).toBe(201);
        const job = (await res.json()).data;
        expect(job).toMatchObject({ status: "QUEUED", total: 6, fileName: "leads.csv" });
        expect(added).toEqual([["leads", { importJobId: job.id }, { jobId: `import-${job.id}` }]]);
    });

    it("exports what's on screen as CSV, safe to open in Excel, in a shape it can import again", async () => {
        const { org, fresh, meeting } = await setUp();
        await prisma.lead.createMany({
            data: [
                { ...org, name: "=HYPERLINK(\"http://evil.example\")", phone: "9000000009", stageId: meeting.id, customFields: { budget: "10L+" } },
                { ...org, name: "Kept out by the filter", phone: "9000000010", stageId: fresh.id },
            ],
        });

        const res = await listLeads(new NextRequest(`http://localhost/api/leads?format=csv&stageIds=${meeting.id}`));
        expect(res.headers.get("content-type")).toContain("text/csv");
        const rows = Papa.parse<Record<string, string>>((await res.text()).replace(/^\uFEFF/, ""), { header: true, skipEmptyLines: true }).data;

        expect(rows).toHaveLength(1);
        // a leading ' stops spreadsheets running it as a formula
        expect(rows[0]).toMatchObject({ Name: "'=HYPERLINK(\"http://evil.example\")", Stage: "Meeting", Budget: "10L+" });
        // the headers are ones the importer recognises
        expect(Object.keys(rows[0]).slice(0, 4)).toEqual(["Name", "Email", "Phone", "Company"]);
    });

    it("gives a sample with this workspace's fields, and fills them all in, teammates by name included", async () => {
        const { org, user, meeting, priya } = await setUp();
        await prisma.customFieldDefinition.create({ data: { ...org, entity: "lead", key: "collaborator", label: "Collaborator", type: "AGENT" } });

        const sample = Papa.parse<Record<string, string>>((await (await sampleFile()).text()).replace(/^\uFEFF/, ""), { header: true, skipEmptyLines: true });
        expect(sample.meta.fields).toEqual(["Name", "Phone", "Email", "Company", "Stage", "Source", "Assigned to", "Note", "Budget", "Collaborator"]);
        expect(sample.data[0]).toMatchObject({ Stage: "New", "Assigned to": user.name, Budget: "Under 5L", Collaborator: user.name });

        // the sample filled in: an owner and a collaborator by name, and one name that matches nobody
        const csv = Papa.unparse([
            ["Name", "Phone", "Stage", "Assigned to", "Budget", "Collaborator"],
            ["Rahul Mehta", "9811111111", "Meeting", priya.name.toUpperCase(), "10L+", priya.name],
            ["Meera Iyer", "9822222222", "", "", "", "Nobody Here"],
            ["Kabir Rao", "9833333333", "", "Priyaa", "", ""],
        ]);
        const job = await prisma.importJob.create({
            data: {
                ...org,
                userId: user.id,
                entity: "lead",
                fileName: "sample.csv",
                csv,
                total: 3,
                mapping: { Name: "name", Phone: "phone", Stage: "stage", "Assigned to": "owner", Budget: "cf:budget", Collaborator: "cf:collaborator" },
            },
        });

        await runImport(job.id);

        const rahul = await prisma.lead.findFirstOrThrow({ where: { ...org, name: "Rahul Mehta" } });
        expect(rahul).toMatchObject({ stageId: meeting.id, assignedToId: priya.id, customFields: { budget: "10L+", collaborator: priya.id } });

        const problems = Papa.parse<Record<string, string>>((await prisma.importJob.findUniqueOrThrow({ where: { id: job.id } })).errorsCsv!, { header: true }).data;
        expect(problems.map((row) => row.Problem)).toEqual(['Collaborator: no teammate called "Nobody Here"']);
        // an owner who isn't in the team: the lead still comes in, for the default owner (here the importer)
        expect(await prisma.lead.findFirstOrThrow({ where: { ...org, name: "Kabir Rao" } })).toMatchObject({ assignedToId: user.id });
    });
});
