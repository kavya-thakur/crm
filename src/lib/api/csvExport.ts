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
 * A streamed CSV response. `escapeFormulae` stops a value like "=HYPERLINK(...)" (typed into a
 * lead by anyone, even through a web form) from running as a formula when the file is
 * opened in Excel. The first character tells Excel the file is UTF-8, so ₹ and names in any
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
            controller.enqueue(encoder.encode(Papa.unparse(next.value, { escapeFormulae: true }) + "\r\n"));
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
    const header = ["Name", "Email", "Phone", "Company", "Stage", "Source", "Assigned to", "Lost reason", "Created", "Last updated", ...custom.header];

    return csvResponse(
        "leads",
        header,
        pages(
            (id) => prisma.lead.findMany({ where: { AND: [where, { id: { gt: id ?? 0 } }] }, orderBy: { id: "asc" }, take: PAGE, include: { stage: true, source: true, assignedTo: { select: { name: true } } } }),
            (lead) => [
                lead.name,
                lead.email ?? "",
                lead.phone ?? "",
                lead.companyName ?? "",
                lead.stage.name,
                lead.source?.name ?? "",
                lead.assignedTo?.name ?? "",
                lead.lostReason ?? "",
                day(lead.createdAt),
                day(lead.updatedAt),
                ...custom.values(lead.customFields),
            ],
        ),
    );
}

export async function exportDeals(organizationId: number, where: Prisma.DealWhereInput) {
    const custom = await customColumns(organizationId, "deal");
    const header = ["Title", "Amount", "Probability %", "Stage", "Expected close", "Lead", "Phone", "Email", "Assigned to", "Lost reason", "Closed", "Created", ...custom.header];

    return csvResponse(
        "deals",
        header,
        pages(
            (id) =>
                prisma.deal.findMany({
                    where: { AND: [where, { id: { gt: id ?? 0 } }] },
                    orderBy: { id: "asc" },
                    take: PAGE,
                    include: { pipelineStage: true, lead: { select: { name: true, phone: true, email: true } }, assignedTo: { select: { name: true } } },
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
                deal.assignedTo?.name ?? "",
                deal.lostReason ?? "",
                day(deal.closedAt),
                day(deal.createdAt),
                ...custom.values(deal.customFields),
            ],
        ),
    );
}

export async function exportContacts(organizationId: number, where: Prisma.ContactWhereInput) {
    const custom = await customColumns(organizationId, "contact");
    const header = ["Name", "Email", "Phone", "Company", "Assigned to", "Created", ...custom.header];

    return csvResponse(
        "contacts",
        header,
        pages(
            (id) => prisma.contact.findMany({ where: { AND: [where, { id: { gt: id ?? 0 } }] }, orderBy: { id: "asc" }, take: PAGE, include: { company: { select: { name: true } }, assignedTo: { select: { name: true } } } }),
            (contact) => [contact.name, contact.email ?? "", contact.phone ?? "", contact.company?.name ?? "", contact.assignedTo?.name ?? "", day(contact.createdAt), ...custom.values(contact.customFields)],
        ),
    );
}
