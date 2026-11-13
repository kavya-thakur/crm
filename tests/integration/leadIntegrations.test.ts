import { afterEach, describe, expect, it, vi, type Mock } from "vitest";
import { NextRequest } from "next/server";

import { prisma } from "@/lib/db/prisma";
import { createOrgWithUser, createLeadStage, cleanupOrg } from "../helpers";

vi.mock("@/lib/auth/getCurrentUser", () => ({ getCurrentUser: vi.fn() }));
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { GET as receiveGet, POST as receive } from "@/app/api/public/leads/[key]/route";
import { PATCH as updateForm } from "@/app/api/lead-forms/[id]/route";
import { POST as createForm } from "@/app/api/lead-forms/route";

function send(key: string, body: object) {
    return receive(
        new NextRequest(`http://localhost/api/public/leads/${key}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
        { params: Promise.resolve({ key }) },
    );
}

describe("lead integrations (webhooks)", () => {
    let organizationId = 0;

    afterEach(async () => {
        if (organizationId) await cleanupOrg(organizationId);
        organizationId = 0;
    });

    async function setUp() {
        const { organization, user } = await createOrgWithUser(["lead-forms:manage"]);
        organizationId = organization.id;
        (getCurrentUser as Mock).mockResolvedValue(user);
        const org = { organizationId };
        await createLeadStage(organizationId, { name: "New", order: 0 });
        const source = await prisma.leadSource.create({ data: { ...org, name: "Google Ads" } });
        await prisma.customFieldDefinition.create({ data: { ...org, entity: "lead", key: "budget", label: "Budget", type: "TEXT" } });
        const integration = await prisma.leadForm.create({
            data: { ...org, kind: "WEBHOOK", name: "Google Ads", key: `hook-${organizationId}-${Math.random().toString(36).slice(2)}`, sourceId: source.id, ownerId: user.id },
        });
        return { user, source, integration };
    }

    it("takes plain JSON with everyday field names, custom fields and extras", async () => {
        const { user, source, integration } = await setUp();

        const res = await send(integration.key, {
            first_name: "Rahul",
            last_name: "Mehta",
            "Mobile No.": 919876543210,
            Email: "rahul@acme.example",
            company_name: "Acme",
            Budget: "5-10L",
            city: "Pune",
        });
        expect(res.status).toBe(200);

        const lead = await prisma.lead.findFirstOrThrow({ where: { organizationId }, include: { timeline: true, tasks: true } });
        expect(lead).toMatchObject({ name: "Rahul Mehta", phone: "919876543210", email: "rahul@acme.example", companyName: "Acme", sourceId: source.id, assignedToId: user.id });
        expect(lead.customFields).toEqual({ budget: "5-10L" });
        // what Flash has no field for is kept on the timeline
        expect(lead.timeline[0].message).toContain("city: Pune");
        expect(lead.tasks).toHaveLength(1);

        const [delivery] = await prisma.leadFormDelivery.findMany({ where: { formId: integration.id } });
        expect(delivery).toMatchObject({ status: "CREATED", leadId: lead.id });
    });

    it("reads Google Ads lead forms, with the campaign", async () => {
        const { integration } = await setUp();

        const res = await send(integration.key, {
            lead_id: "abc",
            campaign_id: 123456,
            google_key: "anything",
            user_column_data: [
                { column_id: "FULL_NAME", string_value: "Meera Iyer" },
                { column_id: "PHONE_NUMBER", string_value: "+91 99887 76655" },
                { column_id: "EMAIL", string_value: "meera@example.com" },
            ],
        });
        expect(res.status).toBe(200);

        const lead = await prisma.lead.findFirstOrThrow({ where: { organizationId } });
        expect(lead).toMatchObject({ name: "Meera Iyer", phone: "+91 99887 76655", utmSource: "google", utmMedium: "cpc", utmCampaign: "123456" });
    });

    it("reads IndiaMART's own fields", async () => {
        const { integration } = await setUp();

        const res = await send(integration.key, {
            CODE: 200,
            RESPONSE: { SENDER_NAME: "Kabir Shah", SENDER_MOBILE: "+91-9812345678", SENDER_EMAIL: "kabir@shah.example", QUERY_MESSAGE: "Need 500 units" },
        });
        expect(res.status).toBe(200);

        const lead = await prisma.lead.findFirstOrThrow({ where: { organizationId }, include: { timeline: true } });
        expect(lead).toMatchObject({ name: "Kabir Shah", email: "kabir@shah.example" });
        expect(lead.timeline[0].message).toContain("Need 500 units");
    });

    it("takes an IVR call: the caller's number, no name, by POST or by GET", async () => {
        const { integration } = await setUp();
        const viaGet = (query: string) => receiveGet(new NextRequest(`http://localhost/api/public/leads/${integration.key}?${query}`), { params: Promise.resolve({ key: integration.key }) });

        // the business's own line ("CallTo") is kept as a detail, never taken as the lead's phone
        const res = await send(integration.key, { CallSid: "abc123", CallTo: "08047112233", CallFrom: "09876543210", RecordingUrl: "https://ivr.example/rec.mp3" });
        expect(res.status).toBe(200);
        const lead = await prisma.lead.findFirstOrThrow({ where: { organizationId }, include: { timeline: true } });
        expect(lead).toMatchObject({ name: "09876543210", phone: "09876543210" });
        expect(lead.timeline[0].message).toContain("CallTo: 08047112233");

        // the same caller again, as a GET with the call in the address: their lead's timeline, not a second lead
        const again = await viaGet("CallSid=def456&From=09876543210&CallTo=08047112233");
        expect(await again.json()).toMatchObject({ ok: true, created: false, leadId: lead.id });
        expect((await viaGet("caller_number=09111111111")).status).toBe(200);
        expect(await prisma.lead.count({ where: { organizationId } })).toBe(2);

        // a bare GET is still just "is this address working?"
        expect(await (await viaGet("")).json()).toMatchObject({ ok: true, message: expect.stringContaining("is ready") });
    });

    it("says plainly what's missing, and logs it", async () => {
        const { integration } = await setUp();

        const res = await send(integration.key, { name: "No Phone" });
        expect(res.status).toBe(400);
        expect((await res.json()).message).toBe("Phone is missing");

        const [delivery] = await prisma.leadFormDelivery.findMany({ where: { formId: integration.id } });
        expect(delivery).toMatchObject({ status: "REJECTED", message: "Phone is missing", payload: { name: "No Phone" } });
        expect(await prisma.lead.count({ where: { organizationId } })).toBe(0);
    });

    it("tags a new integration's leads with a source of its name, and a new web form's as Website", async () => {
        const { source } = await setUp();
        const website = await prisma.leadSource.create({ data: { organizationId, name: "Website" } });
        const create = async (body: object) =>
            (await (await createForm(new NextRequest("http://localhost", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }))).json()).data;

        // "google ads" is the existing "Google Ads"; "IndiaMART" is new
        expect((await create({ name: "google ads", kind: "WEBHOOK" })).sourceId).toBe(source.id);
        const indiamart = await create({ name: "IndiaMART", kind: "WEBHOOK" });
        expect(await prisma.leadSource.findUniqueOrThrow({ where: { id: indiamart.sourceId } })).toMatchObject({ name: "IndiaMART", organizationId });
        expect((await create({ name: "Contact us" })).sourceId).toBe(website.id);
    });

    it("only answers to an integration's current link", async () => {
        const { integration } = await setUp();
        const webForm = await prisma.leadForm.create({ data: { organizationId, name: "Site form", key: `form-${organizationId}-${Math.random().toString(36).slice(2)}` } });

        // a web form's key isn't a webhook
        expect((await send(webForm.key, { name: "A", phone: "+91 90000 00001" })).status).toBe(404);

        // a new link: the old one stops working
        const res = await updateForm(
            new NextRequest("http://localhost", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ newKey: true }) }),
            { params: Promise.resolve({ id: String(integration.id) }) },
        );
        expect(res.status).toBe(200);
        const renewed = await prisma.leadForm.findUniqueOrThrow({ where: { id: integration.id } });
        expect(renewed.key).not.toBe(integration.key);
        expect((await send(integration.key, { name: "A", phone: "+91 90000 00001" })).status).toBe(404);
        expect((await send(renewed.key, { name: "A", phone: "+91 90000 00001" })).status).toBe(200);
    });
});
