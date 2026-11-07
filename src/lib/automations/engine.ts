import { z } from "zod";
import type { AutomationRule } from "@/generated/prisma/client";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import { automationsQueue, type AutomationJobData } from "@/lib/jobs/queues";
import { canSendEmail, queueEmail } from "@/lib/emails/send";
import { fillTemplate, type TemplateValues } from "@/lib/emails/templates";
import { addTaskToTimeline, startOfToday } from "@/lib/work/tasks";
import { broadcastChange, notify } from "@/lib/realtime/notify";
import { stageMessage } from "@/lib/leads/stages";
import { findOpenCopy, isOpen } from "@/lib/leads/duplicates";
import { closedAtFor } from "@/lib/deals/stages";
import { formatMoneyIn } from "@/lib/utils/format";
import {
    actionSchema,
    conditionSchema,
    kindOf,
    type AutomationAction,
    type AutomationCondition,
    type AutomationTrigger,
    type RecordKind,
} from "@/lib/validations/automations";

/*
 * The automation engine. Two halves, with the queue in between (docs/AUTOMATIONS.md):
 *
 *   startAutomations(events)  called right after a lead or deal is saved: puts the events on the queue
 *   runAutomations(event)     run by the worker: for each rule, top to bottom,
 *                               does it match? → claim the run → do its actions → log what happened
 *
 * Actions never trigger rules themselves (they don't call startAutomations), so rules can't
 * set each other off in a loop. A rule that moves a deal to Won doesn't start the "deal won" rules.
 */

// Run log rows kept per rule, newest first
const KEEP_RUNS = 50;

/**
 * Hands events to the worker, the ones this workspace has a rule for. All of one workspace.
 * Never throws: the record is already saved, and a missed automation is logged rather than
 * failing the save.
 */
export async function startAutomations(...events: AutomationJobData[]) {
    if (events.length === 0) return;
    try {
        const rules = await prisma.automationRule.findMany({
            where: { organizationId: events[0].organizationId, trigger: { in: [...new Set(events.map((event) => event.trigger))] }, enabled: true },
            select: { trigger: true },
        });
        const wanted = new Set(rules.map((rule) => rule.trigger));
        const jobs = events.filter((event) => wanted.has(event.trigger));
        if (jobs.length > 0) await automationsQueue().addBulk(jobs.map((data) => ({ name: data.trigger, data })));
    } catch (error) {
        console.error("Couldn't start automations", error);
    }
}

// Records moving into a stage: "moved to a stage", and "won" or "lost" too when that's what the stage means
export function stageEvents(kind: RecordKind, organizationId: number, ids: number[], stage: { id: number; isWon?: boolean; isLost: boolean }) {
    const triggers: AutomationTrigger[] = [kind === "lead" ? "lead.stageChanged" : "deal.stageChanged"];
    if (kind === "deal" && stage.isWon) triggers.push("deal.won");
    if (stage.isLost) triggers.push(kind === "lead" ? "lead.lost" : "deal.lost");

    return ids.flatMap((id) =>
        triggers.map((trigger): AutomationJobData => ({ trigger, organizationId, ...(kind === "lead" ? { leadId: id } : { dealId: id }), stageId: stage.id })),
    );
}

export async function runAutomations(event: AutomationJobData) {
    const record = await loadRecord(event);
    // deleted since, or (a stage move) moved on again before this ran, say a deal dragged to Won by
    // mistake and straight back: the moment has passed
    if (!record || (event.stageId !== undefined && record.stageId !== event.stageId)) return;

    const rules = await prisma.automationRule.findMany({
        where: { organizationId: event.organizationId, trigger: event.trigger, enabled: true },
        orderBy: [{ order: "asc" }, { id: "asc" }],
    });

    for (const rule of rules) await runRule(rule, event);

    // nobody's request made these changes, so tell the open pages here
    for (const topic of ["leads", "deals", "tasks", "emails", "automations"]) broadcastChange(event.organizationId, topic);
}

// A rule's conditions and actions, read back from its JSON columns
const savedRuleSchema = z.object({ conditions: z.array(conditionSchema), actions: z.array(actionSchema) });

