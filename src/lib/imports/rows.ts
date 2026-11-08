import type { CustomFieldDefinition, LeadStage, LeadSource } from "@/generated/prisma/client";
import { validateCustomFieldValues } from "@/lib/settings/customFields";
import { isOpen, matchKeys } from "@/lib/leads/duplicates";
import { createLeadSchema } from "@/lib/validations/leads";
import type { ImportDefaults } from "@/lib/validations/imports";

/*
 * One CSV row → one lead, or the reason it can't be one. Used twice with the same rules: by the
 * import screen's check (/api/imports/check), which reads every row first and shows what would
 * happen, and by the import itself (leadImport.ts). So what the check says is what the import does.
 *
 * The import screen's fixes come in `defaults`:
 *  - values: what a value that matches nothing in Flash becomes ("Hot" → the stage "Hot lead",
 *    "Rahul K" → a teammate, a dropdown value → one of its options), per field; null = leave empty
 *  - fixes.nameFromPhone: a row without a name uses its phone number as the name
 *  - fixes.leaveEmpty: fields whose bad values are left out, keeping the row ("email", "cf:budget")
 */

export type Row = Record<string, string>;

// One row's own fields, from the columns mapped to them
const rowSchema = createLeadSchema.pick({ name: true, email: true, phone: true, companyName: true });

export const lower = (text: string | undefined) => text?.trim().toLowerCase() ?? "";

export type ProblemCode = "missing-phone" | "bad-phone" | "missing-name" | "bad-name" | "bad-email" | "unknown-value" | "bad-value";

export interface Problem {
    code: ProblemCode;
    // "phone", "email", "cf:budget"...
    field: string;
    label: string;
    // what the cell said
    value: string;
    message: string;
}

export interface ImportSetup {
    mapping: Record<string, string>;
    defaults: ImportDefaults;
    stages: LeadStage[];
    sources: LeadSource[];
    people: { id: number; name: string; email: string }[];
    definitions: CustomFieldDefinition[];
    // may give leads to others (lead:all); without it every lead is the importer's
    seesAll: boolean;
    userId: number;
}

