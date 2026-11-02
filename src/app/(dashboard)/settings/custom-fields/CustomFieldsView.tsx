"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { IconPlus, IconTrash } from "@tabler/icons-react";

import { api, errorMessage } from "@/lib/api/client";
import { SectionIcon } from "@/components/SectionIcon";
import { Pill } from "@/components/Pill";
import { SidePanel } from "@/components/SidePanel";
import { ConfirmDeleteModal } from "@/components/ListPage";
import { ErrorState } from "@/components/ErrorState";
import { PageLoader, Spinner } from "@/components/Loader";
import { toast } from "@/components/Toast";
import { Select } from "@/components/Select";
import { groupCustomFields, useCustomFields, type CustomFieldDef, type CustomFieldType } from "../../shared/customFields";

const TYPE_LABELS: Record<CustomFieldType, string> = {
    TEXT: "Text",
    NUMBER: "Number",
    DATE: "Date",
    SELECT: "Select",
    BOOLEAN: "Yes / No",
    AGENT: "Agent",
};

const ENTITIES: { value: "lead" | "deal" | "contact"; label: string; noun: string }[] = [
    { value: "lead", label: "Leads", noun: "lead" },
    { value: "deal", label: "Deals", noun: "deal" },
    { value: "contact", label: "Contacts", noun: "contact" },
];

