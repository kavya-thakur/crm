import { NextResponse } from "next/server";
import Papa from "papaparse";

import { prisma } from "@/lib/db/prisma";
import { hasPermission, type CurrentUser } from "@/lib/auth/requirePermission";
import { LEAD_IMPORT_FIELDS, MAX_IMPORT_BYTES, MAX_IMPORT_ROWS, startImportSchema } from "@/lib/validations/imports";

const fail = (message: string, status = 400) => ({ error: NextResponse.json({ ok: false, message }, { status }) });

/**
 * What the import screen sends, read and checked: the CSV file and its settings (the column
 * mapping, defaults, matched values and fixes). The same for checking a file (/api/imports/check)
 * and for starting its import (/api/imports), so both see exactly the same thing.
 */
export async function readImportUpload(req: Request, user: CurrentUser) {
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
    const rows = parsed.data;
    if (rows.length === 0) return fail("That file has no rows to import");
    if (rows.length > MAX_IMPORT_ROWS) return fail(`That file has more than ${MAX_IMPORT_ROWS.toLocaleString()} rows. Split it and import the parts one by one.`);

    // the mapping: only this file's columns, only real fields, each field once, name and phone included
    const customKeys = new Set(
        (await prisma.customFieldDefinition.findMany({ where: { organizationId: user.organizationId, entity: "lead" }, select: { key: true } })).map(
            (definition) => `cf:${definition.key}`,
        ),
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

    return { file, csv, headers, rows, mapping, defaults };
}
