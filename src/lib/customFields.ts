import type { CustomFieldDefinition } from "@/generated/prisma/client";

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
export function validateCustomFieldValues(
    definitions: CustomFieldDefinition[],
    submitted: Record<string, unknown>,
): ValidationResult {
    const errors: CustomFieldErrors = {};
    const data: Record<string, unknown> = {};

    for (const def of definitions) {
        const raw = submitted[def.key];
        const isEmpty = raw === undefined || raw === null || raw === "";

        if (isEmpty) {
            if (def.required) errors[def.key] = `${def.label} is required`;
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
