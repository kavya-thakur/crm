import { afterEach, describe, expect, it, vi, type Mock } from "vitest";
import { NextRequest } from "next/server";

import { prisma } from "@/lib/db/prisma";
import { createOrgWithUser, createLeadStage, cleanupOrg, createPipelineStage } from "../helpers";

vi.mock("@/lib/auth/getCurrentUser", () => ({ getCurrentUser: vi.fn() }));
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { GET as findDuplicates } from "@/app/api/leads/duplicates/route";
import { POST as submitForm } from "@/app/api/public/forms/[key]/route";
import { PATCH as updateForm } from "@/app/api/lead-forms/[id]/route";
import { POST as mergeLead } from "@/app/api/leads/[id]/merge/route";
import { GET as listLeads, POST as createLead } from "@/app/api/leads/route";
import { PUT as updateLead } from "@/app/api/leads/[id]/route";

const params = (key: string) => ({ params: Promise.resolve({ key }) });

function sendJson(key: string, body: object) {
    return submitForm(
        new NextRequest(`http://localhost/api/public/forms/${key}`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
        }),
        params(key),
    );
}

const visitor = { name: "Rahul Mehta", email: "rahul@acme.example", phone: "+91 98765 43210", company: "Acme", message: "We have 12 reps" };

describe("web forms and duplicate leads", () => {
    let organizationId = 0;

    afterEach(async () => {
        if (organizationId) await cleanupOrg(organizationId);
        organizationId = 0;
    });

    async function setUp() {
        const { organization, user } = await createOrgWithUser(["lead:create", "lead:read", "lead-forms:manage"]);
        organizationId = organization.id;
        (getCurrentUser as Mock).mockResolvedValue(user);
        const org = { organizationId };
        const [first] = await Promise.all([createLeadStage(organizationId, { name: "New", order: 0 }), createLeadStage(organizationId, { name: "Won", order: 1, isConverted: true })]);
        const source = await prisma.leadSource.create({ data: { ...org, name: "Website" } });
        // a fresh key per test, so the per-visitor limit never carries over
        const form = await prisma.leadForm.create({
            data: { ...org, name: "Website demo requests", key: `test-${organizationId}-${Math.random().toString(36).slice(2)}`, sourceId: source.id, ownerId: user.id },
        });
        return { org, user, first, source, form };
    }

    it("turns a submission into an assigned, tagged lead with a task to reply", async () => {
        const { user, first, source, form } = await setUp();

        const res = await sendJson(form.key, { ...visitor, details: { "Team size": "6–20" } });
        expect(res.status).toBe(200);

        const lead = await prisma.lead.findFirstOrThrow({ where: { organizationId }, include: { timeline: true, tasks: true } });
        expect(lead).toMatchObject({ name: "Rahul Mehta", stageId: first.id, sourceId: source.id, assignedToId: user.id, companyName: "Acme" });
        expect(lead.timeline.find((entry) => entry.type === "WEB_FORM")?.message).toContain("Team size: 6–20");
        expect(lead.tasks).toHaveLength(1);
        expect(lead.tasks[0]).toMatchObject({ title: "Reply to Rahul Mehta", assignedToId: user.id, priority: "HIGH" });
    });

    it("hands new leads to the people in the rotation in turn", async () => {
        const { org, user, form } = await setUp();
        const colleague = await prisma.user.create({
            data: { ...org, roleId: user.roleId, name: "Colleague", email: `rotation-${organizationId}@example.com`, passwordHash: "x" },
        });
        const patch = (body: object) =>
            updateForm(
                new NextRequest("http://localhost/api/lead-forms", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
                { params: Promise.resolve({ id: String(form.id) }) },
            );

        // someone from another workspace can't be put in the rotation
        expect((await patch({ assigneeIds: [user.id, 999999] })).status).toBe(400);
        expect((await patch({ assigneeIds: [user.id, colleague.id] })).status).toBe(200);

        for (const n of [1, 2, 3]) {
            await sendJson(form.key, { ...visitor, email: `visitor${n}@acme.example`, phone: `+91 90000 0000${n}` });
        }

        const leads = await prisma.lead.findMany({ where: { organizationId }, orderBy: { id: "asc" }, include: { tasks: true } });
        expect(leads.map((lead) => lead.assignedToId)).toEqual([user.id, colleague.id, user.id]);
        // the reply task goes to whoever got the lead
        expect(leads[1].tasks[0].assignedToId).toBe(colleague.id);
    });

    it("doesn't add someone twice: a second submission goes on their existing lead", async () => {
        const { form } = await setUp();

        await sendJson(form.key, visitor);
        // the same person, typing their number differently
        await sendJson(form.key, { ...visitor, email: "RAHUL@acme.example", phone: "9876543210", message: "Any update?" });

        const leads = await prisma.lead.findMany({ where: { organizationId }, include: { timeline: true } });
        expect(leads).toHaveLength(1);
        expect(leads[0].timeline.filter((entry) => entry.type === "WEB_FORM")).toHaveLength(2);
    });

    it("quietly ignores bots, and refuses forms that don't exist", async () => {
        const { form } = await setUp();

        expect((await sendJson(form.key, { ...visitor, website: "http://spam.example" })).status).toBe(200);
        expect(await prisma.lead.count({ where: { organizationId } })).toBe(0);

        expect((await sendJson("no-such-form", visitor)).status).toBe(404);
    });

    it("takes a plain HTML form post, keeps its extra fields and sends the visitor on", async () => {
        const { form } = await setUp();
        const body = new URLSearchParams({ ...visitor, team_size: "21–50", redirect: "https://acme.example/thanks", website: "" });

        const res = await submitForm(
            new NextRequest(`http://localhost/api/public/forms/${form.key}`, {
                method: "POST",
                headers: { "content-type": "application/x-www-form-urlencoded" },
                body,
            }),
            params(form.key),
        );

        expect(res.status).toBe(303);
        expect(res.headers.get("location")).toBe("https://acme.example/thanks");
        const entry = await prisma.leadTimeline.findFirstOrThrow({ where: { lead: { organizationId }, type: "WEB_FORM" } });
        expect(entry.message).toContain("team_size: 21–50");
    });

    it("warns about a lead with the same email or phone, however the phone is written", async () => {
        const { org, first } = await setUp();
        await prisma.lead.create({ data: { ...org, name: "Rahul Mehta", email: "rahul@acme.example", phone: "+91 98765-43210", stageId: first.id } });

        const ask = async (query: string) => (await (await findDuplicates(new NextRequest(`http://localhost/api/leads/duplicates?${query}`))).json()).data;

        expect(await ask("phone=9876543210")).toHaveLength(1);
        expect((await ask("email=Rahul@Acme.example"))[0]).toMatchObject({ name: "Rahul Mehta", matchedOn: "email", open: true });
        expect(await ask("phone=12345")).toHaveLength(0);
    });

    function merge(keepId: number, body: object) {
        return mergeLead(
            new NextRequest(`http://localhost/api/leads/${keepId}/merge`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
            { params: Promise.resolve({ id: String(keepId) }) },
        );
    }

    it("merges a duplicate into a lead: its history moves over and the picked values win", async () => {
        const { organization, user } = await createOrgWithUser(["lead:read", "lead:update", "lead:delete", "lead:all"]);
        organizationId = organization.id;
        (getCurrentUser as Mock).mockResolvedValue(user);
        const org = { organizationId };
        const [first, later] = await Promise.all([createLeadStage(organizationId, { name: "New", order: 0 }), createLeadStage(organizationId, { name: "Meeting", order: 1 })]);
        const pipelineStage = await createPipelineStage(org.organizationId, { name: "Open", order: 0 });

        const kept = await prisma.lead.create({
            data: { ...org, name: "Rahul M", phone: "9876543210", stageId: first.id, customFields: { budget: "50k", size: "" } },
        });
        const duplicate = await prisma.lead.create({
            data: {
                ...org,
                name: "Rahul Mehta",
                email: "rahul@acme.example",
                phone: "+91 98765 43210",
                companyName: "Acme",
                stageId: later.id,
                customFields: { budget: "90k", size: "11-50" },
                createdAt: new Date("2026-01-01"),
                timeline: { create: { userId: user.id, type: "CREATED", message: "Lead created" } },
                notes: { create: { authorId: user.id, body: "Asked for pricing" } },
                tasks: { create: { ...org, title: "Call back", dueDate: new Date(), assignedToId: user.id, createdById: user.id } },
                scheduledActivities: { create: { ...org, type: "CALL", title: "Intro call", scheduledAt: new Date(), assignedToId: user.id, createdById: user.id } },
                deals: { create: { ...org, title: "Acme deal", pipelineStageId: pipelineStage.id } },
            },
        });

        // keep the duplicate's full name and stage; everything else stays or fills in
        expect((await merge(kept.id, { duplicateId: duplicate.id, fromDuplicate: ["name", "stageId"] })).status).toBe(200);

        expect(await prisma.lead.findUnique({ where: { id: duplicate.id } })).toBeNull();
        const merged = await prisma.lead.findUniqueOrThrow({
            where: { id: kept.id },
            include: { timeline: true, notes: true, tasks: true, scheduledActivities: true, deals: true },
        });
        expect(merged).toMatchObject({ name: "Rahul Mehta", email: "rahul@acme.example", phone: "9876543210", companyName: "Acme", stageId: later.id });
        // both sets of custom values; where both had one, the kept lead's
        expect(merged.customFields).toEqual({ budget: "50k", size: "11-50" });
        expect(merged.createdAt.toISOString()).toBe("2026-01-01T00:00:00.000Z");
        expect([merged.notes, merged.tasks, merged.scheduledActivities, merged.deals].map((rows) => rows.length)).toEqual([1, 1, 1, 1]);
        expect(merged.timeline.map((entry) => entry.type).sort()).toEqual(["CREATED", "MERGED"]);
    });

    it("only merges two different leads the person can see, and needs the right to delete", async () => {
        const { organization, user } = await createOrgWithUser(["lead:read", "lead:update", "lead:delete"]);
        organizationId = organization.id;
        (getCurrentUser as Mock).mockResolvedValue(user);
        const org = { organizationId };
        const stage = await createLeadStage(organizationId, { name: "New", order: 0 });
        const colleague = await prisma.user.create({
            data: { ...org, roleId: user.roleId, name: "Colleague", email: `merge-${organizationId}@example.com`, passwordHash: "x" },
        });
        const mine = await prisma.lead.create({ data: { ...org, name: "Mine", stageId: stage.id, assignedToId: user.id } });
        const theirs = await prisma.lead.create({ data: { ...org, name: "Theirs", stageId: stage.id, assignedToId: colleague.id } });

        expect((await merge(mine.id, { duplicateId: mine.id })).status).toBe(400);
        // without lead:all, a colleague's lead is out of sight
        expect((await merge(mine.id, { duplicateId: theirs.id })).status).toBe(404);

        // the same person, minus lead:delete
        const permissions = user.role.permissions.filter(({ permission }) => permission.name !== "lead:delete");
        (getCurrentUser as Mock).mockResolvedValue({ ...user, role: { ...user.role, permissions } });
        expect((await merge(mine.id, { duplicateId: theirs.id })).status).toBe(403);
        expect(await prisma.lead.count({ where: org })).toBe(2);
    });

    it("leaves a lead out of its own duplicates", async () => {
        const { org, first } = await setUp();
        const lead = await prisma.lead.create({ data: { ...org, name: "Rahul", phone: "9876543210", stageId: first.id } });
        await prisma.lead.create({ data: { ...org, name: "Rahul again", phone: "+91 98765 43210", stageId: first.id } });

        const res = await findDuplicates(new NextRequest(`http://localhost/api/leads/duplicates?phone=9876543210&exceptId=${lead.id}`));
        expect((await res.json()).data.map((match: { name: string }) => match.name)).toEqual(["Rahul again"]);
    });
});

describe("one open lead per person", () => {
    let organizationId = 0;

    afterEach(async () => {
        if (organizationId) await cleanupOrg(organizationId);
        organizationId = 0;
    });

    async function setUp() {
        const { organization, user } = await createOrgWithUser(["lead:create", "lead:read", "lead:update", "lead:all"]);
        organizationId = organization.id;
        (getCurrentUser as Mock).mockResolvedValue(user);
        const org = { organizationId };
        const [open, lost] = await Promise.all([
            createLeadStage(organizationId, { name: "New", order: 0 }),
            createLeadStage(organizationId, { name: "Lost", order: 1, isLost: true }),
        ]);
        return { org, open, lost };
    }

    const json = (method: string, body: object) =>
        new NextRequest("http://localhost/api/leads", { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

    it("keeps each lead's phone and email ready to match, however they were typed", async () => {
        const { org, open } = await setUp();
        const lead = await prisma.lead.create({ data: { ...org, name: "Rahul", phone: "+91 98765-43210", email: " Rahul@Acme.example ", stageId: open.id } });

        expect(lead).toMatchObject({ phoneKey: "9876543210", emailKey: "rahul@acme.example" });
        const changed = await prisma.lead.update({ where: { id: lead.id }, data: { phone: "123" } });
        // too few digits to match anyone on
        expect(changed.phoneKey).toBeNull();
    });

    it("refuses a second open lead for someone, but not one who was lost before", async () => {
        const { org, open, lost } = await setUp();
        const existing = await prisma.lead.create({ data: { ...org, name: "Rahul Mehta", phone: "+91 98765 43210", stageId: open.id } });

        const res = await createLead(json("POST", { name: "Rahul M", phone: "9876543210", stageId: open.id }));
        expect(res.status).toBe(409);
        expect((await res.json()).duplicate).toMatchObject({ id: existing.id, name: "Rahul Mehta", canOpen: true });

        await prisma.lead.update({ where: { id: existing.id }, data: { stageId: lost.id } });
        expect((await createLead(json("POST", { name: "Rahul M", phone: "9876543210", stageId: open.id }))).status).toBe(201);
    });

    it("won't turn a lead into a copy of another open one, by its phone or by reopening it", async () => {
        const { org, open, lost } = await setUp();
        await prisma.lead.create({ data: { ...org, name: "Rahul", phone: "9876543210", stageId: open.id } });
        const other = await prisma.lead.create({ data: { ...org, name: "Meera", phone: "9000000000", stageId: open.id } });
        const old = await prisma.lead.create({ data: { ...org, name: "Rahul (2025)", phone: "9876543210", stageId: lost.id } });
        const put = (id: number, body: object) => updateLead(json("PUT", body), { params: Promise.resolve({ id: String(id) }) });

        expect((await put(other.id, { phone: "+91 98765 43210" })).status).toBe(409);
        expect((await put(old.id, { stageId: open.id })).status).toBe(409);
        // editing something else on the lost one is fine
        expect((await put(old.id, { companyName: "Acme" })).status).toBe(200);
    });

    it("marks open copies in the list, and filters down to them", async () => {
        const { org, open, lost } = await setUp();
        const [first, second] = await prisma.lead.createManyAndReturn({
            data: [
                { ...org, name: "Rahul", phone: "9876543210", stageId: open.id },
                { ...org, name: "Rahul again", email: "rahul@acme.example", phone: "+91 98765 43210", stageId: open.id },
                { ...org, name: "Rahul last year", phone: "9876543210", stageId: lost.id },
                { ...org, name: "Meera", phone: "9000000000", stageId: open.id },
            ],
        });

        const list = async (query = "") => (await (await listLeads(new NextRequest(`http://localhost/api/leads?${query}`))).json()).data;
        const marks = Object.fromEntries((await list()).map((lead: { name: string; duplicates: unknown }) => [lead.name, lead.duplicates]));
        expect(marks).toEqual({
            Rahul: { count: 1, name: "Rahul again" },
            "Rahul again": { count: 1, name: "Rahul" },
            // a lost lead for the same person is a past opportunity, not a copy
            "Rahul last year": null,
            Meera: null,
        });

        const onlyCopies = await list("duplicates=true");
        expect(onlyCopies.map((lead: { id: number }) => lead.id).sort()).toEqual([first.id, second.id].sort());
    });
});

describe("the form builder", () => {
    let organizationId = 0;

    afterEach(async () => {
        if (organizationId) await cleanupOrg(organizationId);
        organizationId = 0;
    });

    async function setUp() {
        const { organization, user } = await createOrgWithUser(["lead:create", "lead:read", "lead-forms:manage"]);
        organizationId = organization.id;
        (getCurrentUser as Mock).mockResolvedValue(user);
        const org = { organizationId };
        await createLeadStage(organizationId, { name: "New", order: 0 });
        await prisma.customFieldDefinition.createMany({
            data: [
                { ...org, entity: "lead", key: "budget", label: "Budget", type: "SELECT", options: ["Under 5L", "5–10L", "10L+"] },
                { ...org, entity: "lead", key: "site_visit", label: "Wants a site visit", type: "BOOLEAN" },
                { ...org, entity: "lead", key: "collaborator", label: "Collaborator", type: "AGENT" },
            ],
        });
        const form = await prisma.leadForm.create({
            data: { ...org, name: "Interior quotes", key: `builder-${organizationId}-${Math.random().toString(36).slice(2)}`, ownerId: user.id },
        });
        const patch = (body: object) =>
            updateForm(
                new NextRequest("http://localhost/api/lead-forms", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
                { params: Promise.resolve({ id: String(form.id) }) },
            );
        return { org, form, patch };
    }

    const settings = (overrides: object) => ({ email: "optional", company: "hidden", message: "optional", customFields: [], ...overrides });

    it("only lets a form ask for this workspace's lead fields, and never an Agent field", async () => {
        const { patch } = await setUp();

        expect((await patch({ settings: settings({ customFields: [{ key: "no_such_field", required: false }] }) })).status).toBe(400);
        expect((await patch({ settings: settings({ customFields: [{ key: "collaborator", required: false }] }) })).status).toBe(400);
        expect((await patch({ settings: settings({ customFields: [{ key: "budget", required: true }] }) })).status).toBe(200);
    });

    it("asks what the form says, and saves the answers into the lead's own fields", async () => {
        const { form, patch } = await setUp();
        await patch({ settings: settings({ thankYou: "We'll call you today!", customFields: [{ key: "budget", required: true }, { key: "site_visit", required: false }] }) });
        const visitor = { name: "Rahul Mehta", phone: "+91 98765 43210" };

        // email is optional now, but the budget is required
        const missing = await sendJson(form.key, visitor);
        expect(missing.status).toBe(400);
        expect((await missing.json()).errors).toEqual({ budget: "Budget is required" });

        const res = await sendJson(form.key, { ...visitor, customFields: { budget: "5–10L", site_visit: true } });
        expect(await res.json()).toMatchObject({ ok: true, message: "We'll call you today!" });

        const lead = await prisma.lead.findFirstOrThrow({ where: { organizationId }, include: { timeline: true } });
        expect(lead.customFields).toEqual({ budget: "5–10L", site_visit: true });
        expect(lead.timeline.find((entry) => entry.type === "WEB_FORM")?.message).toContain("Budget: 5–10L · Wants a site visit: Yes");
    });

    it("takes the same answers from a plain HTML form, and only fills a returning lead's empty fields", async () => {
        const { form, patch } = await setUp();
        await patch({ settings: settings({ customFields: [{ key: "budget", required: false }, { key: "site_visit", required: false }] }) });

        const post = (fields: Record<string, string>) =>
            submitForm(
                new NextRequest(`http://localhost/api/public/forms/${form.key}`, {
                    method: "POST",
                    headers: { "content-type": "application/x-www-form-urlencoded" },
                    body: new URLSearchParams({ name: "Rahul Mehta", phone: "9876543210", website: "", ...fields }),
                }),
                params(form.key),
            );

        await post({ cf_budget: "Under 5L" });
        // he comes back with a different budget and a site visit: the visit fills in, the budget stays
        await post({ cf_budget: "10L+", cf_site_visit: "on" });

        const leads = await prisma.lead.findMany({ where: { organizationId } });
        expect(leads).toHaveLength(1);
        expect(leads[0].customFields).toEqual({ budget: "Under 5L", site_visit: true });
    });

    it("keeps the ad campaign a lead first came in from", async () => {
        const { form } = await setUp();
        const tags = { utm_source: "google", utm_medium: "cpc", utm_campaign: "diwali-sale" };

        expect((await sendJson(form.key, { ...visitor, ...tags })).status).toBe(200);
        // the same person again, from another campaign: the first one keeps the credit
        expect((await sendJson(form.key, { ...visitor, utm_campaign: "newsletter" })).status).toBe(200);

        const lead = await prisma.lead.findFirstOrThrow({ where: { organizationId }, include: { timeline: true } });
        expect(lead).toMatchObject({ utmSource: "google", utmMedium: "cpc", utmCampaign: "diwali-sale" });
        expect(lead.timeline.find((entry) => entry.type === "WEB_FORM")?.message).toContain("Campaign: diwali-sale (google / cpc)");
        // the tags aren't extra answers
        expect(lead.timeline.some((entry) => entry.message?.includes("utm_"))).toBe(false);
    });
});