async function runRule(rule: AutomationRule, event: AutomationJobData) {
    // read the record fresh for every rule: an earlier rule may have given it a new owner
    const record = await loadRecord(event);
    if (!record) return;

    const saved = savedRuleSchema.safeParse(rule);
    if (saved.success && !saved.data.conditions.every((condition) => matches(condition, valueOf(condition.field, record, event)))) return;

    // one run per rule per event: a retried job skips the rules it already ran. A stage move's
    // key has the stage in it, so a deal won, reopened and won again isn't thanked twice
    const eventKey = [event.trigger, record.id, event.stageId].filter((part) => part !== undefined).join(":");
    const run = await claimRun(rule.id, eventKey, record);
    if (!run) return;

    const done: string[] = [];
    let status = "DONE";
    try {
        if (!saved.success) throw new Error("its settings are incomplete. Open the rule and save it again");
        for (const action of saved.data.actions) done.push(await runAction(action, rule, event));
    } catch (error) {
        status = "FAILED";
        done.push(`Stopped: ${error instanceof Error ? error.message : "something went wrong"}`);
    }

    await prisma.automationRun.update({ where: { id: run.id }, data: { status, summary: done.join(" · ") } });
    await keepNewestRuns(rule.id);
}

// ---------------------------------------------------------------------------
// The lead or deal an event is about, in one shape, so the actions work on either
// ---------------------------------------------------------------------------

type Person = { id: number; name: string; email: string };

interface RuleRecord {
    kind: RecordKind;
    id: number;
    organizationId: number;
    // the lead's name, or the deal's title
    name: string;
    // where its emails go: the lead's address, or for a deal, its lead's
    email: string | null;
    stageId: number;
    owner: Person | null;
    link: string;
    // the person behind it, for {{lead.firstName}}: the lead, or the deal's lead
    person: { name: string; company: string | null; phone: string | null } | null;
    deal: { title: string; amount: number } | null;
    // what conditions look at (custom fields are read from customFields)
    fields: Record<string, string | number | null | undefined>;
    customFields: unknown;
}

const ownerSelect = { select: { id: true, name: true, email: true } } as const;

async function loadRecord(event: AutomationJobData): Promise<RuleRecord | null> {
    if (kindOf(event.trigger) === "lead") {
        const lead = event.leadId
            ? await prisma.lead.findUnique({
                  where: { id: event.leadId },
                  select: {
                      id: true,
                      organizationId: true,
                      name: true,
                      email: true,
                      phone: true,
                      companyName: true,
                      sourceId: true,
                      stageId: true,
                      utmCampaign: true,
                      lostReason: true,
                      customFields: true,
                      assignedTo: ownerSelect,
                  },
              })
            : null;
        return (
            lead && {
                kind: "lead",
                id: lead.id,
                organizationId: lead.organizationId,
                name: lead.name,
                email: lead.email,
                stageId: lead.stageId,
                owner: lead.assignedTo,
                link: `/leads?open=${lead.id}`,
                person: { name: lead.name, company: lead.companyName, phone: lead.phone },
                deal: null,
                fields: { source: lead.sourceId, campaign: lead.utmCampaign, owner: lead.assignedTo?.id, stage: lead.stageId, lostReason: lead.lostReason },
                customFields: lead.customFields,
            }
        );
    }

    const deal = event.dealId
        ? await prisma.deal.findUnique({
              where: { id: event.dealId },
              select: {
                  id: true,
                  organizationId: true,
                  title: true,
                  amount: true,
                  pipelineStageId: true,
                  lostReason: true,
                  customFields: true,
                  assignedTo: ownerSelect,
                  lead: { select: { name: true, email: true, phone: true, companyName: true, sourceId: true } },
              },
          })
        : null;
    return (
        deal && {
            kind: "deal",
            id: deal.id,
            organizationId: deal.organizationId,
            name: deal.title,
            email: deal.lead?.email ?? null,
            stageId: deal.pipelineStageId,
            owner: deal.assignedTo,
            link: `/deals?open=${deal.id}`,
            person: deal.lead && { name: deal.lead.name, company: deal.lead.companyName, phone: deal.lead.phone },
            deal: { title: deal.title, amount: Number(deal.amount) },
            fields: { source: deal.lead?.sourceId, owner: deal.assignedTo?.id, stage: deal.pipelineStageId, amount: Number(deal.amount), lostReason: deal.lostReason },
            customFields: deal.customFields,
        }
    );
}

