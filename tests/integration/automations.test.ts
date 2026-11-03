import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { NextRequest } from "next/server";

import { prisma } from "@/lib/db/prisma";
import { createOrgWithUser, createLeadStage, cleanupOrg } from "../helpers";

vi.mock("@/lib/auth/getCurrentUser", () => ({ getCurrentUser: vi.fn() }));
// the queues just record what they're given; the tests run the engine themselves
const automationJobs: unknown[] = [];
const emailJobs: unknown[] = [];
vi.mock("@/lib/jobs/queues", () => ({
    automationsQueue: () => ({ add: async (_name: string, data: unknown) => automationJobs.push(data) }),
    emailsQueue: () => ({ add: async (_name: string, data: unknown) => emailJobs.push(data) }),
}));

import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { POST as createRule } from "@/app/api/automations/route";
import { POST as createLead } from "@/app/api/leads/route";
import { matches, runAutomations, startAutomations } from "@/lib/automations/engine";

const post = (body: object) => new NextRequest("http://localhost", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

describe("automation rules", () => {
    let organizationId = 0;

    beforeEach(() => {
        automationJobs.length = 0;
        emailJobs.length = 0;
    });

    afterEach(async () => {
        if (organizationId) await cleanupOrg(organizationId);
        organizationId = 0;
    });

    async function setUp() {
        const { organization, user } = await createOrgWithUser(["automations:manage", "lead:create", "lead:read", "lead:all"]);
        organizationId = organization.id;
        (getCurrentUser as Mock).mockResolvedValue(user);
        const org = { organizationId };
        const stage = await createLeadStage(organizationId, { name: "New", order: 0 });
        const [googleAds, referral] = await Promise.all([
            prisma.leadSource.create({ data: { ...org, name: "Google Ads" } }),
            prisma.leadSource.create({ data: { ...org, name: "Referral" } }),
        ]);
        const person = (name: string) =>
            prisma.user.create({ data: { ...org, roleId: user.roleId, name, email: `${name.toLowerCase()}-${organizationId}@example.com`, passwordHash: "x" } });
        const [priya, rohan] = await Promise.all([person("Priya Sharma"), person("Rohan Iyer")]);
        const template = await prisma.emailTemplate.create({ data: { ...org, name: "First reply", subject: "Hi {{lead.firstName}}", body: "From {{me.name}}" } });
        const lead = (name: string, extra: object = {}) =>
            prisma.lead.create({ data: { ...org, name, email: `${name.split(" ")[0].toLowerCase()}@acme.example`, phone: "+91 90000 00000", stageId: stage.id, sourceId: googleAds.id, assignedToId: user.id, ...extra } });
        const rule = (data: object) => prisma.automationRule.create({ data: { ...org, name: "Google Ads leads", trigger: "lead.created", createdById: user.id, ...data } });
        const event = (leadId: number) => ({ trigger: "lead.created" as const, organizationId, leadId, viaFormId: null });
        return { user, googleAds, referral, priya, rohan, template, lead, rule, event };
    }

    it("compares as text, ignoring case", () => {
        expect(matches({ field: "campaign", op: "contains", value: "Diwali" }, "diwali-sale")).toBe(true);
        expect(matches({ field: "campaign", op: "contains", value: "" }, "diwali-sale")).toBe(false);
        expect(matches({ field: "campaign", op: "is", value: "x" }, "X ")).toBe(true);
        expect(matches({ field: "campaign", op: "isEmpty", value: "" }, "")).toBe(true);
        expect(matches({ field: "owner", op: "isSet", value: "" }, "4")).toBe(true);
    });

    it("assigns in turns, moves the reply task, emails from the owner and adds a task, once", async () => {
        const { user, googleAds, priya, rohan, template, lead, rule, event } = await setUp();
        const automation = await rule({
            conditions: [{ field: "source", op: "is", value: String(googleAds.id) }],
            actions: [
                { type: "assign", userIds: [priya.id, rohan.id] },
                { type: "email", templateId: template.id },
                { type: "task", title: "Call {{lead.firstName}}", dueInDays: 0, priority: "HIGH" },
            ],
        });
        const rahul = await lead("Rahul Mehta");
        // the "Reply to …" task a web form would have given the first owner
        await prisma.task.create({ data: { organizationId, title: "Reply to Rahul", dueDate: new Date(), assignedToId: user.id, createdById: user.id, leadId: rahul.id } });

        await runAutomations(event(rahul.id));
        // a retried job: nothing happens twice
        await runAutomations(event(rahul.id));

        expect((await prisma.lead.findUniqueOrThrow({ where: { id: rahul.id } })).assignedToId).toBe(priya.id);
        const tasks = await prisma.task.findMany({ where: { leadId: rahul.id }, orderBy: { id: "asc" } });
        expect(tasks.map((task) => [task.title, task.assignedToId])).toEqual([
            ["Reply to Rahul", priya.id],
            ["Call Rahul", priya.id],
        ]);
        const emails = await prisma.email.findMany({ where: { leadId: rahul.id } });
        expect(emails).toHaveLength(1);
        expect(emails[0]).toMatchObject({ subject: "Hi Rahul", body: "From Priya Sharma", sentById: priya.id });
        expect(emailJobs).toHaveLength(1);

        const runs = await prisma.automationRun.findMany({ where: { ruleId: automation.id } });
        expect(runs).toHaveLength(1);
        expect(runs[0].status).toBe("DONE");
        expect(runs[0].summary).toBe('Assigned to Priya Sharma · Emailed rahul@acme.example ("First reply") · Task "Call Rahul" for Priya Sharma, due today');

        // the next lead goes to the next person
        const meera = await lead("Meera Iyer");
        await runAutomations(event(meera.id));
        expect((await prisma.lead.findUniqueOrThrow({ where: { id: meera.id } })).assignedToId).toBe(rohan.id);
    });

    it("leaves leads alone when the conditions don't match", async () => {
        const { referral, priya, lead, rule, event } = await setUp();
        const automation = await rule({ conditions: [{ field: "source", op: "is", value: String(referral.id) }], actions: [{ type: "assign", userIds: [priya.id] }] });
        const rahul = await lead("Rahul Mehta");

        await runAutomations(event(rahul.id));

        expect((await prisma.lead.findUniqueOrThrow({ where: { id: rahul.id } })).assignedToId).not.toBe(priya.id);
        expect(await prisma.automationRun.count({ where: { ruleId: automation.id } })).toBe(0);
    });

    it("says what it did before an action failed, and skips the email for a lead without one", async () => {
        const { priya, template, lead, rule, event } = await setUp();
        const failing = await rule({ actions: [{ type: "assign", userIds: [priya.id] }, { type: "email", templateId: template.id }] });
        await prisma.emailTemplate.delete({ where: { id: template.id } });
        const rahul = await lead("Rahul Mehta");

        await runAutomations(event(rahul.id));

        const [run] = await prisma.automationRun.findMany({ where: { ruleId: failing.id } });
        expect(run).toMatchObject({ status: "FAILED", summary: "Assigned to Priya Sharma · Stopped: its email template was deleted" });

        // a template that exists, but a lead with no email: skipped, not failed
        const second = await prisma.emailTemplate.create({ data: { organizationId, name: "Hi", subject: "Hi", body: "Hi" } });
        await prisma.automationRule.update({ where: { id: failing.id }, data: { actions: [{ type: "email", templateId: second.id }] } });
        const noEmail = await lead("No Email", { email: null });
        await runAutomations(event(noEmail.id));
        const latest = await prisma.automationRun.findFirstOrThrow({ where: { ruleId: failing.id, leadId: noEmail.id } });
        expect(latest).toMatchObject({ status: "DONE", summary: "No email sent: No Email has no email address" });
    });

    it("is started by a new lead only when the workspace has a rule, and checks rules before saving them", async () => {
        const { user, priya, rule } = await setUp();

        // no rules: nothing is queued
        await startAutomations({ trigger: "lead.created", organizationId, leadId: 1, viaFormId: null });
        expect(automationJobs).toHaveLength(0);

        // a rule can't point at someone from another workspace
        const outsider = await createOrgWithUser([]);
        const bad = await createRule(post({ name: "x", trigger: "lead.created", conditions: [], actions: [{ type: "assign", userIds: [outsider.user.id] }] }));
        await cleanupOrg(outsider.organization.id);
        expect(bad.status).toBe(400);

        await rule({ actions: [{ type: "assign", userIds: [priya.id] }] });
        const res = await createLead(post({ name: "Kabir Shah", phone: "+91 98111 22233", stageId: (await prisma.leadStage.findFirstOrThrow({ where: { organizationId } })).id, assignedToId: user.id }));
        expect(res.status).toBe(201);
        const created = (await res.json()).data;
        expect(automationJobs).toEqual([{ trigger: "lead.created", organizationId, leadId: created.id, viaFormId: null }]);
    });
});
