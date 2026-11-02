import { Prisma, type CustomFieldDefinition } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";

// Bulk edit: sets the same custom-field values on many records in one statement. Each
// record keeps its other custom fields, since jsonb's || merges the new keys into them.
// The table name comes from this fixed list, never from the request.
export function mergeCustomFieldsSql(
    table: "Lead" | "Deal" | "Contact",
    ids: number[],
    user: { id: number; organizationId: number },
    values: Record<string, unknown>,
) {
    return Prisma.sql`
        UPDATE ${Prisma.raw(`"${table}"`)}
        SET "customFields" = COALESCE("customFields", '{}'::jsonb) || ${JSON.stringify(values)}::jsonb,
            "updatedAt" = NOW(),
            "updatedById" = ${user.id}
        WHERE "id" = ANY(${ids}) AND "organizationId" = ${user.organizationId}`;
}

export interface CustomFieldErrors {
    [key: string]: string;
}

type ValidationResult =
    | { ok: true; data: Record<string, unknown> }
    | { ok: false; errors: CustomFieldErrors };

// Checks submitted custom-field values against this entity's definitions:
// required fields are present, types match, SELECT values are one of the
// offered options. Unknown keys (fields that don't exist, or belong to a
// different entity) are silently dropped rather than stored as junk.
//
// `partial` is for edits (inline, or bulk) that send only the fields being changed:
// fields that weren't sent are left alone, and one sent empty is cleared (saved as null).
export function validateCustomFieldValues(
    definitions: CustomFieldDefinition[],
    submitted: Record<string, unknown>,
    { partial = false }: { partial?: boolean } = {},
): ValidationResult {
    const errors: CustomFieldErrors = {};
    const data: Record<string, unknown> = {};

    for (const def of definitions) {
        if (partial && !(def.key in submitted)) continue;

        const raw = submitted[def.key];
        const isEmpty = raw === undefined || raw === null || raw === "";

        if (isEmpty) {
            if (def.required) errors[def.key] = `${def.label} is required`;
            else if (partial) data[def.key] = null;
            continue;
        }

        switch (def.type) {
            case "TEXT": {
                data[def.key] = String(raw).trim();
                break;
            }
            case "NUMBER":
            case "AGENT": {
                // ponytail: AGENT just stores a user id, not checked against org membership
                const num = Number(raw);
                if (Number.isNaN(num)) errors[def.key] = `${def.label} must be a number`;
                else data[def.key] = num;
                break;
            }
            case "DATE": {
                const date = new Date(raw as string);
                if (Number.isNaN(date.getTime())) errors[def.key] = `${def.label} must be a valid date`;
                else data[def.key] = date.toISOString();
                break;
            }
            case "BOOLEAN": {
                data[def.key] = raw === true || raw === "true";
                break;
            }
            case "SELECT": {
                const options = (def.options as string[] | null) ?? [];
                if (!options.includes(String(raw))) errors[def.key] = `${def.label} must be one of the offered options`;
                else data[def.key] = raw;
                break;
            }
        }
    }

    if (Object.keys(errors).length > 0) {
        return { ok: false, errors };
    }

    return { ok: true, data };
}

// Checks an edit's custom fields (just the ones being changed) against this organization's
// definitions for the entity; used by bulk edit
export async function validateCustomFieldEdit(organizationId: number, entity: "lead" | "deal" | "contact", submitted: Record<string, unknown>) {
    const definitions = await prisma.customFieldDefinition.findMany({ where: { organizationId, entity } });
    return validateCustomFieldValues(definitions, submitted, { partial: true });
}