async function mustLoadRecord(event: AutomationJobData) {
    const record = await loadRecord(event);
    if (!record) throw new Error(`the ${kindOf(event.trigger)} was deleted`);
    return record;
}

// { leadId } or { dealId }: what a task, email or run row is linked to
const linkTo = (record: RuleRecord) => (record.kind === "lead" ? { leadId: record.id } : { dealId: record.id });

// ---------------------------------------------------------------------------
// Conditions
// ---------------------------------------------------------------------------

// The record's value for a condition's field, as text ("" when it has none)
function valueOf(field: string, record: RuleRecord, event: AutomationJobData) {
    if (field === "via") return event.viaFormId ? String(event.viaFormId) : "manual";
    // a custom field: "cf:budget"
    const value = field.startsWith("cf:") ? ((record.customFields ?? {}) as Record<string, unknown>)[field.slice(3)] : record.fields[field];
    return value === undefined || value === null ? "" : String(value);
}

// "1,00,000", "₹ 5000" or "$5,000" as a number; null when it isn't one
function toNumber(text: string) {
    const digits = text.replace(/[^\d.-]/g, "");
    const number = Number(digits);
    return digits === "" || !Number.isFinite(number) ? null : number;
}

// Compared as text, ignoring case and spaces at the ends; "more than" / "less than" as numbers
export function matches(condition: AutomationCondition, actual: string) {
    const have = actual.trim().toLowerCase();
    const want = condition.value.trim().toLowerCase();

    switch (condition.op) {
        case "is":
            return have === want;
        case "isNot":
            return have !== want;
        case "contains":
            return want !== "" && have.includes(want);
        case "gt":
        case "lt": {
            const [a, b] = [toNumber(have), toNumber(want)];
            if (a === null || b === null) return false;
            return condition.op === "gt" ? a > b : a < b;
        }
        case "isEmpty":
            return have === "";
        case "isSet":
            return have !== "";
    }
}

// ---------------------------------------------------------------------------
// Actions: each does one thing and says what it did, for the run log
// ---------------------------------------------------------------------------

function runAction(action: AutomationAction, rule: AutomationRule, event: AutomationJobData) {
    switch (action.type) {
        case "assign":
            return assign(action.userIds, rule, event);
        case "email":
            return sendTemplate(action.templateId, rule, event);
        case "task":
            return addTask(action, rule, event);
        case "notify":
            return notifyPeople(action, rule, event);
        case "move":
            return moveTo(action.stageId, rule, event);
    }
}

// To one person, or to the next of several in turn
async function assign(userIds: number[], rule: AutomationRule, event: AutomationJobData) {
    const record = await mustLoadRecord(event);
    const people = await prisma.user.findMany({ where: { id: { in: userIds }, organizationId: rule.organizationId }, select: { id: true, name: true } });
    // in the rule's order, without anyone who has left the workspace since
    const rotation = userIds.flatMap((id) => people.filter((person) => person.id === id));
    if (rotation.length === 0) throw new Error(`nobody it assigns to is in the workspace any more`);

    let person = rotation[0];
    if (rotation.length > 1) {
        // counted in the database, so two records arriving together never get the same turn
        const { turn } = await prisma.automationRule.update({ where: { id: rule.id }, data: { turn: { increment: 1 } }, select: { turn: true } });
        person = rotation[(turn - 1) % rotation.length];
    }

    const previousOwnerId = record.owner?.id ?? null;
    if (previousOwnerId === person.id) return `Already with ${person.name}`;

    const entry = {
        userId: await actorFor(rule),
        type: previousOwnerId ? "REASSIGNED" : "ASSIGNED",
        message: `Assigned to ${person.name} by automation "${rule.name}"`,
        metadata: { ruleId: rule.id },
    };
    const data = { assignedToId: person.id, timeline: { create: entry } };

    await prisma.$transaction([
        record.kind === "lead" ? prisma.lead.update({ where: { id: record.id }, data }) : prisma.deal.update({ where: { id: record.id }, data }),
        // its open tasks go with it (like the "Reply to …" task a web form just made for the old owner)
        ...(previousOwnerId
            ? [prisma.task.updateMany({ where: { ...linkTo(record), assignedToId: previousOwnerId, status: { not: "COMPLETED" } }, data: { assignedToId: person.id } })]
            : []),
    ]);

    await notify([person.id], {
        organizationId: rule.organizationId,
        actorId: null,
        type: record.kind === "lead" ? "LEAD_ASSIGNED" : "DEAL_ASSIGNED",
        title: `You have a new ${record.kind}`,
        body: `${record.name} (automation "${rule.name}")`,
        link: record.link,
    });
    return `Assigned to ${person.name}`;
}

