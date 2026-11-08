import type { CustomFieldDefinition } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";

/*
 * Activity history: every edit to a lead, deal or contact leaves a line on its timeline, like
 * "changed Amount from ₹1,00,000 to ₹80,000", with who and when (the timeline entry's user and
 * time). The edit routes compare the record before and after (fieldChanges, customFieldHistory)
 * and save historyRows(); bulk edits save bulkHistoryRows(). Stage moves and assignments already
 * write entries of their own.
 */

export interface Change {
    field: string;
    label: string;
    from: string | null;
    to: string | null;
}

type Definition = Pick<CustomFieldDefinition, "key" | "label" | "type">;

/**
 * The fields that changed between `before` and `after`, each a plain record of what people see
 * (a source's name, money in the workspace's currency). `labels` names the fields to compare.
 */
export function fieldChanges(before: Record<string, unknown>, after: Record<string, unknown>, labels: Record<string, string>): Change[] {
    return Object.entries(labels).flatMap(([field, label]) => {
        const from = shown(text(before[field]));
        const to = shown(text(after[field]));
        return from === to ? [] : [{ field, label, from, to }];
    });
}

// The custom fields an edit touched (`submitted`), compared with what they were
export async function customFieldHistory(organizationId: number, definitions: Definition[], before: unknown, submitted: Record<string, unknown>): Promise<Change[]> {
    const old = (before ?? {}) as Record<string, unknown>;
    const show = await customFieldReader(organizationId, definitions, [old, submitted]);
    return definitions
        .filter((definition) => definition.key in submitted)
        .flatMap((definition) => {
            const from = shown(show(definition, old[definition.key]));
            const to = shown(show(definition, submitted[definition.key]));
            return from === to ? [] : [{ field: `cf:${definition.key}`, label: definition.label, from, to }];
        });
}

// The custom fields a bulk edit sets, as people see them
export async function customFieldBulkValues(organizationId: number, entity: string, submitted: Record<string, unknown>) {
    const definitions = await prisma.customFieldDefinition.findMany({
        where: { organizationId, entity, key: { in: Object.keys(submitted) } },
        select: { key: true, label: true, type: true },
    });
    const show = await customFieldReader(organizationId, definitions, [submitted]);
    return definitions.map((definition) => ({ field: `cf:${definition.key}`, label: definition.label, to: show(definition, submitted[definition.key]) }));
}

// The words on the timeline
export function changeMessage(change: Change) {
    if (change.from === null) return `set ${change.label} to ${change.to}`;
    if (change.to === null) return `cleared ${change.label} (was ${change.from})`;
    return `changed ${change.label} from ${change.from} to ${change.to}`;
}

// Timeline entries for these changes, by this person; the change itself is kept in metadata too
export function historyRows(changes: Change[], userId: number) {
    return changes.map((change) => ({
        userId,
        type: "UPDATED",
        message: changeMessage(change),
        metadata: { field: change.field, from: change.from, to: change.to },
    }));
}

/**
 * A bulk edit: the same new value on every selected record. Their old values aren't looked up
 * (it could be hundreds), so each entry says what it became.
 */
export function bulkHistoryRows(values: { field: string; label: string; to: string | null }[], userId: number) {
    return values.map((value) => {
        const to = shown(text(value.to));
        return {
            userId,
            type: "UPDATED",
            message: to === null ? `cleared ${value.label} (bulk edit)` : `set ${value.label} to ${to} (bulk edit)`,
            metadata: { field: value.field, from: null, to },
        };
    });
}

// How a custom field's value reads: Yes/No, a date's day, a teammate's name (looked up for the
// "team member" fields among `values`), a list joined
async function customFieldReader(organizationId: number, definitions: Definition[], values: Record<string, unknown>[]) {
    const ids = definitions
        .filter((definition) => definition.type === "AGENT")
        .flatMap((definition) => values.map((record) => Number(record[definition.key])))
        .filter((id) => Number.isInteger(id) && id > 0);
    const people = ids.length ? await prisma.user.findMany({ where: { organizationId, id: { in: ids } }, select: { id: true, name: true } }) : [];
    const names = new Map(people.map((person) => [person.id, person.name]));

    return (definition: Definition, value: unknown) => {
        if (value === null || value === undefined || value === "") return null;
        if (definition.type === "BOOLEAN") return value ? "Yes" : "No";
        if (definition.type === "DATE") return String(value).slice(0, 10);
        if (definition.type === "AGENT") return names.get(Number(value)) ?? "a former teammate";
        return text(value);
    };
}

// Long text (a description) is cut short; the record itself has the whole of it
function shown(value: string | null) {
    return value && value.length > 80 ? `${value.slice(0, 77)}...` : value;
}

function text(value: unknown): string | null {
    if (value === null || value === undefined || value === "") return null;
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    if (Array.isArray(value)) return value.length ? value.join(", ") : null;
    return String(value);
}
