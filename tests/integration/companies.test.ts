import { afterEach, describe, expect, it, vi, type Mock } from "vitest";
import { NextRequest } from "next/server";

import { prisma } from "@/lib/db/prisma";
import { createOrgWithUser, createLeadStage, cleanupOrg } from "../helpers";

vi.mock("@/lib/auth/getCurrentUser", () => ({ getCurrentUser: vi.fn() }));

import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { POST as createLead } from "@/app/api/leads/route";
import { PUT as updateLead } from "@/app/api/leads/[id]/route";
import { PATCH as bulkLeads } from "@/app/api/leads/bulkUpdate/route";
import { PUT as updateContact } from "@/app/api/contacts/[id]/route";
import { GET as listContacts, POST as createContact } from "@/app/api/contacts/route";
import { PATCH as bulkContacts } from "@/app/api/contacts/bulkUpdate/route";
import { GET as listCompanies, POST as createCompany } from "@/app/api/companies/route";
import { DELETE as deleteCompany, GET as getCompany } from "@/app/api/companies/[id]/route";

const send = (method: string, body?: object) =>
    new NextRequest("http://localhost/api/companies", { method, headers: { "content-type": "application/json" }, ...(body && { body: JSON.stringify(body) }) });
const params = (id: number) => ({ params: Promise.resolve({ id: String(id) }) });