export function rowReader(setup: ImportSetup) {
    const { mapping, defaults, stages, sources, people, definitions, seesAll, userId } = setup;
    const values = defaults.values ?? {};
    const leaveEmpty = new Set(defaults.fixes?.leaveEmpty ?? []);

    const columnOf = (field: string) => Object.keys(mapping).find((column) => mapping[column] === field);
    const cell = (row: Row, field: string) => {
        const column = columnOf(field);
        // a ' an export put before a value so Excel wouldn't run it as a formula isn't part of it
        return column ? (row[column] ?? "").trim().replace(/^'(?=[=+\-@])/, "") : "";
    };
    // a teammate written in a cell: their email or their name, any case
    const personCalled = (text: string) => people.find((person) => lower(person.email) === lower(text) || lower(person.name) === lower(text));
    // what the screen matched this value to: { to } (null = leave empty), or undefined if nothing.
    // Only this workspace's own stages, sources, teammates and options count; anything else in the
    // settings (sent by hand, or since deleted) is ignored, as if nothing was chosen.
    const valid = {
        owner: (to: unknown) => to === null || people.some((person) => person.id === to),
        stage: (to: unknown) => stages.some((stage) => stage.id === to),
        source: (to: unknown) => to === null || sources.some((source) => source.id === to),
    };
    const chosen = (field: string, text: string, isValid: (to: unknown) => boolean) => {
        const map = values[field];
        return map && lower(text) in map && isValid(map[lower(text)]) ? { to: map[lower(text)] } : undefined;
    };

    const defaultStage = stages.find((stage) => stage.id === defaults.stageId) ?? stages.find(isOpen) ?? stages[0];
    if (!defaultStage) throw new Error("This workspace has no lead stages");
    const defaultOwner = defaults.ownerId === undefined ? userId : defaults.ownerId;

    // The value of each "match the values" field as Flash sees it: matched (or chosen), or not
    const matches = {
        owner: (text: string) => Boolean(personCalled(text)),
        stage: (text: string) => stages.some((stage) => lower(stage.name) === lower(text)),
        source: (text: string) => sources.some((source) => lower(source.name) === lower(text)),
        custom: (definition: CustomFieldDefinition, text: string) =>
            definition.type === "AGENT" ? Boolean(personCalled(text)) : ((definition.options as string[] | null) ?? []).some((option) => lower(option) === lower(text)),
    };

    function read(row: Row): { ok: true; lead: ReturnType<typeof leadFrom> } | { ok: false; problem: Problem } {
        const fail = (code: ProblemCode, field: string, label: string, value: string, message: string) => ({ ok: false as const, problem: { code, field, label, value, message } });

        const phone = cell(row, "phone");
        if (!phone) return fail("missing-phone", "phone", "Phone", "", "Phone is missing");
        let name = cell(row, "name");
        if (!name) {
            if (!defaults.fixes?.nameFromPhone) return fail("missing-name", "name", "Name", "", "Name is missing");
            name = phone;
        }

        let email: string | null = cell(row, "email") || null;
        const parse = () => rowSchema.safeParse({ name, email, phone, companyName: cell(row, "company") || null });
        let basics = parse();
        // a bad email, when the screen said to import without it
        if (!basics.success && leaveEmpty.has("email") && basics.error.issues.some((issue) => issue.path[0] === "email")) {
            email = null;
            basics = parse();
        }
        if (!basics.success) {
            const issue = basics.error.issues[0];
            const field = String(issue.path[0]);
            const label = field === "phone" ? "Phone" : field === "email" ? "Email" : field === "companyName" ? "Company" : "Name";
            const code = field === "phone" ? "bad-phone" : field === "email" ? "bad-email" : "bad-name";
            return fail(code, field, label, cell(row, field === "companyName" ? "company" : field), `${label}: ${issue.message}`);
        }

        // custom fields: checked by type, never required here (an empty cell just stays empty)
        const customFields: Record<string, unknown> = {};
        for (const definition of definitions) {
            const field = `cf:${definition.key}`;
            const text = cell(row, field);
            if (!text) continue;

            let value: unknown = text;
            if (definition.type === "AGENT" || definition.type === "SELECT") {
                // a teammate by name or email, or one of the options in any case; else what the screen chose
                const option = ((definition.options as string[] | null) ?? []).find((item) => lower(item) === lower(text));
                const person = definition.type === "AGENT" ? personCalled(text) : undefined;
                const options = (definition.options as string[] | null) ?? [];
                const choice = chosen(field, text, (to) => to === null || (definition.type === "AGENT" ? valid.owner(to) : options.includes(String(to))));
                if (person || option) value = person ? person.id : option;
                else if (choice) {
                    if (choice.to === null) continue;
                    value = choice.to;
                } else {
                    const why = definition.type === "AGENT" ? `no teammate called "${text}"` : `"${text}" isn't one of its options`;
                    return fail("unknown-value", field, definition.label, text, `${definition.label}: ${why}`);
                }
            } else if (definition.type === "BOOLEAN") {
                value = ["yes", "true", "1", "y"].includes(lower(text));
            }

            const checked = validateCustomFieldValues([{ ...definition, required: false }], { [definition.key]: value }, { partial: true });
            if (!checked.ok) {
                if (leaveEmpty.has(field)) continue;
                return fail("bad-value", field, definition.label, text, Object.values(checked.errors)[0]);
            }
            Object.assign(customFields, checked.data);
        }

        return { ok: true, lead: leadFrom(row, basics.data, customFields) };
    }

    function leadFrom(row: Row, basics: { name: string; email?: string | null; phone: string; companyName?: string | null }, customFields: Record<string, unknown>) {
        // Each one: its own match in Flash; else what the screen matched that value to; else the default
        const stageCell = cell(row, "stage");
        const stageChoice = chosen("stage", stageCell, valid.stage);
        const stage = stages.find((item) => lower(item.name) === lower(stageCell)) ?? stages.find((item) => item.id === stageChoice?.to) ?? defaultStage;

        const sourceCell = cell(row, "source");
        const source = sources.find((item) => lower(item.name) === lower(sourceCell));
        const sourceChoice = chosen("source", sourceCell, valid.source);
        const sourceId = source ? source.id : sourceChoice ? (sourceChoice.to as number | null) : (defaults.sourceId ?? null);

        // without lead:all, everything you import is yours (as when you add a lead by hand)
        const ownerCell = cell(row, "owner");
        const ownerChoice = chosen("owner", ownerCell, valid.owner);
        const named = ownerCell ? personCalled(ownerCell) : undefined;
        const ownerId = !seesAll ? userId : named ? named.id : ownerChoice ? (ownerChoice.to as number | null) : defaultOwner;

        return {
            name: basics.name,
            email: basics.email ?? null,
            phone: basics.phone,
            companyName: basics.companyName ?? null,
            campaign: cell(row, "campaign").slice(0, 150) || null,
            note: cell(row, "note"),
            stage,
            sourceId,
            ownerId,
            customFields,
            keys: matchKeys({ email: basics.email ?? "", phone: basics.phone }),
        };
    }

    return { read, cell, matches, columnOf, defaultStage };
}

export type RowReader = ReturnType<typeof rowReader>;

/**
 * One open lead per person: someone already being worked on isn't added again, nor someone twice
 * in the file. `openLead` finds an open lead by the person's phone or email. Adds the person to
 * `seenInFile` when they'll be added.
 */
export function duplicateOf(
    lead: { stage: LeadStage; keys: { phoneKey: string | null; emailKey: string | null } },
    openLead: (keys: { phoneKey: string | null; emailKey: string | null }) => { name: string } | undefined,
    seenInFile: Set<string>,
) {
    if (!isOpen(lead.stage)) return null;
    const { phoneKey, emailKey } = lead.keys;
    const already = openLead(lead.keys);
    if (already) return `Already a lead: ${already.name}`;
    if ([phoneKey, emailKey].some((key) => key && seenInFile.has(key))) return "Appears earlier in this file";
    for (const key of [phoneKey, emailKey]) if (key) seenInFile.add(key);
    return null;
}
