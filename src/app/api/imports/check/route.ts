import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/db/prisma";
import { hasPermission, requirePermission } from "@/lib/auth/requirePermission";
import { handleRouteError } from "@/lib/api/http";
import { tooManyAttempts } from "@/lib/api/rateLimit";
import { matchKeys } from "@/lib/leads/duplicates";
import { readImportUpload } from "@/lib/imports/upload";
import { duplicateOf, rowReader, type ProblemCode } from "@/lib/imports/rows";

// example rows shown per problem; every row's line number comes too, for "download these rows"
const SAMPLES = 5;
const KEY_CHUNK = 1000;
const ORDER: ProblemCode[] = ["missing-phone", "bad-phone", "bad-name", "missing-name", "bad-email", "unknown-value", "bad-value"];

/**
 * The import screen's check: reads every row of the file with the chosen mapping, matched values
 * and fixes, through the same rules as the import (src/lib/imports/rows.ts), and says what would
 * happen, without adding anything: how many would be added, which are already leads, the problems
 * grouped (with the rows they're on), and the values that match nothing in Flash, for matching.
 * Sent the same as starting an import: `file` and `settings`.
 */
export async function POST(req: NextRequest) {
    try {
        const user = await requirePermission("lead:create");
        // checked again after each change on the screen, so a generous limit
        if (await tooManyAttempts(`import-check:${user.id}`, 300, 60 * 60 * 1000)) {
            return NextResponse.json({ ok: false, message: "Too many checks. Please wait a little." }, { status: 429 });
        }

        const upload = await readImportUpload(req, user);
        if ("error" in upload) return upload.error;
        const { rows, mapping, defaults } = upload;
        const organizationId = user.organizationId;
        const seesAll = hasPermission(user, "lead:all");

        const [stages, sources, people, definitions] = await Promise.all([
            prisma.leadStage.findMany({ where: { organizationId }, orderBy: [{ order: "asc" }, { id: "asc" }] }),
            prisma.leadSource.findMany({ where: { organizationId }, orderBy: [{ order: "asc" }, { id: "asc" }] }),
            prisma.user.findMany({ where: { organizationId }, select: { id: true, name: true, email: true }, orderBy: { name: "asc" } }),
            prisma.customFieldDefinition.findMany({
                where: { organizationId, entity: "lead", key: { in: Object.values(mapping).filter((field) => field.startsWith("cf:")).map((field) => field.slice(3)) } },
            }),
        ]);
        const reader = rowReader({ mapping, defaults, stages, sources, people, definitions, seesAll, userId: user.id });
        const { cell } = reader;

        // the open leads the file's people already are, looked up a thousand at a time
        const keys = rows.map((row) => matchKeys({ email: cell(row, "email"), phone: cell(row, "phone") }));
        const byPhone = new Map<string, string>();
        const byEmail = new Map<string, string>();
        for (let start = 0; start < keys.length; start += KEY_CHUNK) {
            const chunk = keys.slice(start, start + KEY_CHUNK);
            const open = await prisma.lead.findMany({
                where: {
                    organizationId,
                    stage: { isConverted: false, isLost: false },
                    OR: [{ phoneKey: { in: chunk.flatMap((key) => (key.phoneKey ? [key.phoneKey] : [])) } }, { emailKey: { in: chunk.flatMap((key) => (key.emailKey ? [key.emailKey] : [])) } }],
                },
                select: { phoneKey: true, emailKey: true, name: true },
            });
            for (const lead of open) {
                if (lead.phoneKey) byPhone.set(lead.phoneKey, lead.name);
                if (lead.emailKey) byEmail.set(lead.emailKey, lead.name);
            }
        }
        const openLead = (key: { phoneKey: string | null; emailKey: string | null }) => {
            const name = (key.phoneKey && byPhone.get(key.phoneKey)) || (key.emailKey && byEmail.get(key.emailKey));
            return name ? { name } : undefined;
        };

        // every row, as the import would take it
        let willAdd = 0;
        const seenInFile = new Set<string>();
        const skipped = { alreadyLeads: 0, inFile: 0, samples: [] as { line: number; name: string; reason: string }[] };
        const problems = new Map<string, { code: ProblemCode; field: string; label: string; message: string; count: number; lines: number[]; samples: { line: number; name: string; value: string }[] }>();

        rows.forEach((row, index) => {
            // the line in the file: its header is line 1
            const line = index + 2;
            const result = reader.read(row);
            if (!result.ok) {
                const { problem } = result;
                const group = `${problem.code}|${problem.field}`;
                const entry = problems.get(group) ?? { code: problem.code, field: problem.field, label: problem.label, message: problem.message, count: 0, lines: [], samples: [] };
                entry.count += 1;
                entry.lines.push(line);
                if (entry.samples.length < SAMPLES) entry.samples.push({ line, name: cell(row, "name"), value: problem.value });
                problems.set(group, entry);
                return;
            }
            const duplicate = duplicateOf(result.lead, openLead, seenInFile);
            if (duplicate) {
                if (duplicate.startsWith("Already")) skipped.alreadyLeads += 1;
                else skipped.inFile += 1;
                if (skipped.samples.length < SAMPLES) skipped.samples.push({ line, name: result.lead.name, reason: duplicate });
                return;
            }
            willAdd += 1;
        });

        // The values in the matched columns that match nothing in Flash, most rows first, with what
        // each can become. Counted from the cells themselves, so a value already matched stays listed.
        const tally = (field: string, matches: (text: string) => boolean) => {
            const counts = new Map<string, number>();
            for (const row of rows) {
                const text = cell(row, field);
                if (text && !matches(text)) counts.set(text, (counts.get(text) ?? 0) + 1);
            }
            return [...counts].sort((a, b) => b[1] - a[1]).map(([value, count]) => ({ value, count }));
        };
        const teammates = people.map((person) => ({ value: String(person.id), label: person.name }));
        const values = [
            ...(seesAll && reader.columnOf("owner")
                ? [{ field: "owner", label: "Assigned to", column: reader.columnOf("owner")!, kind: "id" as const, empty: "Nobody (unassigned)", options: teammates, items: tally("owner", reader.matches.owner) }]
                : []),
            ...(reader.columnOf("stage")
                ? [{ field: "stage", label: "Stage", column: reader.columnOf("stage")!, kind: "id" as const, empty: null, options: stages.map((stage) => ({ value: String(stage.id), label: stage.name })), items: tally("stage", reader.matches.stage) }]
                : []),
            ...(reader.columnOf("source")
                ? [{ field: "source", label: "Source", column: reader.columnOf("source")!, kind: "id" as const, empty: "No source", options: sources.map((source) => ({ value: String(source.id), label: source.name })), items: tally("source", reader.matches.source) }]
                : []),
            ...definitions
                .filter((definition) => definition.type === "AGENT" || definition.type === "SELECT")
                .map((definition) => ({
                    field: `cf:${definition.key}`,
                    label: definition.label,
                    column: reader.columnOf(`cf:${definition.key}`)!,
                    // a teammate's id, or the option itself
                    kind: definition.type === "AGENT" ? ("id" as const) : ("option" as const),
                    empty: "Leave empty",
                    options: definition.type === "AGENT" ? teammates : ((definition.options as string[] | null) ?? []).map((option) => ({ value: option, label: option })),
                    items: tally(`cf:${definition.key}`, (text) => reader.matches.custom(definition, text)),
                })),
        ].filter((field) => field.items.length > 0);

        return NextResponse.json({
            ok: true,
            data: {
                total: rows.length,
                willAdd,
                skipped,
                // most rows first; then rows that can't be saved, then the ones a choice saves
                problems: [...problems.values()].sort((a, b) => b.count - a.count || ORDER.indexOf(a.code) - ORDER.indexOf(b.code)),
                values,
            },
        });
    } catch (error) {
        return handleRouteError(error, "Check import");
    }
}
