import type { AutomationRule } from "@/generated/prisma/client";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import { automationsQueue, type AutomationJobData } from "@/lib/jobs/queues";
import { queueEmail } from "@/lib/emails/send";
import { fillTemplate, type TemplateValues } from "@/lib/emails/templates";
import { addTaskToTimeline, startOfToday } from "@/lib/work/tasks";
import { broadcastChange, notify } from "@/lib/realtime/notify";
import { automationRuleSchema, type AutomationAction, type AutomationCondition } from "@/lib/validations/automations";

/*
 * The automation engine. Two halves, with the queue in between (docs/AUTOMATIONS.md):
 *
 *   startAutomations(event)   called right after a lead is saved: puts the event on the queue
 *   runAutomations(event)     run by the worker: for each rule, top to bottom,
 *                               does it match? → claim the run → do its actions → log what happened
 *
 * Actions never trigger rules themselves (they don't call startAutomations), so rules can't
 * set each other off in a loop.
 */

// Run log rows kept per rule, newest first
const KEEP_RUNS = 50;

/**
 * Hands an event to the worker, if this workspace has any rule for it. Never throws: the
 * lead is already saved, and a missed automation is logged rather than failing the save.
 */
export async function startAutomations(event: AutomationJobData) {
    try {
        const rules = await prisma.automationRule.count({
            where: { organizationId: event.organizationId, trigger: event.trigger, enabled: true },
        });
        if (rules > 0) await automationsQueue().add(event.trigger, event);
    } catch (error) {
        console.error("Couldn't start automations", error);
    }
}

export async function runAutomations(event: AutomationJobData) {
    const rules = await prisma.automationRule.findMany({
        where: { organizationId: event.organizationId, trigger: event.trigger, enabled: true },
        orderBy: [{ order: "asc" }, { id: "asc" }],
    });

    for (const rule of rules) await runRule(rule, event);

    // nobody's request made these changes, so tell the open pages here
    for (const topic of ["leads", "tasks", "emails", "automations"]) broadcastChange(event.organizationId, topic);
}

async function runRule(rule: AutomationRule, event: AutomationJobData) {
    // read the lead fresh for every rule: an earlier rule may have given it a new owner
    const lead = await loadLead(event.leadId);
    if (!lead) return;

    const saved = automationRuleSchema.pick({ conditions: true, actions: true }).safeParse(rule);
    if (saved.success && !saved.data.conditions.every((condition) => matches(condition, valueOf(condition.field, lead, event)))) return;

    // one run per rule per event: a retried job skips the rules it already ran
    const run = await claimRun(rule.id, `${event.trigger}:${event.leadId}`, lead.id);
    if (!run) return;

    const done: string[] = [];
    let status = "DONE";
    try {
        if (!saved.success) throw new Error("its settings are incomplete. Open the rule and save it again");
        for (const action of saved.data.actions) done.push(await runAction(action, rule, event.leadId));
    } catch (error) {
        status = "FAILED";
        done.push(`Stopped: ${error instanceof Error ? error.message : "something went wrong"}`);
    }

    await prisma.automationRun.update({ where: { id: run.id }, data: { status, summary: done.join(" · ") } });
    await keepNewestRuns(rule.id);
}

// ---------------------------------------------------------------------------
// Conditions
// ---------------------------------------------------------------------------

type Lead = NonNullable<Awaited<ReturnType<typeof loadLead>>>;

function loadLead(id: number) {
    return prisma.lead.findUnique({
        where: { id },
        select: {
            id: true,
            organizationId: true,
            name: true,
            email: true,
            companyName: true,
            sourceId: true,
            utmCampaign: true,
            customFields: true,
            assignedTo: { select: { id: true, name: true, email: true } },
        },
    });
}

// The lead's value for a condition's field, as text ("" when it has none)
function valueOf(field: string, lead: Lead, event: AutomationJobData) {
    if (field === "source") return lead.sourceId ? String(lead.sourceId) : "";
    if (field === "via") return event.viaFormId ? String(event.viaFormId) : "manual";
    if (field === "campaign") return lead.utmCampaign ?? "";
    if (field === "owner") return lead.assignedTo ? String(lead.assignedTo.id) : "";

    // a custom field: "cf:budget"
    const value = ((lead.customFields ?? {}) as Record<string, unknown>)[field.slice(3)];
    return value === undefined || value === null ? "" : String(value);
}

// Compared as text, ignoring case and spaces at the ends
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
        case "isEmpty":
            return have === "";
        case "isSet":
            return have !== "";
    }
}

// ---------------------------------------------------------------------------
// Actions: each does one thing and says what it did, for the run log
// ---------------------------------------------------------------------------

function runAction(action: AutomationAction, rule: AutomationRule, leadId: number) {
    switch (action.type) {
        case "assign":
            return assign(action.userIds, rule, leadId);
        case "email":
            return sendTemplate(action.templateId, rule, leadId);
        case "task":
            return addTask(action, rule, leadId);
    }
}