export default function CustomFieldsView() {
    const queryClient = useQueryClient();
    const [entity, setEntity] = useState<"lead" | "deal" | "contact">("lead");
    const [editing, setEditing] = useState<CustomFieldDef | "new" | null>(null);
    const [deleting, setDeleting] = useState<CustomFieldDef | null>(null);

    const fieldsQuery = useCustomFields(entity);
    const current = ENTITIES.find((item) => item.value === entity)!;

    const remove = useMutation({
        mutationFn: (id: number) => api.delete(`/custom-fields/${id}`),
        onSuccess: () => {
            toast.success("Custom field deleted");
            setDeleting(null);
            queryClient.invalidateQueries({ queryKey: ["customFields", entity] });
        },
        onError: (error) => toast.error(errorMessage(error)),
    });

    return (
        <div className="flex h-full flex-col">
            <header className="flex h-12 shrink-0 items-center gap-2 border-b border-line bg-paper px-3">
                <SectionIcon section="customFields" size="md" />
                <h1 className="font-display text-[15px] font-semibold tracking-[-0.01em]">Custom Fields</h1>
                {fieldsQuery.data && <span className="text-faint">{fieldsQuery.data.length}</span>}

                <button
                    onClick={() => setEditing("new")}
                    className="ml-auto flex h-6 items-center gap-1 rounded-lg bg-accent px-2 font-medium text-on-accent hover:bg-accent-hover"
                >
                    <IconPlus size={14} />
                    New field
                </button>
            </header>

            <div className="flex h-10 shrink-0 items-center gap-1 border-b border-line-light px-3">
                {ENTITIES.map((item) => (
                    <button
                        key={item.value}
                        onClick={() => setEntity(item.value)}
                        className={`flex h-7 items-center rounded-lg px-2.5 font-medium ${item.value === entity ? "bg-fill text-ink" : "text-muted hover:bg-app"
                            }`}
                    >
                        {item.label}
                    </button>
                ))}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
                <div className="mx-auto max-w-3xl px-6 py-8">
                    <div className="flex items-start gap-4">
                        <SectionIcon section="customFields" size="lg" />
                        <div className="min-w-0 pt-0.5">
                            <h2 className="text-[17px] leading-6 font-semibold tracking-[-0.01em]">{current.label} fields</h2>
                            <p className="mt-0.5 text-muted">
                            Extra fields for {current.noun}s. Each one can show on the New {current.label.slice(0, -1)} form, as a table column, and as a filter.
                        </p>
                        </div>
                    </div>

                    {fieldsQuery.isPending && <PageLoader label="Loading custom fields" />}
                    {fieldsQuery.isError && (
                        <ErrorState
                            title="Couldn't load custom fields"
                            error={fieldsQuery.error}
                            onRetry={() => fieldsQuery.refetch()}
                            retrying={fieldsQuery.isFetching}
                        />
                    )}

                    {fieldsQuery.data && fieldsQuery.data.length > 0 && (
                        <div className="mt-6 space-y-5">
                            {groupCustomFields(fieldsQuery.data).map(({ group, fields }) => (
                                <div key={group}>
                                    <p className="mb-1.5 px-1 text-xs font-semibold tracking-wide text-faint uppercase">{group}</p>
                                    <ul className="overflow-hidden rounded-lg border border-line">
                                        {fields.map((field) => (
                                            <li
                                                key={field.id}
                                                className="group flex h-13 items-center gap-3 border-b border-line-light px-4 transition-colors last:border-b-0 hover:bg-paper"
                                            >
                                                <button
                                                    type="button"
                                                    onClick={() => setEditing(field)}
                                                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                                                >
                                                    <span className="truncate font-medium">{field.label}</span>
                                                    <Pill>{TYPE_LABELS[field.type]}</Pill>
                                                    {field.required && (
                                                        <Pill tone="amber">Required</Pill>
                                                    )}
                                                </button>
                                                <button
                                                    type="button"
                                                    aria-label={`Delete ${field.label}`}
                                                    onClick={() => setDeleting(field)}
                                                    className="flex size-7 items-center justify-center rounded-lg text-light transition-colors group-hover:text-muted hover:bg-danger-soft hover:text-danger!"
                                                >
                                                    <IconTrash size={14} />
                                                </button>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            ))}
                        </div>
                    )}
                    {fieldsQuery.data?.length === 0 && (
                        <p className="mt-6 rounded-lg border border-line px-3 py-6 text-center text-faint">No custom fields yet</p>
                    )}
                </div>
            </div>

            <SidePanel open={editing !== null} onClose={() => setEditing(null)}>
                {editing && (
                    <CustomFieldForm entity={entity} field={editing === "new" ? null : editing} onDone={() => setEditing(null)} />
                )}
            </SidePanel>

            <ConfirmDeleteModal
                open={deleting !== null}
                title={`Delete ${deleting?.label}?`}
                description="Values already saved under this field stay on each record, just hidden."
                pending={remove.isPending}
                onCancel={() => setDeleting(null)}
                onConfirm={() => deleting && remove.mutate(deleting.id)}
            />
        </div>
    );
}

// a-z0-9_ only, starting with a letter — mirrors the server's own rule
function slugify(label: string) {
    const key = label
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "");
    return key && /^[a-z]/.test(key) ? key : `field_${key}`;
}

function CustomFieldForm({
    entity,
    field,
    onDone,
}: {
    entity: "lead" | "deal" | "contact";
    field: CustomFieldDef | null;
    onDone: () => void;
}) {
    const queryClient = useQueryClient();
    const [label, setLabel] = useState(field?.label ?? "");
    const [key, setKey] = useState(field?.key ?? "");
    const [keyEdited, setKeyEdited] = useState(false);
    const [type, setType] = useState<CustomFieldType>(field?.type ?? "TEXT");
    const [optionsText, setOptionsText] = useState((field?.options ?? []).join("\n"));
    const [group, setGroup] = useState(field?.group ?? "");
    const [required, setRequired] = useState(field?.required ?? false);
    const [showInFilter, setShowInFilter] = useState(field?.showInFilter ?? false);
    const [showInList, setShowInList] = useState(field?.showInList ?? false);

    const save = useMutation({
        mutationFn: (): Promise<unknown> => {
            const options = type === "SELECT"
                ? optionsText.split("\n").map((option) => option.trim()).filter(Boolean)
                : undefined;

            const groupValue = group.trim() || undefined;

            if (field) {
                return api.patch(`/custom-fields/${field.id}`, { label, type, options, group: groupValue, required, showInFilter, showInList });
            }

            return api.post("/custom-fields", {
                entity,
                key: key || slugify(label),
                label,
                type,
                options,
                group: groupValue,
                required,
                showInFilter,
                showInList,
            });
        },
        onSuccess: () => {
            toast.success(field ? "Custom field updated" : "Custom field created");
            queryClient.invalidateQueries({ queryKey: ["customFields", entity] });
            onDone();
        },
    });

    return (
        <form
            onSubmit={(e) => {
                e.preventDefault();
                save.mutate();
            }}
        >
            <h2 className="border-b border-line-light px-5 py-4 text-lg font-semibold">
                {field ? "Edit field" : "New field"}
            </h2>

            <div className="space-y-3 px-5 py-4">
                <div>
                    <label htmlFor="field-label" className="mb-1 block text-sm font-medium text-muted">
                        Label
                    </label>
                    <input
                        id="field-label"
                        autoFocus
                        required
                        value={label}
                        onChange={(e) => {
                            setLabel(e.target.value);
                            if (!keyEdited) setKey(slugify(e.target.value));
                        }}
                        placeholder="Budget range"
                        className="h-8 w-full rounded-lg border border-line px-2 outline-none placeholder:text-light focus:border-accent focus:ring-3 focus:ring-accent-soft"
                    />
                </div>

                {!field && (
                    <div>
                        <label htmlFor="field-key" className="mb-1 block text-sm font-medium text-muted">
                            Key
                        </label>
                        <input
                            id="field-key"
                            required
                            value={key}
                            onChange={(e) => {
                                setKey(e.target.value);
                                setKeyEdited(true);
                            }}
                            placeholder="budget_range"
                            pattern="^[a-z][a-z0-9_]*$"
                            className="h-8 w-full rounded-lg border border-line px-2 font-mono text-sm outline-none placeholder:text-light focus:border-accent focus:ring-3 focus:ring-accent-soft"
                        />
                        <p className="mt-1 text-sm text-faint">How this field is stored internally. Can&apos;t be changed later.</p>
                    </div>
                )}

                <div>
                    <p className="mb-1 block text-sm font-medium text-muted">Type</p>
                    <Select
                        value={type}
                        onChange={(value) => value && setType(value as CustomFieldType)}
                        placeholder="Pick a type"
                        options={[
                            { value: "TEXT", label: "Text" },
                            { value: "NUMBER", label: "Number" },
                            { value: "DATE", label: "Date" },
                            { value: "SELECT", label: "Select" },
                            { value: "BOOLEAN", label: "Yes / No" },
                            { value: "AGENT", label: "Agent" },
                        ]}
                    />
                    {field && (
                        <p className="mt-1 text-sm text-faint">
                            Changing the type doesn&apos;t convert values already saved under the old type.
                        </p>
                    )}
                </div>

                {type === "SELECT" && (
                    <div>
                        <label htmlFor="field-options" className="mb-1 block text-sm font-medium text-muted">
                            Options (one per line)
                        </label>
                        <textarea
                            id="field-options"
                            rows={4}
                            value={optionsText}
                            onChange={(e) => setOptionsText(e.target.value)}
                            placeholder={"Small\nMedium\nLarge"}
                            className="w-full rounded-lg border border-line px-2 py-1.5 outline-none placeholder:text-light focus:border-accent focus:ring-3 focus:ring-accent-soft"
                        />
                    </div>
                )}

                <div>
                    <label htmlFor="field-group" className="mb-1 block text-sm font-medium text-muted">
                        Group
                    </label>
                    <input
                        id="field-group"
                        value={group}
                        onChange={(e) => setGroup(e.target.value)}
                        placeholder="e.g. Qualification"
                        className="h-8 w-full rounded-lg border border-line px-2 outline-none placeholder:text-light focus:border-accent focus:ring-3 focus:ring-accent-soft"
                    />
                    <p className="mt-1 text-sm text-faint">Fields sharing a group cluster under one heading on the form. Leave blank for &quot;Other&quot;.</p>
                </div>

                <div className="space-y-2 rounded-lg border border-line-light p-3">
                    <label className="flex items-center gap-2">
                        <input
                            type="checkbox"
                            checked={required}
                            onChange={(e) => setRequired(e.target.checked)}
                            className="size-3.5 accent-accent"
                        />
                        Required
                    </label>
                    <label className="flex items-center gap-2">
                        <input
                            type="checkbox"
                            checked={showInFilter}
                            onChange={(e) => setShowInFilter(e.target.checked)}
                            className="size-3.5 accent-accent"
                        />
                        Show in filter
                    </label>
                    <label className="flex items-center gap-2">
                        <input
                            type="checkbox"
                            checked={showInList}
                            onChange={(e) => setShowInList(e.target.checked)}
                            className="size-3.5 accent-accent"
                        />
                        Show in list
                    </label>
                </div>

                {save.isError && (
                    <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-danger">
                        {errorMessage(save.error)}
                    </p>
                )}
            </div>

            <div className="flex justify-end gap-2 border-t border-line-light px-5 py-3">
                <button
                    type="button"
                    onClick={onDone}
                    className="h-8 rounded-lg border border-fill bg-black/2 px-3 font-medium text-muted hover:bg-app"
                >
                    Cancel
                </button>
                <button
                    type="submit"
                    disabled={save.isPending}
                    className="flex h-8 items-center gap-1.5 rounded-lg bg-accent px-3 font-medium text-on-accent hover:bg-accent-hover disabled:opacity-60"
                >
                    {save.isPending && <Spinner size={14} />}
                    {field ? "Save" : "Create field"}
                </button>
            </div>
        </form>
    );
}
