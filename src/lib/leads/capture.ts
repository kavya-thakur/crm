import { z } from "zod";
import type { CustomFieldType, LeadForm, Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import { optionalEmail, optionalText, requiredPhone, requiredText } from "@/lib/validations/common";
import { formTexts, readFormSettings } from "@/lib/validations/leadForms";
import { validateCustomFieldValues } from "@/lib/settings/customFields";
import { addTaskToTimeline, startOfToday } from "@/lib/work/tasks";
import { findOpenCopy } from "@/lib/leads/duplicates";
import { broadcastChange, notify } from "@/lib/realtime/notify";

// What a web form sends. Name and phone always (every lead and contact needs them); the
// form's own settings decide whether email, company and message are required (see
// checkAnswers). Answers to the lead custom fields it asks come as customFields, by key;
// anything else an embedded form adds ("Team size": "6–20") is kept on the timeline.
export const formSubmissionSchema = z.object({
    name: requiredText(200),
    email: optionalEmail,
    phone: requiredPhone,
    company: optionalText(200),
    message: optionalText(2000),
    customFields: z.record(z.string().max(50), z.unknown()).optional(),
    details: z.record(z.string().max(60), z.string().max(300)).optional(),
    // the spam trap: a field people never see, so only bots fill it in
    website: z.string().optional(),
    // the ad campaign the visitor came from: the utm_ tags on the link to the form's page
    utm_source: optionalText(100),
    utm_medium: optionalText(100),
    utm_campaign: optionalText(150),
});

export type FormSubmission = z.infer<typeof formSubmissionSchema>;

// "How can we help? … · Budget: 5–10L · Team size: 6–20", for the timeline and the reply task
function describe(input: FormSubmission, answers: string[]) {
    const details = Object.entries(input.details ?? {})
        .filter(([, value]) => value.trim() !== "")
        .map(([label, value]) => `${label}: ${value}`);
    return [input.message?.trim() ? `"${input.message.trim()}"` : null, ...answers, ...details].filter(Boolean).join(" · ");
}

const BUILT_IN_LABELS = { email: "Email", company: "Company", message: "Message" } as const;

// What a browser form sends is all text: "on" for a ticked box, "" for a field left empty
function fromForm(type: CustomFieldType, raw: unknown) {
    const value = typeof raw === "string" ? raw.trim() : raw;
    if (value === undefined || value === null || value === "") return undefined;
    if (type === "BOOLEAN") return value === true || value === "true" || value === "on";
    return value;
}

// An answer as the timeline shows it
function shown(type: CustomFieldType, value: unknown) {
    if (type === "BOOLEAN") return value ? "Yes" : "No";
    if (type === "DATE") return String(value).slice(0, 10);
    return String(value);
}

/**
 * Checks a submission against what its form asks: the built-in fields it makes required,
 * and the lead custom fields it asks for (required or not as the form says, whatever the
 * field's own setting). Returns the custom field values to save on the lead, and the
 * answers in words for the timeline.
 */
async function checkAnswers(form: LeadForm, input: FormSubmission) {
    const settings = readFormSettings(form.settings);
    const errors: Record<string, string> = {};

    for (const field of ["email", "company", "message"] as const) {
        if (settings[field] === "required" && !input[field]) errors[field] = `${BUILT_IN_LABELS[field]} is required`;
    }

    const asked = settings.customFields;
    const definitions =
        asked.length === 0
            ? []
            : await prisma.customFieldDefinition.findMany({
                  where: { organizationId: form.organizationId, entity: "lead", key: { in: asked.map((field) => field.key) }, type: { not: "AGENT" } },
              });
    // in the form's order, required as the form says; a field deleted since is skipped
    const fields = asked.flatMap((field) => {
        const definition = definitions.find((item) => item.key === field.key);
        return definition ? [{ ...definition, required: field.required }] : [];
    });

    const submitted = Object.fromEntries(fields.map((field) => [field.key, fromForm(field.type, input.customFields?.[field.key])]));
    const result = validateCustomFieldValues(fields, submitted);
    if (!result.ok) Object.assign(errors, result.errors);

    if (Object.keys(errors).length > 0 || !result.ok) return { ok: false as const, errors };

    const values = result.data;
    const answers = fields.filter((field) => field.key in values).map((field) => `${field.label}: ${shown(field.type, values[field.key])}`);
    return { ok: true as const, values, answers };
}

/**
 * Turns one web form submission into a lead in the form's workspace:
 *  - someone who's already an open lead isn't added twice; their lead gets a timeline note
 *  - otherwise a lead (and its contact) is created in the first stage, tagged with the
 *    form's source and given to its owner (or the next person in its rotation), who also
 *    gets a task to reply today
 * Returns whether a new lead was made, so the caller can't tell a visitor anything more.
 */
export async function captureLead(formKey: string, input: FormSubmission) {
    const form = await prisma.leadForm.findUnique({ where: { key: formKey } });
    if (!form) return { ok: false as const, reason: "missing" as const };

    const checked = await checkAnswers(form, input);
    if (!checked.ok) return { ok: false as const, reason: "invalid" as const, errors: checked.errors };

    // what to show (or where to send) whoever sent it
    const settings = readFormSettings(form.settings);
    const after = { thankYou: formTexts(settings, form.name).thankYou, redirectUrl: settings.redirectUrl };

    const { organizationId } = form;
    // "Campaign: diwali-sale (google / cpc)", for the timeline
    const campaign = input.utm_campaign
        ? `Campaign: ${input.utm_campaign}${input.utm_source ? ` (${[input.utm_source, input.utm_medium].filter(Boolean).join(" / ")})` : ""}`
        : null;
    const summary = describe(input, [...checked.answers, ...(campaign ? [campaign] : [])]);
    const utm = { utmSource: input.utm_source ?? null, utmMedium: input.utm_medium ?? null, utmCampaign: input.utm_campaign ?? null };
    const came = `Came in through "${form.name}"${summary ? `: ${summary}` : ""}`;

    // A timeline entry belongs to a person, but a website visitor isn't one: entries are
    // filed under the form's owner (or, without one, the workspace's first member) and
    // marked as the form's, so the timeline shows "Web form" rather than their name
    const actor = form.ownerId ?? (await prisma.user.findFirst({ where: { organizationId }, orderBy: { id: "asc" }, select: { id: true } }))?.id;
    if (!actor) return { ok: false as const, reason: "missing" as const };
    const fromForm = { formId: form.id };

    const existing = await findOpenCopy(organizationId, input);

    if (existing) {
        // new answers fill the lead's empty custom fields; ones it already has stay as they are
        const before = await prisma.lead.findUnique({ where: { id: existing.id }, select: { customFields: true, utmCampaign: true } });
        const current = (before?.customFields ?? {}) as Record<string, unknown>;
        const blanks = Object.fromEntries(Object.entries(checked.values).filter(([key]) => current[key] === undefined || current[key] === null || current[key] === ""));

        await prisma.lead.update({
            where: { id: existing.id },
            data: {
                ...(Object.keys(blanks).length > 0 && { customFields: { ...current, ...blanks } as Prisma.InputJsonObject }),
                // the campaign that first brought them in keeps the credit; a lead without one gets this one
                ...(!before?.utmCampaign && utm.utmCampaign && utm),
                timeline: { create: { userId: actor, type: "WEB_FORM", message: came.replace("Came in through", "Sent"), metadata: fromForm } },
            },
        });
        broadcastChange(organizationId, "leads");
        return { ok: true as const, created: false, leadId: existing.id, ...after };
    }

    const firstStage = await prisma.leadStage.findFirst({
        where: { organizationId, isConverted: false, isLost: false },
        orderBy: [{ order: "asc" }, { id: "asc" }],
        select: { id: true },
    });
    if (!firstStage) return { ok: false as const, reason: "missing" as const };

    const assignee = await nextAssignee(form);

    const lead = await prisma.$transaction(async (tx) => {
        // the same person may already be in the address book from an older lead
        const contact =
            (await tx.contact.findFirst({ where: { organizationId, phone: input.phone }, select: { id: true } })) ??
            (await tx.contact.create({
                data: { organizationId, name: input.name, email: input.email, phone: input.phone, assignedToId: assignee },
                select: { id: true },
            }));

        const created = await tx.lead.create({
            data: {
                organizationId,
                name: input.name,
                email: input.email,
                phone: input.phone,
                companyName: input.company ?? null,
                ...utm,
                // the form's answers, in the lead's own custom fields
                customFields: checked.values as Prisma.InputJsonObject,
                stageId: firstStage.id,
                sourceId: form.sourceId,
                assignedToId: assignee,
                contactId: contact.id,
                timeline: { create: { userId: assignee ?? actor, type: "WEB_FORM", message: came, metadata: fromForm } },
            },
            select: { id: true },
        });

        // speed matters with a fresh lead: whoever got it has a task to reply today
        if (assignee) {
            const task = await tx.task.create({
                data: {
                    organizationId,
                    title: `Reply to ${input.name}`,
                    description: summary || null,
                    priority: "HIGH",
                    dueDate: startOfToday(),
                    assignedToId: assignee,
                    createdById: assignee,
                    leadId: created.id,
                },
            });
            await addTaskToTimeline(tx, task, assignee, "created");
        }

        return created;
    });

    // a visitor has no session, so server.ts can't announce this one: do it here
    broadcastChange(organizationId, "leads");
    broadcastChange(organizationId, "tasks");
    await notify([assignee], {
        organizationId,
        actorId: null,
        type: "LEAD_ASSIGNED",
        title: `New lead from "${form.name}"`,
        body: input.name,
        link: `/leads?open=${lead.id}`,
    });

    return { ok: true as const, created: true, leadId: lead.id, ...after };
}

// Who gets the form's next lead. With a rotation, each person in it takes a turn in order
// (people who've since left the workspace are skipped); otherwise the form's one owner.
async function nextAssignee(form: LeadForm) {
    if (form.assigneeIds.length === 0) return form.ownerId;

    const members = await prisma.user.findMany({
        where: { id: { in: form.assigneeIds }, organizationId: form.organizationId },
        select: { id: true },
    });
    const rotation = form.assigneeIds.filter((id) => members.some((member) => member.id === id));
    if (rotation.length === 0) return form.ownerId;

    // the count goes up in the database itself, so two leads arriving at once never share a turn
    const { turn } = await prisma.leadForm.update({ where: { id: form.id }, data: { turn: { increment: 1 } }, select: { turn: true } });
    return rotation[(turn - 1) % rotation.length];
}
