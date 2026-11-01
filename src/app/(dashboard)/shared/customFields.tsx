"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Controller, type Control, type UseFormRegister } from "react-hook-form";
import { useQuery } from "@tanstack/react-query";
import { IconSettings } from "@tabler/icons-react";

import { api } from "@/lib/api/client";
import { Select } from "@/components/Select";
import { controlClassName, renderSelectControl, type FilterFieldDef } from "@/components/FilterPanel";
import { formatDate } from "@/lib/format";
import { FormFieldRow, FormSection } from "./FullPageForm";

export type CustomFieldType = "TEXT" | "NUMBER" | "DATE" | "SELECT" | "BOOLEAN" | "AGENT";

// Is a custom field being saved with the value it already has? null, undefined and
// "not set" all count as the same empty value.
export function isSameFieldValue(next: unknown, current: unknown) {
    return (next ?? null) === (current ?? null);
}

export interface AgentOption {
    id: number;
    name: string;
}

export interface CustomFieldDef {
    id: number;
    entity: string;
    key: string;
    label: string;
    type: CustomFieldType;
    options: string[] | null;
    group: string | null;
    required: boolean;
    showInFilter: boolean;
    showInList: boolean;
    order: number;
}

export function useCustomFields(entity: "lead" | "deal" | "contact") {
    return useQuery({
        queryKey: ["customFields", entity],
        queryFn: () =>
            api.get<{ data: CustomFieldDef[] }>("/custom-fields", { params: { entity } }).then((res) => res.data.data),
    });
}

// Clusters fields under their group heading, in order of first appearance;
// ungrouped fields fall under "Other" (dropped entirely if nothing's ungrouped).
export function groupCustomFields(fields: CustomFieldDef[]): { group: string; fields: CustomFieldDef[] }[] {
    const groups: { group: string; fields: CustomFieldDef[] }[] = [];

    for (const field of fields) {
        const name = field.group?.trim() || "Other";
        const existing = groups.find((g) => g.group === name);
        if (existing) existing.fields.push(field);
        else groups.push({ group: name, fields: [field] });
    }

    return groups;
}

// ---------------------------------------------------------------------------
// Turns a custom field definition into a FilterFieldDef, for any filters
// shape with an optional `customFields` bag. Reusable once Deals/Contacts
// grow custom fields of their own — nothing here is Leads-specific.
// ---------------------------------------------------------------------------

export function createCustomFilterField<TFilters extends { customFields?: Record<string, unknown> }>(
    def: CustomFieldDef,
    context?: { agents?: AgentOption[] },
): FilterFieldDef<TFilters> {
    function setValue(filters: TFilters, value: unknown): Partial<TFilters> {
        const next = { ...filters.customFields };
        if (value === undefined) delete next[def.key];
        else next[def.key] = value;
        return { customFields: Object.keys(next).length > 0 ? next : undefined } as Partial<TFilters>;
    }

    return {
        // prefixed so a custom field can't collide with a built-in filter's key
        key: `custom_${def.key}`,
        label: def.label,
        isActive: (filters) => filters.customFields?.[def.key] !== undefined,
        clear: (filters) => setValue(filters, undefined),
        renderControl: (filters, onChange) => {
            const value = filters.customFields?.[def.key];
            const commit = (next: unknown) => onChange(setValue(filters, next));

            if (def.type === "SELECT") {
                return renderSelectControl(
                    value as string | undefined,
                    commit,
                    (def.options ?? []).map((option) => ({ value: option, label: option })),
                    `Any ${def.label.toLowerCase()}`,
                );
            }

            if (def.type === "BOOLEAN") {
                return renderSelectControl(
                    value === undefined ? undefined : value ? "true" : "false",
                    (next) => commit(next === undefined ? undefined : next === "true"),
                    [{ value: "true", label: "Yes" }, { value: "false", label: "No" }],
                    "Any",
                );
            }

            if (def.type === "AGENT") {
                return renderSelectControl(
                    value === undefined ? undefined : String(value),
                    (next) => commit(next === undefined ? undefined : Number(next)),
                    (context?.agents ?? []).map((agent) => ({ value: agent.id, label: agent.name })),
                    `Any ${def.label.toLowerCase()}`,
                );
            }

            if (def.type === "NUMBER") {
                return (
                    <input
                        type="number"
                        value={(value as number | string | undefined) ?? ""}
                        onChange={(e) => commit(e.target.value === "" ? undefined : Number(e.target.value))}
                        className={controlClassName}
                    />
                );
            }

            if (def.type === "DATE") {
                return (
                    <input
                        type="date"
                        value={value ? String(value).slice(0, 10) : ""}
                        onChange={(e) => commit(e.target.value || undefined)}
                        className={controlClassName}
                    />
                );
            }

            return <CustomTextControl value={value as string | undefined} onChange={commit} />;
        },
        renderChip: (filters) => {
            const value = filters.customFields?.[def.key];
            if (value === undefined) return null;
            if (def.type === "BOOLEAN") return `${def.label}: ${value ? "Yes" : "No"}`;
            if (def.type === "AGENT") {
                const name = context?.agents?.find((agent) => agent.id === Number(value))?.name ?? "Agent";
                return `${def.label}: ${name}`;
            }
            return `${def.label}: ${String(value)}`;
        },
    };
}