// To one person, or to the next of several in turn
async function assign(userIds: number[], rule: AutomationRule, leadId: number) {
    const lead = await mustLoadLead(leadId);
    const people = await prisma.user.findMany({ where: { id: { in: userIds }, organizationId: rule.organizationId }, select: { id: true, name: true } });
    // in the rule's order, without anyone who has left the workspace since
    const rotation = userIds.flatMap((id) => people.filter((person) => person.id === id));
    if (rotation.length === 0) throw new Error("nobody it assigns to is in the workspace any more");

    let person = rotation[0];
    if (rotation.length > 1) {
        // counted in the database, so two leads arriving together never get the same turn
        const { turn } = await prisma.automationRule.update({ where: { id: rule.id }, data: { turn: { increment: 1 } }, select: { turn: true } });
        person = rotation[(turn - 1) % rotation.length];
    }

    const previousOwnerId = lead.assignedTo?.id ?? null;
    if (previousOwnerId === person.id) return `Already with ${person.name}`;

    const actorId = await actorFor(rule);
    await prisma.$transaction([
        prisma.lead.update({
            where: { id: lead.id },
            data: {
                assignedToId: person.id,
                timeline: {
                    create: {
                        userId: actorId,
                        type: previousOwnerId ? "REASSIGNED" : "ASSIGNED",
                        message: `Assigned to ${person.name} by automation "${rule.name}"`,
                        metadata: { ruleId: rule.id },
                    },
                },
            },
        }),
        // the "Reply to …" task a web form just made for the old owner goes with the lead
        ...(previousOwnerId
            ? [prisma.task.updateMany({ where: { leadId: lead.id, assignedToId: previousOwnerId, status: { not: "COMPLETED" } }, data: { assignedToId: person.id } })]
            : []),
    ]);

    await notify([person.id], {
        organizationId: rule.organizationId,
        actorId: null,
        type: "LEAD_ASSIGNED",
        title: "You have a new lead",
        body: `${lead.name} (automation "${rule.name}")`,
        link: `/leads?open=${lead.id}`,
    });
    return `Assigned to ${person.name}`;
}

// A template, filled in for this lead, sent from its owner (replies go to them)
async function sendTemplate(templateId: number, rule: AutomationRule, leadId: number) {
    const lead = await mustLoadLead(leadId);
    const template = await prisma.emailTemplate.findFirst({ where: { id: templateId, organizationId: rule.organizationId } });
    if (!template) throw new Error("its email template was deleted");
    if (!lead.email) return `No email sent: ${lead.name} has no email address`;

    const sender = lead.assignedTo ?? (await prisma.user.findUniqueOrThrow({ where: { id: await actorFor(rule) }, select: { id: true, name: true, email: true } }));
    const values = await templateValues(lead, sender);

    await queueEmail({
        organizationId: rule.organizationId,
        leadId: lead.id,
        sentById: sender.id,
        to: lead.email,
        subject: fillTemplate(template.subject, values),
        body: fillTemplate(template.body, values),
    });
    return `Emailed ${lead.email} ("${template.name}")`;
}

// A task for the lead's owner (or, with nobody on it, whoever made the rule)
async function addTask(action: Extract<AutomationAction, { type: "task" }>, rule: AutomationRule, leadId: number) {
    const lead = await mustLoadLead(leadId);
    const actorId = await actorFor(rule);
    const ownerId = lead.assignedTo?.id ?? actorId;
    const owner = await prisma.user.findUniqueOrThrow({ where: { id: ownerId }, select: { id: true, name: true, email: true } });
    const title = fillTemplate(action.title, await templateValues(lead, owner)).slice(0, 200);

    const dueDate = startOfToday();
    dueDate.setUTCDate(dueDate.getUTCDate() + action.dueInDays);

    await prisma.$transaction(async (tx) => {
        const task = await tx.task.create({
            data: { organizationId: rule.organizationId, title, priority: action.priority, dueDate, assignedToId: ownerId, createdById: actorId, leadId: lead.id },
        });
        await addTaskToTimeline(tx, task, actorId, "created");
    });

    await notify([ownerId], {
        organizationId: rule.organizationId,
        actorId: null,
        type: "TASK_ASSIGNED",
        title: `New task: ${title}`,
        body: `${lead.name} (automation "${rule.name}")`,
        link: `/leads?open=${lead.id}`,
    });
    const due = action.dueInDays === 0 ? "today" : action.dueInDays === 1 ? "tomorrow" : `in ${action.dueInDays} days`;
    return `Task "${title}" for ${owner.name}, due ${due}`;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function mustLoadLead(id: number) {
    const lead = await loadLead(id);
    if (!lead) throw new Error("the lead was deleted");
    return lead;
}

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

// The {{placeholders}} for a template or task title, for this lead and whoever acts on it
async function templateValues(lead: Lead, me: { name: string; email: string }): Promise<TemplateValues> {
    const workspace = await prisma.organization.findUniqueOrThrow({ where: { id: lead.organizationId }, select: { name: true } });
    return {
        "lead.firstName": lead.name.split(" ")[0],
        "lead.name": lead.name,
        "lead.company": lead.companyName,
        "me.name": me.name,
        "me.email": me.email,
        "workspace.name": workspace.name,
    };
}

// The run's row, or null if this rule already ran for this event (the unique key says so)
async function claimRun(ruleId: number, eventKey: string, leadId: number) {
    try {
        return await prisma.automationRun.create({ data: { ruleId, eventKey, leadId, status: "RUNNING" } });
    } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return null;
        throw error;
    }
}

async function keepNewestRuns(ruleId: number) {
    const old = await prisma.automationRun.findMany({ where: { ruleId }, orderBy: { id: "desc" }, skip: KEEP_RUNS, select: { id: true } });
    if (old.length > 0) await prisma.automationRun.deleteMany({ where: { id: { in: old.map((run) => run.id) } } });
}