describe("companies", () => {
    let organizationId = 0;

    afterEach(async () => {
        if (organizationId) await cleanupOrg(organizationId);
        organizationId = 0;
    });

    async function setUp(permissions = ["lead:create", "lead:read", "lead:all", "contact:read", "contact:create", "contact:update", "contact:delete", "contact:all", "deal:read", "deal:all"]) {
        const { organization, user } = await createOrgWithUser(permissions);
        organizationId = organization.id;
        (getCurrentUser as Mock).mockResolvedValue(user);
        const stage = await createLeadStage(organizationId, { name: "New", order: 0 });
        return { user, stage, org: { organizationId } };
    }

    it("files a new lead's contact under the company it names, one company per name", async () => {
        const { user, stage } = await setUp();
        const lead = (name: string, phone: string, companyName: string) =>
            createLead(send("POST", { name, phone, companyName, stageId: stage.id, assignedToId: user.id }));

        expect((await lead("Rahul Mehta", "+91 98000 10001", "Acme Industries")).status).toBe(201);
        expect((await lead("Priya Shah", "+91 98000 10002", "  acme industries ")).status).toBe(201);

        const companies = await prisma.company.findMany({ where: { organizationId }, include: { contacts: { orderBy: { name: "asc" } } } });
        expect(companies).toHaveLength(1);
        expect(companies[0].name).toBe("Acme Industries");
        expect(companies[0].contacts.map((contact) => contact.name)).toEqual(["Priya Shah", "Rahul Mehta"]);
    });

    it("moves a lead's contact when its company is changed or cleared, one lead or many at once", async () => {
        const { stage, org } = await setUp(["lead:read", "lead:update", "lead:all", "contact:read"]);
        const person = async (name: string, phone: string) => {
            const contact = await prisma.contact.create({ data: { ...org, name, phone } });
            return prisma.lead.create({ data: { ...org, name, phone, companyName: "Acme", stageId: stage.id, contactId: contact.id } });
        };
        const [rahul, priya] = [await person("Rahul", "+91 98000 40001"), await person("Priya", "+91 98000 40002")];
        const companyOf = async (lead: { contactId: number | null }) =>
            (await prisma.contact.findUniqueOrThrow({ where: { id: lead.contactId! }, include: { company: true } })).company?.name ?? null;

        // one lead, edited: its contact goes to Globex, even though it was filed under nothing before
        expect((await updateLead(send("PUT", { companyName: "Globex" }), params(rahul.id))).status).toBe(200);
        expect(await companyOf(rahul)).toBe("Globex");

        // bulk edit: both contacts go to Initech
        expect((await bulkLeads(send("PATCH", { action: "update", leadIds: [rahul.id, priya.id], changes: { companyName: "Initech" } }))).status).toBe(200);
        expect([await companyOf(rahul), await companyOf(priya)]).toEqual(["Initech", "Initech"]);

        // cleared: out of the company
        await updateLead(send("PUT", { companyName: null }), params(priya.id));
        expect(await companyOf(priya)).toBeNull();
    });

    it("lists companies with their contacts, open deals and revenue won", async () => {
        const { stage, org } = await setUp();
        const [acme, globex] = await Promise.all([
            prisma.company.create({ data: { ...org, name: "Acme", industry: "Manufacturing" } }),
            prisma.company.create({ data: { ...org, name: "Globex" } }),
        ]);
        const contact = await prisma.contact.create({ data: { ...org, name: "Rahul", phone: "+91 98000 20001", companyId: acme.id } });
        const lead = await prisma.lead.create({ data: { ...org, name: "Rahul", stageId: stage.id, contactId: contact.id } });
        const [open, won] = await Promise.all([
            prisma.pipelineStage.create({ data: { ...org, name: "Proposal", order: 0 } }),
            prisma.pipelineStage.create({ data: { ...org, name: "Won", order: 1, isWon: true } }),
        ]);
        await prisma.deal.createMany({
            data: [
                { ...org, title: "Licence", amount: 100000, pipelineStageId: open.id, leadId: lead.id },
                { ...org, title: "Support", amount: 40000, pipelineStageId: won.id, leadId: lead.id, closedAt: new Date() },
            ],
        });

        const { data, total } = await (await listCompanies(new NextRequest("http://localhost/api/companies"))).json();
        expect(total).toBe(2);
        expect(data).toEqual([
            { id: acme.id, name: "Acme", website: null, industry: "Manufacturing", contacts: 1, deals: { open: 1, openValue: 100000, wonValue: 40000 } },
            { id: globex.id, name: "Globex", website: null, industry: null, contacts: 0, deals: { open: 0, openValue: 0, wonValue: 0 } },
        ]);

        const company = (await (await getCompany(new NextRequest("http://localhost"), params(acme.id))).json()).data;
        expect(company.contacts).toMatchObject({ total: 1, items: [{ name: "Rahul" }] });
        expect(company.deals).toMatchObject({ total: 2, open: { count: 1, value: 100000 }, won: { count: 1, value: 40000 } });

        // searching by industry
        const found = await (await listCompanies(new NextRequest("http://localhost/api/companies?search=manufact"))).json();
        expect(found.data.map((item: { name: string }) => item.name)).toEqual(["Acme"]);
    });

    it("sets a contact's company by name, refuses a second company of the same name, and deleting one keeps its contacts", async () => {
        const { org } = await setUp();
        const contact = await prisma.contact.create({ data: { ...org, name: "Asha", phone: "+91 98000 30001" } });

        const res = await updateContact(send("PUT", { companyName: "Initech" }), params(contact.id));
        expect(res.status).toBe(200);
        expect((await res.json()).data.company.name).toBe("Initech");

        const duplicate = await createCompany(send("POST", { name: "initech" }));
        expect(duplicate.status).toBe(409);

        const company = await prisma.company.findFirstOrThrow({ where: org });
        expect((await deleteCompany(send("DELETE"), params(company.id))).status).toBe(200);
        expect((await prisma.contact.findUniqueOrThrow({ where: { id: contact.id } })).companyId).toBeNull();
    });

    it("puts a new contact under the company picked in the form, and many contacts at once with bulk edit", async () => {
        const { org } = await setUp();
        const res = await createContact(send("POST", { name: "Meera", phone: "+91 98000 50001", companyName: "acme" }));
        expect(res.status).toBe(201);
        const acme = await prisma.company.findFirstOrThrow({ where: { ...org, name: { equals: "acme", mode: "insensitive" } } });
        expect((await res.json()).data.company.id).toBe(acme.id);

        const other = await prisma.contact.create({ data: { ...org, name: "Kabir", phone: "+91 98000 50002" } });
        const meera = await prisma.contact.findFirstOrThrow({ where: { ...org, name: "Meera" } });
        expect((await bulkContacts(send("PATCH", { action: "update", contactIds: [meera.id, other.id], changes: { companyName: "Globex" } }))).status).toBe(200);
        const moved = await prisma.contact.findMany({ where: { id: { in: [meera.id, other.id] } }, include: { company: true } });
        expect(moved.map((contact) => contact.company?.name)).toEqual(["Globex", "Globex"]);
    });

    it("filters contacts by company, ignoring case, or by having none", async () => {
        const { org } = await setUp();
        const acme = await prisma.company.create({ data: { ...org, name: "Acme" } });
        await prisma.contact.createMany({
            data: [
                { ...org, name: "At Acme", phone: "+91 98000 60001", companyId: acme.id },
                { ...org, name: "Nowhere", phone: "+91 98000 60002" },
            ],
        });
        const names = async (company: string) =>
            (await (await listContacts(new NextRequest(`http://localhost/api/contacts?company=${encodeURIComponent(company)}`))).json()).data.map((contact: { name: string }) => contact.name);

        expect(await names("acme")).toEqual(["At Acme"]);
        expect(await names("none")).toEqual(["Nowhere"]);
    });

    it("needs contact access to see companies, and shows no deal money without deal access", async () => {
        await setUp(["lead:read"]);
        expect((await listCompanies(new NextRequest("http://localhost/api/companies"))).status).toBe(403);
        await cleanupOrg(organizationId);

        const { org } = await setUp(["contact:read"]);
        await prisma.company.create({ data: { ...org, name: "Acme" } });
        const { data } = await (await listCompanies(new NextRequest("http://localhost/api/companies"))).json();
        expect(data[0].deals).toBeNull();
    });
});