// Commits on blur/Enter rather than every keystroke, same as the built-in
// text filters — avoids refetching the list on every character typed.
function CustomTextControl({ value, onChange }: { value?: string; onChange: (value: string | undefined) => void }) {
    const [draft, setDraft] = useState(value ?? "");

    useEffect(() => setDraft(value ?? ""), [value]);

    return (
        <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => onChange(draft.trim() || undefined)}
            onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
            className={controlClassName}
        />
    );
}

// ---------------------------------------------------------------------------
// Turns a custom field definition into a table column, for any record shape
// that exposes its custom field values.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Renders a record's custom fields as grouped form sections, for any New-X
// dialog built on FullPageForm + react-hook-form. Shared across Lead/Deal/
// Contact rather than copy-pasted a third time.
// ---------------------------------------------------------------------------

const inputClassName =
    "h-8 w-full rounded-lg border border-line bg-surface px-2 outline-none placeholder:text-light focus:border-accent focus:ring-3 focus:ring-accent-soft";

export function CustomFieldsFormSection({
    fields,
    register,
    control,
    agents,
}: {
    fields: CustomFieldDef[];
    register: UseFormRegister<any>;
    control: Control<any>;
    agents?: AgentOption[];
}) {
    if (fields.length === 0) return null;

    return (
        <>
            {groupCustomFields(fields).map(({ group, fields }) => (
                <FormSection key={group} title={group}>
                    {fields.map((field) => (
                        <FormFieldRow key={field.id} icon={IconSettings} label={field.label} required={field.required}>
                            <CustomFieldInput field={field} register={register} control={control} agents={agents} />
                        </FormFieldRow>
                    ))}
                </FormSection>
            ))}
        </>
    );
}

// react-hook-form supports dynamic nested paths like "customFields.budget_range"
// even though the schema only knows `customFields` as a loose record —
// `register`/`control` are typed loosely here rather than fighting that generic.
function CustomFieldInput({
    field,
    register,
    control,
    agents,
}: {
    field: CustomFieldDef;
    register: UseFormRegister<any>;
    control: Control<any>;
    agents?: AgentOption[];
}) {
    const name = `customFields.${field.key}` as const;

    if (field.type === "AGENT") {
        return (
            <Controller
                name={name}
                control={control}
                render={({ field: controllerField }) => (
                    <Select
                        value={controllerField.value === undefined ? undefined : String(controllerField.value)}
                        onChange={(value) => controllerField.onChange(value === undefined ? undefined : Number(value))}
                        placeholder="Select..."
                        options={agents?.map((agent) => ({ value: String(agent.id), label: agent.name })) ?? []}
                    />
                )}
            />
        );
    }

    if (field.type === "SELECT") {
        return (
            <Controller
                name={name}
                control={control}
                render={({ field: controllerField }) => (
                    <Select
                        value={controllerField.value as string | undefined}
                        onChange={controllerField.onChange}
                        placeholder="Select..."
                        options={(field.options ?? []).map((option) => ({ value: option, label: option }))}
                    />
                )}
            />
        );
    }

    if (field.type === "BOOLEAN") {
        return (
            <Controller
                name={name}
                control={control}
                render={({ field: controllerField }) => (
                    <Select
                        value={controllerField.value === undefined ? undefined : controllerField.value ? "true" : "false"}
                        onChange={(value) => controllerField.onChange(value === undefined ? undefined : value === "true")}
                        placeholder="Select..."
                        options={[{ value: "true", label: "Yes" }, { value: "false", label: "No" }]}
                    />
                )}
            />
        );
    }

    if (field.type === "NUMBER") {
        return (
            <input
                type="number"
                required={field.required}
                {...register(name, { setValueAs: (value: string) => (value === "" ? undefined : Number(value)) })}
                className={inputClassName}
            />
        );
    }

    if (field.type === "DATE") {
        return <input type="date" required={field.required} {...register(name)} className={inputClassName} />;
    }

    return <input type="text" required={field.required} {...register(name)} className={inputClassName} />;
}

export function createCustomColumn<TRecord>(
    def: CustomFieldDef,
    getCustomFields: (record: TRecord) => Record<string, unknown> | null,
    context?: { agents?: AgentOption[] },
) {
    return {
        key: `custom_${def.key}`,
        label: def.label,
        icon: IconSettings,
        width: 160,
        cell: (record: TRecord): ReactNode => {
            const value = getCustomFields(record)?.[def.key];
            if (value === undefined || value === null || value === "") return null;
            if (def.type === "BOOLEAN") return value ? "Yes" : "No";
            if (def.type === "DATE") return formatDate(String(value));
            if (def.type === "AGENT") return context?.agents?.find((agent) => agent.id === Number(value))?.name ?? "—";
            return String(value);
        },
    };
}
