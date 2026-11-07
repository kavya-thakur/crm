import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { NextRequest } from "next/server";

import { prisma } from "@/lib/db/prisma";
import { createOrgWithUser, createLeadStage, cleanupOrg } from "../helpers";

vi.mock("@/lib/auth/getCurrentUser", () => ({ getCurrentUser: vi.fn() }));
// the queues just record what they're given; the tests run the engine themselves
const automationJobs: unknown[] = [];
const emailJobs: unknown[] = [];
vi.mock("@/lib/jobs/queues", () => ({
    automationsQueue: () => ({
        add: async (_name: string, data: unknown) => automationJobs.push(data),
        addBulk: async (jobs: { data: unknown }[]) => automationJobs.push(...jobs.map((job) => job.data)),
    }),
    emailsQueue: () => ({ add: async (_name: string, data: unknown) => emailJobs.push(data) }),
}));

import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { POST as createRule } from "@/app/api/automations/route";
import { POST as createLead } from "@/app/api/leads/route";
import { PUT as updateDeal } from "@/app/api/deals/[id]/route";
import { PATCH as bulkLeads } from "@/app/api/leads/bulkUpdate/route";
import { matches, runAutomations, startAutomations } from "@/lib/automations/engine";
import { automationRuleSchema } from "@/lib/validations/automations";

