import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { emailSchema, optionalText, requiredPhone, requiredText } from "@/lib/validations/common";
import { addTaskToTimeline, startOfToday } from "@/lib/tasks";
import { findSimilarLeads } from "@/lib/leadDuplicates";

// What a web form sends. Same rules as typing a lead in by hand, plus whatever else the
// form asked ("Team size": "6–20"), which is kept on the lead's timeline.
export const formSubmissionSchema = z.object({
    name: requiredText(200),
    email: emailSchema,
    phone: requiredPhone,
    company: optionalText(200),
    message: optionalText(2000),
    details: z.record(z.string().max(60), z.string().max(300)).optional(),
    // the spam trap: a field people never see, so only bots fill it in
    website: z.string().optional(),
});

export type FormSubmission = z.infer<typeof formSubmissionSchema>;

// "How can we help? … · Team size: 6–20", for the timeline and the reply task
function describe(input: FormSubmission) {
    const details = Object.entries(input.details ?? {})
        .filter(([, value]) => value.trim() !== "")
        .map(([label, value]) => `${label}: ${value}`);
    return [input.message?.trim() ? `"${input.message.trim()}"` : null, ...details].filter(Boolean).join(" · ");
}

/**
 * Turns one web form submission into a lead in the form's workspace:
 *  - someone who's already an open lead isn't added twice; their lead gets a timeline note
 *  - otherwise a lead (and its contact) is created in the first stage, tagged with the
 *    form's source and given to its owner, who also gets a task to reply today
 * Returns whether a new lead was made, so the caller can't tell a visitor anything more.
 */
export async function captureLead(formKey: string, input: FormSubmission) {
    const form = await prisma.leadForm.findUnique({ where: { key: formKey } });
    if (!form) return { ok: false as const, reason: "missing" as const };

    const { organizationId } = form;
    const summary = describe(input);
    const came = `Came in through "${form.name}"${summary ? `: ${summary}` : ""}`;

    // A timeline entry belongs to a person, but a website visitor isn't one: entries are
    // filed under the form's owner (or, without one, the workspace's first member) and
    // marked as the form's, so the timeline shows "Web form" rather than their name
    const actor = form.ownerId ?? (await prisma.user.findFirst({ where: { organizationId }, orderBy: { id: "asc" }, select: { id: true } }))?.id;
    if (!actor) return { ok: false as const, reason: "missing" as const };
    const fromForm = { formId: form.id };

    const existing = (await findSimilarLeads(organizationId, input)).find((lead) => !lead.stage.isConverted && !lead.stage.isLost);

    if (existing) {
        await prisma.lead.update({
            where: { id: existing.id },
            data: {
                timeline: { create: { userId: actor, type: "WEB_FORM", message: came.replace("Came in through", "Sent"), metadata: fromForm } },
            },
        });
        return { ok: true as const, created: false, leadId: existing.id };
    }

    const firstStage = await prisma.leadStage.findFirst({
        where: { organizationId, isConverted: false, isLost: false },
        orderBy: [{ order: "asc" }, { id: "asc" }],
        select: { id: true },
    });
    if (!firstStage) return { ok: false as const, reason: "missing" as const };

    const lead = await prisma.$transaction(async (tx) => {
        // the same person may already be in the address book from an older lead
        const contact =
            (await tx.contact.findFirst({ where: { organizationId, phone: input.phone }, select: { id: true } })) ??
            (await tx.contact.create({
                data: { organizationId, name: input.name, email: input.email, phone: input.phone, assignedToId: form.ownerId },
                select: { id: true },
            }));

        const created = await tx.lead.create({
            data: {
                organizationId,
                name: input.name,
                email: input.email,
                phone: input.phone,
                companyName: input.company ?? null,
                stageId: firstStage.id,
                sourceId: form.sourceId,
                assignedToId: form.ownerId,
                contactId: contact.id,
                timeline: { create: { userId: actor, type: "WEB_FORM", message: came, metadata: fromForm } },
            },
            select: { id: true },
        });

        // speed matters with a fresh lead: its owner gets a task to reply today
        if (form.ownerId) {
            const task = await tx.task.create({
                data: {
                    organizationId,
                    title: `Reply to ${input.name}`,
                    description: summary || null,
                    priority: "HIGH",
                    dueDate: startOfToday(),
                    assignedToId: form.ownerId,
                    createdById: form.ownerId,
                    leadId: created.id,
                },
            });
            await addTaskToTimeline(tx, task, form.ownerId, "created");
        }

        return created;
    });

    return { ok: true as const, created: true, leadId: lead.id };
}
