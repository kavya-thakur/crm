import Papa from "papaparse";
import type { CustomFieldDefinition, Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";

/*
 * CSV downloads of leads, deals and contacts: the list routes call these with ?format=csv,
 * passing the same `where` (filters + permissions) the list itself uses, so the file is
 * exactly what's on screen. Rows are read 1,000 at a time and streamed out as they're read,
 * so even a very big export never sits in memory all at once.
 */

const PAGE = 1000;

// a moment as a plain date, the way spreadsheets sort it
const day = (date: Date | string | null | undefined) => (date ? new Date(date).toISOString().slice(0, 10) : "");

/**
 * What could run as a formula when the file is opened in Excel: a value starting with = @ or a
 * tab, or with + or - followed by anything but number characters. So "=HYPERLINK(...)" (typed into
 * a lead by anyone, even through a web form) gets a ' in front, but a phone number like
 * "+91 98000 80001" or an amount like "-500" stays as it is: those can't hold a formula.
 */
const FORMULA = /^(?:[=@\t\r]|[+-](?![\d\s().+-]*$))/;

/**
 * A streamed CSV response. `escapeFormulae` (FORMULA, above) stops a value from running as a
 * formula when the file is opened in Excel. The first character tells Excel the file is UTF-8, so ₹ and names in any
 * language come out right.
 */
function csvResponse(fileName: string, header: string[], rows: AsyncGenerator<unknown[][]>) {
    const encoder = new TextEncoder();
    let started = false;

    const stream = new ReadableStream<Uint8Array>({
        async pull(controller) {
            if (!started) {
                started = true;
                controller.enqueue(encoder.encode("﻿" + Papa.unparse([header]) + "\r\n"));
                return;
            }
            const next = await rows.next();
            if (next.done) return controller.close();
            controller.enqueue(encoder.encode(Papa.unparse(next.value, { escapeFormulae: FORMULA }) + "\r\n"));
        },
    });

    return new Response(stream, {
        headers: {
            "content-type": "text/csv; charset=utf-8",
            "content-disposition": `attachment; filename="${fileName}-${day(new Date())}.csv"`,
        },
    });
}

// Reads a table 1,000 rows at a time, in id order, each page starting after the last id
// (`id > last` uses the primary key's index, so the 50th page is as quick as the first)
async function* pages<T extends { id: number }>(load: (after?: number) => Promise<T[]>, toRow: (item: T) => unknown[]) {
    let after: number | undefined;
    for (;;) {
        const items = await load(after);
        if (items.length > 0) yield items.map(toRow);
        if (items.length < PAGE) return;
        after = items[items.length - 1].id;
    }
}


// who made it and who changed it last, by name (empty for records from before this was tracked)
const byWhom = { createdBy: { select: { name: true } }, updatedBy: { select: { name: true } } } as const;

// A record's custom fields as columns, labelled like the table; an Agent field shows the person's name
async function customColumns(organizationId: number, entity: "lead" | "deal" | "contact") {
    const [definitions, people] = await Promise.all([
        prisma.customFieldDefinition.findMany({ where: { organizationId, entity }, orderBy: [{ order: "asc" }, { id: "asc" }] }),
        prisma.user.findMany({ where: { organizationId }, select: { id: true, name: true } }),
    ]);

    const show = (definition: CustomFieldDefinition, value: unknown) => {
        if (value === null || value === undefined || value === "") return "";
        if (definition.type === "BOOLEAN") return value ? "Yes" : "No";
        if (definition.type === "DATE") return day(value as string);
        if (definition.type === "AGENT") return people.find((person) => person.id === Number(value))?.name ?? "";
        if (Array.isArray(value)) return value.join(", ");
        return String(value);
    };

    return {
        header: definitions.map((definition) => definition.label),
        values: (customFields: Prisma.JsonValue) => definitions.map((definition) => show(definition, (customFields as Record<string, unknown> | null)?.[definition.key])),
    };
}

export async function exportLeads(organizationId: number, where: Prisma.LeadWhereInput) {
    const custom = await customColumns(organizationId, "lead");
    // the same column names the importer recognises, so an exported file can be imported again
    const header = [
        "Name", "Email", "Phone", "Company", "Stage", "Source", "Campaign", "Assigned to", "Lost reason", "Created", "Last updated",
        "UTM source", "UTM medium", "Created by", "Last modified by",
        ...custom.header,
    ];

    return csvResponse(
        "leads",
        header,
        pages(
            (id) => prisma.lead.findMany({ where: { AND: [where, { id: { gt: id ?? 0 } }] }, orderBy: { id: "asc" }, take: PAGE, include: { stage: true, source: true, assignedTo: { select: { name: true } }, ...byWhom } }),
            (lead) => [
                lead.name,
                lead.email ?? "",
                lead.phone ?? "",
                lead.companyName ?? "",
                lead.stage.name,
                lead.source?.name ?? "",
                lead.utmCampaign ?? "",
                lead.assignedTo?.name ?? "",
                lead.lostReason ?? "",
                day(lead.createdAt),
                day(lead.updatedAt),
                lead.utmSource ?? "",
                lead.utmMedium ?? "",
                lead.createdBy?.name ?? "",
                lead.updatedBy?.name ?? "",
                ...custom.values(lead.customFields),
            ],
        ),
    );
}

export async function exportDeals(organizationId: number, where: Prisma.DealWhereInput) {
    const custom = await customColumns(organizationId, "deal");
    const header = [
        "Title", "Amount", "Probability %", "Stage", "Expected close", "Lead", "Phone", "Email", "Company", "Assigned to", "Lost reason", "Closed",
        "Description", "Products", "Created", "Last updated", "Created by", "Last modified by",
        ...custom.header,
    ];

    return csvResponse(
        "deals",
        header,
        pages(
            (id) =>
                prisma.deal.findMany({
                    where: { AND: [where, { id: { gt: id ?? 0 } }] },
                    orderBy: { id: "asc" },
                    take: PAGE,
                    include: {
                        pipelineStage: true,
                        lead: { select: { name: true, phone: true, email: true, contact: { select: { company: { select: { name: true } } } } } },
                        assignedTo: { select: { name: true } },
                        // its quote's lines, as "2 × Licence; 1 × Setup"
                        products: { select: { name: true, quantity: true }, orderBy: { id: "asc" } },
                        ...byWhom,
                    },
                }),
            (deal) => [
                deal.title,
                Number(deal.amount),
                deal.probability,
                deal.pipelineStage.name,
                day(deal.expectedCloseDate),
                deal.lead?.name ?? "",
                deal.lead?.phone ?? "",
                deal.lead?.email ?? "",
                deal.lead?.contact?.company?.name ?? "",
                deal.assignedTo?.name ?? "",
                deal.lostReason ?? "",
                day(deal.closedAt),
                deal.description ?? "",
                deal.products.map((line) => `${line.quantity} × ${line.name}`).join("; "),
                day(deal.createdAt),
                day(deal.updatedAt),
                deal.createdBy?.name ?? "",
                deal.updatedBy?.name ?? "",
                ...custom.values(deal.customFields),
            ],
        ),
    );
}

export async function exportContacts(organizationId: number, where: Prisma.ContactWhereInput) {
    const custom = await customColumns(organizationId, "contact");
    const header = ["Name", "Email", "Phone", "Company", "Job title", "Assigned to", "Description", "Created", "Last updated", "Created by", "Last modified by", ...custom.header];

    return csvResponse(
        "contacts",
        header,
        pages(
            (id) => prisma.contact.findMany({ where: { AND: [where, { id: { gt: id ?? 0 } }] }, orderBy: { id: "asc" }, take: PAGE, include: { company: { select: { name: true } }, assignedTo: { select: { name: true } }, ...byWhom } }),
            (contact) => [
                contact.name,
                contact.email ?? "",
                contact.phone ?? "",
                contact.company?.name ?? "",
                contact.jobTitle ?? "",
                contact.assignedTo?.name ?? "",
                contact.description ?? "",
                day(contact.createdAt),
                day(contact.updatedAt),
                contact.createdBy?.name ?? "",
                contact.updatedBy?.name ?? "",
                ...custom.values(contact.customFields),
            ],
        ),
    );
}