const send = (method: string, body: object) => new NextRequest("http://localhost", { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const post = (body: object) => send("POST", body);

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
        // Priya has connected her email; Rohan hasn't
        await prisma.emailAccount.create({ data: { userId: priya.id, email: "priya@gmail.example", host: "smtp.gmail.com", port: 465, passwordEncrypted: "x" } });
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
        // numbers: commas and ₹ are fine, and something that isn't a number never matches
        expect(matches({ field: "amount", op: "gt", value: "1,00,000" }, "250000")).toBe(true);
        expect(matches({ field: "amount", op: "lt", value: "₹ 5000" }, "250000")).toBe(false);
        expect(matches({ field: "amount", op: "gt", value: "100" }, "")).toBe(false);
    });

    it("only accepts conditions that fit the trigger", () => {
        const rule = (trigger: string, field: string) =>
            automationRuleSchema.safeParse({ name: "x", trigger, conditions: [{ field, op: "isSet" }], actions: [{ type: "move", stageId: 1 }] }).success;
        expect(rule("deal.won", "amount")).toBe(true);
        expect(rule("lead.created", "amount")).toBe(false);
        expect(rule("deal.won", "campaign")).toBe(false);
        expect(rule("lead.created", "via")).toBe(true);
        expect(rule("lead.stageChanged", "via")).toBe(false);
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

        // the next lead goes to the next person, who hasn't connected an email: no email, and the log says why
        const meera = await lead("Meera Iyer");
        await runAutomations(event(meera.id));
        expect((await prisma.lead.findUniqueOrThrow({ where: { id: meera.id } })).assignedToId).toBe(rohan.id);
        expect(await prisma.email.count({ where: { leadId: meera.id } })).toBe(0);
        const meeraRun = await prisma.automationRun.findFirstOrThrow({ where: { ruleId: automation.id, leadId: meera.id } });
        expect(meeraRun.summary).toContain("No email sent: Rohan Iyer hasn't connected an email account");
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

    describe("on deals and stage moves", () => {
        async function setUpDeals() {
            const base = await setUp();
            const org = { organizationId };
            const [open, won, lost] = await Promise.all([
                prisma.pipelineStage.create({ data: { ...org, name: "Proposal", order: 0 } }),
                prisma.pipelineStage.create({ data: { ...org, name: "Won", order: 1, isWon: true } }),
                prisma.pipelineStage.create({ data: { ...org, name: "Lost", order: 2, isLost: true } }),
            ]);
            const rahul = await base.lead("Rahul Mehta");
            const deal = (amount: number, extra: object = {}) =>
                prisma.deal.create({ data: { ...org, title: "Acme licence", amount, pipelineStageId: open.id, leadId: rahul.id, assignedToId: base.priya.id, ...extra } });
            const dealRule = (trigger: string, data: object) => prisma.automationRule.create({ data: { ...org, name: "Big wins", trigger, createdById: base.user.id, ...data } });
            return { ...base, open, won, lost, rahul, deal, dealRule };
        }

        it("on a big win: notifies, emails the deal's lead, adds a task, and never twice for the same win", async () => {
            const { rohan, priya, template, won, open, deal, dealRule } = await setUpDeals();
            const rule = await dealRule("deal.won", {
                conditions: [{ field: "amount", op: "gt", value: "1,00,000" }],
                actions: [
                    { type: "notify", userIds: [rohan.id], toOwner: true, message: "Won: {{deal.title}} ({{deal.amount}})" },
                    { type: "email", templateId: template.id },
                    { type: "task", title: "Start onboarding {{lead.company}}", dueInDays: 1, priority: "HIGH" },
                ],
            });
            const big = await deal(250000, { pipelineStageId: won.id });
            const small = await deal(20000, { pipelineStageId: won.id });
            const wonEvent = (dealId: number) => ({ trigger: "deal.won" as const, organizationId, dealId, stageId: won.id });

            await runAutomations(wonEvent(big.id));
            await runAutomations(wonEvent(small.id));

            const [run] = await prisma.automationRun.findMany({ where: { ruleId: rule.id } });
            expect(run).toMatchObject({ dealId: big.id, status: "DONE", eventKey: `deal.won:${big.id}:${won.id}` });
            expect(run.summary).toContain("Notified");
            const notes = await prisma.notification.findMany({ where: { organizationId, type: "AUTOMATION" } });
            expect(notes.map((note) => note.userId).sort()).toEqual([priya.id, rohan.id].sort());
            expect(notes[0].title).toBe("Won: Acme licence (₹2,50,000)");
            expect(notes[0].link).toBe(`/deals?open=${big.id}`);
            const emails = await prisma.email.findMany({ where: { dealId: big.id } });
            expect(emails).toHaveLength(1);
            expect(emails[0]).toMatchObject({ to: "rahul@acme.example", sentById: priya.id });
            const tasks = await prisma.task.findMany({ where: { dealId: big.id } });
            expect(tasks.map((task) => [task.title, task.assignedToId])).toEqual([["Start onboarding ", priya.id]]);
            // the small deal didn't match the amount
            expect(await prisma.task.count({ where: { dealId: small.id } })).toBe(0);

            // dragged out of Won by mistake and back: the same win, so nothing happens again
            await prisma.deal.update({ where: { id: big.id }, data: { pipelineStageId: open.id } });
            await prisma.deal.update({ where: { id: big.id }, data: { pipelineStageId: won.id } });
            await runAutomations(wonEvent(big.id));
            expect(await prisma.automationRun.count({ where: { ruleId: rule.id } })).toBe(1);
        });

        it("skips a stage move that's already out of date, and moves records without setting off other rules", async () => {
            const { won, lost, open, deal, dealRule } = await setUpDeals();
            const lostRule = await dealRule("deal.lost", { actions: [{ type: "move", stageId: open.id }] });
            const lostDeal = await deal(5000, { pipelineStageId: open.id });

            // the job says "lost", but the deal is back in Proposal by the time it runs
            await runAutomations({ trigger: "deal.lost", organizationId, dealId: lostDeal.id, stageId: lost.id });
            expect(await prisma.automationRun.count({ where: { ruleId: lostRule.id } })).toBe(0);

            // a "deal created" rule that moves it to Won: moved, logged, and no "won" event queued
            const created = await dealRule("deal.created", { actions: [{ type: "move", stageId: won.id }] });
            const fresh = await deal(1000);
            await runAutomations({ trigger: "deal.created", organizationId, dealId: fresh.id });
            const moved = await prisma.deal.findUniqueOrThrow({ where: { id: fresh.id } });
            expect(moved.pipelineStageId).toBe(won.id);
            expect(moved.closedAt).not.toBeNull();
            expect((await prisma.automationRun.findFirstOrThrow({ where: { ruleId: created.id } })).summary).toBe("Moved to Won");
            expect(automationJobs).toHaveLength(0);
        });

        it("is started by every way a deal or lead changes stage", async () => {
            const { user, won, deal, dealRule, lead } = await setUpDeals();
            // the moves below need lead:update and deal:update too
            const extra = await prisma.permission.findMany({ where: { name: { in: ["lead:update", "deal:read", "deal:update", "deal:all"] } } });
            await prisma.rolePermission.createMany({ data: extra.map((permission) => ({ roleId: user.roleId, permissionId: permission.id })), skipDuplicates: true });
            (getCurrentUser as Mock).mockResolvedValue(
                await prisma.user.findUniqueOrThrow({ where: { id: user.id }, include: { organization: true, role: { include: { permissions: { include: { permission: true } } } } } }),
            );
            await dealRule("deal.won", { actions: [{ type: "notify", userIds: [], toOwner: true, message: "Won" }] });
            await dealRule("lead.lost", { actions: [{ type: "notify", userIds: [], toOwner: true, message: "Lost" }] });

            // a drag on the deals board
            const acme = await deal(1000);
            const res = await updateDeal(send("PUT", { pipelineStageId: won.id }), { params: Promise.resolve({ id: String(acme.id) }) });
            expect(res.status).toBe(200);
            // no rule for "deal moves to a stage", so only the win is queued
            expect(automationJobs).toEqual([{ trigger: "deal.won", organizationId, dealId: acme.id, stageId: won.id }]);

            // a bulk move of leads to a lost stage
            automationJobs.length = 0;
            const lostStage = await createLeadStage(organizationId, { name: "Lost", order: 9, isLost: true });
            const [a, b] = await Promise.all([lead("Asha Rao"), lead("Vikram Das")]);
            const bulk = await bulkLeads(send("PATCH", { action: "stage", leadIds: [a.id, b.id], stageId: lostStage.id, lostReason: "Price too high" }));
            expect(bulk.status).toBe(200);
            expect(automationJobs).toEqual(
                expect.arrayContaining([
                    { trigger: "lead.lost", organizationId, leadId: a.id, stageId: lostStage.id },
                    { trigger: "lead.lost", organizationId, leadId: b.id, stageId: lostStage.id },
                ]),
            );
            expect(automationJobs).toHaveLength(2);
        });

        it("checks a move's stage fits the rule", async () => {
            const { won } = await setUpDeals();
            const converted = await createLeadStage(organizationId, { name: "Converted", order: 8, isConverted: true });
            const rule = (trigger: string, stageId: number) => createRule(post({ name: "x", trigger, conditions: [], actions: [{ type: "move", stageId }] }));

            expect((await rule("deal.created", won.id)).status).toBe(201);
            // a pipeline stage on a lead rule, and a converted lead stage
            expect((await rule("lead.created", won.id)).status).toBe(400);
            expect((await rule("lead.created", converted.id)).status).toBe(400);
        });
    });
});