// A template, filled in for this record, sent from its owner (replies go to them)
async function sendTemplate(templateId: number, rule: AutomationRule, event: AutomationJobData) {
    const record = await mustLoadRecord(event);
    const template = await prisma.emailTemplate.findFirst({ where: { id: templateId, organizationId: rule.organizationId } });
    if (!template) throw new Error("its email template was deleted");
    if (!record.email) {
        return record.kind === "lead" ? `No email sent: ${record.name} has no email address` : `No email sent: the deal has no lead with an email address`;
    }

    const sender = record.owner ?? (await actingPerson(rule));
    // it goes out from the sender's own mailbox
    const workspace = await prisma.organization.findUniqueOrThrow({ where: { id: rule.organizationId }, select: { slug: true } });
    if (!(await canSendEmail({ id: sender.id, organization: workspace }))) return `No email sent: ${sender.name} hasn't connected an email account`;
    const values = await templateValues(record, sender);

    await queueEmail({
        organizationId: rule.organizationId,
        ...linkTo(record),
        sentById: sender.id,
        to: record.email,
        subject: fillTemplate(template.subject, values),
        body: fillTemplate(template.body, values),
    });
    return `Emailed ${record.email} ("${template.name}")`;
}

// A task for the record's owner (or, with nobody on it, whoever made the rule)
async function addTask(action: Extract<AutomationAction, { type: "task" }>, rule: AutomationRule, event: AutomationJobData) {
    const record = await mustLoadRecord(event);
    const actorId = await actorFor(rule);
    const owner = record.owner ?? (await actingPerson(rule));
    const title = fillTemplate(action.title, await templateValues(record, owner)).slice(0, 200);

    const dueDate = startOfToday();
    dueDate.setUTCDate(dueDate.getUTCDate() + action.dueInDays);

    await prisma.$transaction(async (tx) => {
        const task = await tx.task.create({
            data: { organizationId: rule.organizationId, title, priority: action.priority, dueDate, assignedToId: owner.id, createdById: actorId, ...linkTo(record) },
        });
        await addTaskToTimeline(tx, task, actorId, "created");
    });

    await notify([owner.id], {
        organizationId: rule.organizationId,
        actorId: null,
        type: "TASK_ASSIGNED",
        title: `New task: ${title}`,
        body: `${record.name} (automation "${rule.name}")`,
        link: record.link,
    });
    const due = action.dueInDays === 0 ? "today" : action.dueInDays === 1 ? "tomorrow" : `in ${action.dueInDays} days`;
    return `Task "${title}" for ${owner.name}, due ${due}`;
}

// A bell notification (and a pop-up for whoever is online) for the people picked and/or the owner
async function notifyPeople(action: Extract<AutomationAction, { type: "notify" }>, rule: AutomationRule, event: AutomationJobData) {
    const record = await mustLoadRecord(event);
    const ids = [...action.userIds, ...(action.toOwner && record.owner ? [record.owner.id] : [])];
    const people = await prisma.user.findMany({ where: { id: { in: ids }, organizationId: rule.organizationId }, select: { id: true, name: true } });
    if (people.length === 0) return action.toOwner && !record.owner ? `Nobody notified: it has no owner` : "Nobody notified: they have all left the workspace";

    // {{me.name}} in the message is the owner, as in emails and tasks
    const title = fillTemplate(action.message, await templateValues(record, record.owner ?? (await actingPerson(rule)))).slice(0, 200);
    await notify(
        people.map((person) => person.id),
        { organizationId: rule.organizationId, actorId: null, type: "AUTOMATION", title, body: `${record.name} (automation "${rule.name}")`, link: record.link },
    );
    return `Notified ${people.map((person) => person.name).join(", ")}`;
}

