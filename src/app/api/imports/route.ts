import { NextRequest, NextResponse } from "next/server";
import Papa from "papaparse";
import { prisma } from "@/lib/db/prisma";
import { hasPermission, requirePermission } from "@/lib/auth/requirePermission";
import { handleRouteError } from "@/lib/api/http";
import { tooManyAttempts } from "@/lib/api/rateLimit";
import { importScope, importSummarySelect } from "@/lib/jobs/leadImport";
import { importsQueue } from "@/lib/jobs/queues";
import { LEAD_IMPORT_FIELDS, MAX_IMPORT_BYTES, MAX_IMPORT_ROWS, startImportSchema } from "@/lib/validations/imports";

// Recent imports, newest first, for the import page's history
export async function GET() {
    try {
        const user = await requirePermission("lead:create");

        const imports = await prisma.importJob.findMany({
            where: importScope(user, hasPermission(user, "lead:all")),
            orderBy: { createdAt: "desc" },
            take: 20,
            select: importSummarySelect,
        });

        return NextResponse.json({ ok: true, data: imports });
    } catch (error) {
        return handleRouteError(error, "Get imports");
    }
}

const fail = (message: string, status = 400) => NextResponse.json({ ok: false, message }, { status });

/**
 * Starts a leads import: checks the file and the column mapping, saves them as an ImportJob,
 * puts its id on the queue and answers straight away. The worker does the actual importing
 * in the background (src/lib/jobs/leadImport.ts), reporting progress live.
 * Sent as a form: `file` (the CSV) and `settings` (JSON: { mapping, defaults }).
 */
export async function POST(req: NextRequest) {
    try {
        const user = await requirePermission("lead:create");

        if (await tooManyAttempts(`import:${user.id}`, 10, 60 * 60 * 1000)) {
            return fail("That's a lot of imports in an hour. Please wait a little before the next one.", 429);
        }

        const form = await req.formData().catch(() => null);
        const file = form?.get("file");
        if (!(file instanceof File)) return fail("Choose a CSV file to import");
        if (file.size > MAX_IMPORT_BYTES) return fail("That file is over 5 MB. Split it into smaller files and import them one by one.", 413);

        let settingsJson: unknown;
        try {
            settingsJson = JSON.parse(String(form?.get("settings") ?? ""));
        } catch {
            return fail("Invalid import settings");
        }
        const settings = startImportSchema.safeParse(settingsJson);
        if (!settings.success) return fail("Invalid import settings");
        const { defaults } = settings.data;

        const csv = await file.text();
        const parsed = Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: "greedy", preview: MAX_IMPORT_ROWS + 1 });
        const headers = parsed.meta.fields ?? [];
        const rowCount = parsed.data.length;
        if (rowCount === 0) return fail("That file has no rows to import");
        if (rowCount > MAX_IMPORT_ROWS) return fail(`That file has more than ${MAX_IMPORT_ROWS.toLocaleString()} rows. Split it and import the parts one by one.`);

        // the mapping: only this file's columns, only real fields, each field once, name and phone included
        const customKeys = new Set(
            (
                await prisma.customFieldDefinition.findMany({
                    where: { organizationId: user.organizationId, entity: "lead" },
                    select: { key: true },
                })
            ).map((definition) => `cf:${definition.key}`),
        );
        const builtIn = new Set<string>(LEAD_IMPORT_FIELDS.map((field) => field.id));
        const mapping = Object.fromEntries(Object.entries(settings.data.mapping).filter(([column, field]) => field && headers.includes(column)));
        const fields = Object.values(mapping);
        if (fields.some((field) => !builtIn.has(field) && !customKeys.has(field))) return fail("A column is mapped to a field that doesn't exist");
        if (new Set(fields).size !== fields.length) return fail("Two columns are mapped to the same field");
        if (!fields.includes("name") || !fields.includes("phone")) return fail("Choose which columns hold the name and the phone number");

        // the defaults have to be this workspace's own; without lead:all, the leads are yours
        if (defaults.stageId && !(await prisma.leadStage.findFirst({ where: { id: defaults.stageId, organizationId: user.organizationId } }))) {
            return fail("Invalid lead stage");
        }
        if (defaults.sourceId && !(await prisma.leadSource.findFirst({ where: { id: defaults.sourceId, organizationId: user.organizationId } }))) {
            return fail("Invalid lead source");
        }
        if (defaults.ownerId !== undefined && defaults.ownerId !== user.id) {
            if (!hasPermission(user, "lead:all")) return fail("You can only import leads for yourself", 403);
            if (defaults.ownerId !== null && !(await prisma.user.findFirst({ where: { id: defaults.ownerId, organizationId: user.organizationId } }))) {
                return fail("Invalid owner");
            }
        }

        const job = await prisma.importJob.create({
            data: { organizationId: user.organizationId, userId: user.id, entity: "lead", fileName: file.name.slice(0, 200), mapping, defaults, csv, total: rowCount },
            select: importSummarySelect,
        });

        // only the id goes on the queue; the worker reads the rest from the database
        try {
            await importsQueue().add("leads", { importJobId: job.id }, { jobId: `import-${job.id}` });
        } catch {
            await prisma.importJob.update({ where: { id: job.id }, data: { status: "FAILED", error: "The import queue isn't available", csv: null } });
            return fail("Imports aren't available right now. Please try again in a few minutes.", 503);
        }

        return NextResponse.json({ ok: true, data: job }, { status: 201 });
    } catch (error) {
        return handleRouteError(error, "Start import");
    }
}
