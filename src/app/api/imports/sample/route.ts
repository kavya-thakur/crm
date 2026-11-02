import { NextResponse } from "next/server";
import Papa from "papaparse";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/auth/requirePermission";
import { handleRouteError } from "@/lib/api/http";

/**
 * A sample CSV for importing leads into *this* workspace: the usual columns plus every lead
 * custom field, with one example row using this workspace's own stage, source and people.
 * Its headers are the ones the import screen recognises, so a filled-in copy maps itself.
 */
export async function GET() {
    try {
        const user = await requirePermission("lead:create");
        const organizationId = user.organizationId;

        const [stage, source, fields] = await Promise.all([
            prisma.leadStage.findFirst({ where: { organizationId, isConverted: false, isLost: false }, orderBy: [{ order: "asc" }, { id: "asc" }] }),
            prisma.leadSource.findFirst({ where: { organizationId }, orderBy: [{ order: "asc" }, { id: "asc" }] }),
            prisma.customFieldDefinition.findMany({ where: { organizationId, entity: "lead" }, orderBy: [{ order: "asc" }, { id: "asc" }] }),
        ]);

        // an example that the import will accept, for each kind of custom field
        const example = (field: (typeof fields)[number]) => {
            if (field.type === "NUMBER") return "50000";
            if (field.type === "DATE") return new Date().toISOString().slice(0, 10);
            if (field.type === "SELECT") return ((field.options as string[] | null) ?? [])[0] ?? "";
            if (field.type === "BOOLEAN") return "Yes";
            // a teammate, by name (an email works too)
            if (field.type === "AGENT") return user.name;
            return "Some text";
        };

        const header = ["Name", "Phone", "Email", "Company", "Stage", "Source", "Assigned to", "Note", ...fields.map((field) => field.label)];
        const row = [
            "Rahul Mehta",
            "+91 98765 43210",
            "rahul@example.com",
            "Acme Interiors",
            stage?.name ?? "",
            source?.name ?? "",
            user.name,
            "Wants a quote for a 3BHK",
            ...fields.map(example),
        ];

        // the first character tells Excel the file is UTF-8
        return new NextResponse("﻿" + Papa.unparse([header, row]) + "\r\n", {
            headers: {
                "content-type": "text/csv; charset=utf-8",
                "content-disposition": `attachment; filename="flash-leads-sample.csv"`,
            },
        });
    } catch (error) {
        return handleRouteError(error, "Sample import file");
    }
}