// Into another stage. Doesn't start the "moves to a stage" rules (no rule sets off another)
async function moveTo(stageId: number, rule: AutomationRule, event: AutomationJobData) {
    const record = await mustLoadRecord(event);
    const userId = await actorFor(rule);
    const where = { organizationId: rule.organizationId };

    if (record.kind === "lead") {
        const [from, to] = await Promise.all([
            prisma.leadStage.findUnique({ where: { id: record.stageId } }),
            prisma.leadStage.findFirst({ where: { ...where, id: stageId } }),
        ]);
        if (!to) throw new Error("the stage it moves to was deleted");
        if (to.id === record.stageId) return `Already in ${to.name}`;
        // reopening a closed lead: same rule as everywhere, one open lead per person
        if (from && !isOpen(from) && isOpen(to) && (await findOpenCopy(rule.organizationId, { email: record.email, phone: record.person?.phone, exceptId: record.id }))) {
            return `Not moved to ${to.name}: this person already has an open lead`;
        }

        await prisma.lead.update({
            where: { id: record.id },
            data: {
                stageId: to.id,
                ...(!to.isLost && { lostReason: null }),
                timeline: { create: { userId, type: "STATUS_CHANGED", message: `${stageMessage(from?.name, to)} by automation "${rule.name}"`, metadata: { ruleId: rule.id } } },
            },
        });
        return `Moved to ${to.name}`;
    }

    const to = await prisma.pipelineStage.findFirst({ where: { ...where, id: stageId } });
    if (!to) throw new Error("the stage it moves to was deleted");
    if (to.id === record.stageId) return `Already in ${to.name}`;

    await prisma.deal.update({
        where: { id: record.id },
        data: {
            pipelineStageId: to.id,
            closedAt: closedAtFor(to),
            ...(!to.isLost && { lostReason: null }),
            timeline: { create: { userId, type: "STAGE_CHANGED", message: `Deal moved to ${to.name} by automation "${rule.name}"`, metadata: { ruleId: rule.id } } },
        },
    });
    return `Moved to ${to.name}`;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Whose name the rule's timeline entries and tasks go under: whoever made it, or, if they've
// left, the workspace's first member (an entry always belongs to someone)
async function actorFor(rule: AutomationRule) {
    const maker = rule.createdById
        ? await prisma.user.findFirst({ where: { id: rule.createdById, organizationId: rule.organizationId }, select: { id: true } })
        : null;
    if (maker) return maker.id;

    const first = await prisma.user.findFirst({ where: { organizationId: rule.organizationId }, orderBy: { id: "asc" }, select: { id: true } });
    if (!first) throw new Error("the workspace has no members");
    return first.id;
}

// That person, for a record with no owner
async function actingPerson(rule: AutomationRule) {
    return prisma.user.findUniqueOrThrow({ where: { id: await actorFor(rule) }, select: { id: true, name: true, email: true } });
}

// The {{placeholders}} for a template, task title or notification, for this record and whoever acts on it
async function templateValues(record: RuleRecord, me: { name: string; email: string }): Promise<TemplateValues> {
    const workspace = await prisma.organization.findUniqueOrThrow({ where: { id: record.organizationId }, select: { name: true, currency: true } });
    return {
        "lead.firstName": record.person?.name.split(" ")[0],
        "lead.name": record.person?.name,
        "lead.company": record.person?.company,
        "deal.title": record.deal?.title,
        "deal.amount": record.deal && formatMoneyIn(record.deal.amount, workspace.currency),
        "me.name": me.name,
        "me.email": me.email,
        "workspace.name": workspace.name,
    };
}

// The run's row, or null if this rule already ran for this event (the unique key says so)
async function claimRun(ruleId: number, eventKey: string, record: RuleRecord) {
    try {
        return await prisma.automationRun.create({ data: { ruleId, eventKey, ...linkTo(record), status: "RUNNING" } });
    } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return null;
        throw error;
    }
}

async function keepNewestRuns(ruleId: number) {
    const old = await prisma.automationRun.findMany({ where: { ruleId }, orderBy: { id: "desc" }, skip: KEEP_RUNS, select: { id: true } });
    if (old.length > 0) await prisma.automationRun.deleteMany({ where: { id: { in: old.map((run) => run.id) } } });
}
