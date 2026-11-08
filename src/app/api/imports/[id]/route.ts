import { NextRequest, NextResponse } from "next/server";
import Papa from "papaparse";
import { prisma } from "@/lib/db/prisma";
import { hasPermission, requirePermission } from "@/lib/auth/requirePermission";
import { handleRouteError, validationError } from "@/lib/api/http";
import { idParamSchema } from "@/lib/validations/common";
import { importScope, importSummarySelect } from "@/lib/jobs/leadImport";

// One import's progress and counts (the page also gets them live, over the socket)
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const user = await requirePermission("lead:create");

        const id = idParamSchema.safeParse((await params).id);
        if (!id.success) return validationError(id.error);

        const found = await prisma.importJob.findFirst({
            where: { id: id.data, ...importScope(user, hasPermission(user, "lead:all")) },
            select: { ...importSummarySelect, errorsCsv: true, mapping: true },
        });
        if (!found) return NextResponse.json({ ok: false, message: "Import not found" }, { status: 404 });
        const { errorsCsv, mapping, ...job } = found;

        return NextResponse.json({ ok: true, data: { ...job, problemGroups: groupProblems(errorsCsv, mapping as Record<string, string>) } });
    } catch (error) {
        return handleRouteError(error, "Get import");
    }
}

/**
 * The rows that weren't added, grouped by why, for the results page to show (the download has
 * every row): "Already a lead in Flash: 312", "Phone: Invalid phone number: 20"... with a few names.
 * The exact value in a reason ("Billions") is left out, so the same problem groups together.
 */
function groupProblems(errorsCsv: string | null, mapping: Record<string, string>) {
    if (!errorsCsv) return [];
    const nameColumn = Object.keys(mapping).find((column) => mapping[column] === "name");
    const rows = Papa.parse<Record<string, string>>(errorsCsv, { header: true, skipEmptyLines: "greedy" }).data;
    const groups = new Map<string, { reason: string; count: number; names: string[] }>();
    for (const row of rows) {
        const problem = row.Problem ?? "";
        const reason = problem.startsWith("Already a lead") ? "Already a lead in Flash" : problem.replace(/"[^"]*"/g, "…");
        const group = groups.get(reason) ?? { reason, count: 0, names: [] };
        group.count += 1;
        if (group.names.length < 3 && nameColumn && row[nameColumn]) group.names.push(row[nameColumn]);
        groups.set(reason, group);
    }
    return [...groups.values()].sort((a, b) => b.count - a.count);
}
