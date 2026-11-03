"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { IconArrowDown, IconArrowUp, IconPlus, IconX } from "@tabler/icons-react";

import { api, errorMessage } from "@/lib/api/client";
import { formTexts, type FieldMode, type LeadFormSettings } from "@/lib/validations/leadForms";
import { Spinner } from "@/components/Loader";
import { toast } from "@/components/Toast";
import type { CustomFieldDef } from "../../shared/customFields";

const inputClassName =
    "h-8 w-full rounded-lg border border-line bg-surface px-2 outline-none placeholder:text-light focus:border-accent focus:ring-3 focus:ring-accent-soft";

const MODE_LABELS: Record<FieldMode, string> = { required: "Required", optional: "Optional", hidden: "Off" };

const TYPE_LABELS: Record<string, string> = { TEXT: "Text", NUMBER: "Number", DATE: "Date", SELECT: "Choice", BOOLEAN: "Yes / no" };

// Lead custom fields a public form can ask for: all but Agent (a visitor can't pick one of the team)
export function askableFields(definitions: CustomFieldDef[]) {
    return definitions.filter((definition) => definition.type !== "AGENT");
}

/**
 * The form builder, in the side panel: the page's texts, which built-in fields it asks,
 * and which lead custom fields (answers are saved into those fields on the lead). Saved as
 * one `settings` object; the hosted page, the embed code and the endpoint all follow it.
 * Lives inside a <dialog>, so it uses rows of buttons, never floating dropdowns.
 */
export function FormBuilder({
    formId,
    formName,
    saved,
    definitions,
    onClose,
}: {
    formId: number;
    formName: string;
    saved: LeadFormSettings;
    definitions: CustomFieldDef[];
    onClose: () => void;
}) {
    const queryClient = useQueryClient();
    const [settings, setSettings] = useState(saved);
    const defaults = formTexts({ ...settings, title: "", buttonLabel: "", thankYou: "" }, formName);

    const set = <K extends keyof LeadFormSettings>(key: K, value: LeadFormSettings[K]) => setSettings((current) => ({ ...current, [key]: value }));

    const save = useMutation({
        mutationFn: () => api.patch(`/lead-forms/${formId}`, { settings }),
        onSuccess: () => {
            toast.success("Form saved");
            queryClient.invalidateQueries({ queryKey: ["leadForms"] });
            onClose();
        },
    });

    const askable = askableFields(definitions);
    const added = settings.customFields.flatMap((field) => {
        const definition = askable.find((item) => item.key === field.key);
        return definition ? [{ ...field, definition }] : [];
    });
    const available = askable.filter((definition) => !settings.customFields.some((field) => field.key === definition.key));

    function move(index: number, by: -1 | 1) {
        const next = [...settings.customFields];
        [next[index], next[index + by]] = [next[index + by], next[index]];
        set("customFields", next);
    }

    return (
        <form
            noValidate
            className="flex min-h-full flex-col"
            onSubmit={(event) => {
                event.preventDefault();
                save.mutate();
            }}
        >
            <header className="border-b border-line-light px-5 py-4">
                <h2 className="text-lg font-semibold">Edit form</h2>
                <p className="text-sm text-faint">{formName}</p>
            </header>

            <div className="flex-1 space-y-6 px-5 py-5">
                <Section title="Page">
                    <Labelled label="Title">
                        <input value={settings.title} maxLength={120} placeholder={defaults.title} onChange={(e) => set("title", e.target.value)} className={inputClassName} />
                    </Labelled>
                    <Labelled label="Intro" hint="A line or two under the title, e.g. what happens after they send it">
                        <textarea
                            value={settings.intro}
                            maxLength={500}
                            rows={3}
                            placeholder="Tell us a little about your project and we'll call you back today."
                            onChange={(e) => set("intro", e.target.value)}
                            className={`${inputClassName} h-auto resize-none py-1.5 leading-5`}
                        />
                    </Labelled>
                    <Labelled label="Button">
                        <input value={settings.buttonLabel} maxLength={40} placeholder={defaults.buttonLabel} onChange={(e) => set("buttonLabel", e.target.value)} className={inputClassName} />
                    </Labelled>
                </Section>

                <Section title="Fields">
                    <FixedRow label="Name" />
                    <FixedRow label="Phone" />
                    {(["email", "company", "message"] as const).map((field) => (
                        <div key={field} className="flex h-9 items-center gap-2">
                            <span className="min-w-0 flex-1 text-ink capitalize">{field}</span>
                            <ModeSwitch value={settings[field]} onChange={(mode) => set(field, mode)} />
                        </div>
                    ))}

                    {added.map((field, index) => (
                        <div key={field.key} className="flex h-9 items-center gap-2">
                            <span className="min-w-0 flex-1 truncate text-ink">
                                {field.definition.label}
                                <span className="ml-1.5 text-sm text-faint">{TYPE_LABELS[field.definition.type]}</span>
                            </span>
                            <label className="flex items-center gap-1.5 text-sm text-muted">
                                <input
                                    type="checkbox"
                                    checked={field.required}
                                    onChange={(e) => set("customFields", settings.customFields.map((item) => (item.key === field.key ? { ...item, required: e.target.checked } : item)))}
                                    className="size-3.5 accent-accent"
                                />
                                Required
                            </label>
                            <IconButton label={`Move ${field.definition.label} up`} disabled={index === 0} onClick={() => move(index, -1)}>
                                <IconArrowUp size={14} />
                            </IconButton>
                            <IconButton label={`Move ${field.definition.label} down`} disabled={index === added.length - 1} onClick={() => move(index, 1)}>
                                <IconArrowDown size={14} />
                            </IconButton>
                            <IconButton label={`Remove ${field.definition.label}`} onClick={() => set("customFields", settings.customFields.filter((item) => item.key !== field.key))}>
                                <IconX size={14} />
                            </IconButton>
                        </div>
                    ))}

                    <div className="pt-2">
                        <p className="mb-1.5 text-sm font-medium text-muted">Ask one of your lead fields too</p>
                        {available.length > 0 ? (
                            <div className="flex flex-wrap gap-1.5">
                                {available.map((definition) => (
                                    <button
                                        key={definition.key}
                                        type="button"
                                        onClick={() => set("customFields", [...settings.customFields, { key: definition.key, required: false }])}
                                        className="flex h-7 items-center gap-1 rounded-lg border border-line px-2 text-sm text-muted hover:bg-paper hover:text-ink"
                                    >
                                        <IconPlus size={13} />
                                        {definition.label}
                                    </button>
                                ))}
                            </div>
                        ) : (
                            <p className="text-sm text-faint">
                                {askable.length === 0 ? "You have no lead custom fields yet. " : "All your lead fields are on the form. "}
                                <Link href="/settings/custom-fields" className="text-accent hover:underline">
                                    Add custom fields
                                </Link>{" "}
                                to ask for things like budget or team size; answers are saved on the lead.
                            </p>
                        )}
                    </div>
                </Section>

                <Section title="After sending">
                    <Labelled label="Thank-you message">
                        <input value={settings.thankYou} maxLength={300} placeholder={defaults.thankYou} onChange={(e) => set("thankYou", e.target.value)} className={inputClassName} />
                    </Labelled>
                    <Labelled label="Or send them to a page" hint="Your own thank-you page, e.g. to count conversions for ads. Leave empty to show the message.">
                        <input
                            type="url"
                            value={settings.redirectUrl ?? ""}
                            maxLength={500}
                            placeholder="https://your-site.com/thanks"
                            onChange={(e) => set("redirectUrl", e.target.value || null)}
                            className={inputClassName}
                        />
                    </Labelled>
                </Section>

                {save.isError && (
                    <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-danger">
                        {errorMessage(save.error)}
                    </p>
                )}
            </div>

            <footer className="sticky bottom-0 flex justify-end gap-2 border-t border-line-light bg-surface px-5 py-3">
                <button type="button" onClick={onClose} className="h-8 rounded-lg border border-fill bg-black/2 px-3 font-medium text-muted hover:bg-app">
                    Cancel
                </button>
                <button
                    type="submit"
                    disabled={save.isPending}
                    className="flex h-8 items-center gap-1.5 rounded-lg bg-accent px-3 font-medium text-on-accent hover:bg-accent-hover disabled:opacity-60"
                >
                    {save.isPending && <Spinner size={14} />}
                    Save form
                </button>
            </footer>
        </form>
    );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
    return (
        <section>
            <h3 className="mb-2 text-sm font-semibold tracking-wide text-faint uppercase">{title}</h3>
            <div className="space-y-2.5">{children}</div>
        </section>
    );
}

function Labelled({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
    return (
        <label className="block">
            <span className="mb-1 block text-sm font-medium text-muted">{label}</span>
            {children}
            {hint && <span className="mt-1 block text-sm text-faint">{hint}</span>}
        </label>
    );
}

// Name and phone: every lead and its contact need them
function FixedRow({ label }: { label: string }) {
    return (
        <div className="flex h-9 items-center gap-2">
            <span className="flex-1 text-ink">{label}</span>
            <span className="text-sm text-faint">Always asked</span>
        </div>
    );
}

// Required / Optional / Off, as one row of buttons
function ModeSwitch({ value, onChange }: { value: FieldMode; onChange: (mode: FieldMode) => void }) {
    return (
        <div role="radiogroup" className="flex rounded-lg bg-fill p-0.5">
            {(Object.keys(MODE_LABELS) as FieldMode[]).map((mode) => (
                <button
                    key={mode}
                    type="button"
                    role="radio"
                    aria-checked={value === mode}
                    onClick={() => onChange(mode)}
                    className={`h-6 rounded-md px-2 text-sm font-medium transition-colors ${
                        value === mode ? "bg-surface text-ink shadow-[0_1px_2px_rgb(0_0_0/0.08)]" : "text-muted hover:text-ink"
                    }`}
                >
                    {MODE_LABELS[mode]}
                </button>
            ))}
        </div>
    );
}

function IconButton({ label, disabled, onClick, children }: { label: string; disabled?: boolean; onClick: () => void; children: ReactNode }) {
    return (
        <button
            type="button"
            aria-label={label}
            disabled={disabled}
            onClick={onClick}
            className="flex size-7 items-center justify-center rounded-lg text-faint hover:bg-fill hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent"
        >
            {children}
        </button>
    );
}

/**
 * The same form as plain HTML, for pasting into any website (WordPress, Webflow, Wix...).
 * Built from the form's settings, so it asks exactly what the builder says. Custom field
 * answers are named cf_<key>; the endpoint saves them into those lead fields.
 */
export function embedHtml(endpoint: string, settings: LeadFormSettings, formName: string, definitions: CustomFieldDef[]) {
    const texts = formTexts(settings, formName);
    const req = (mode: FieldMode | boolean) => (mode === "required" || mode === true ? " required" : "");
    const lines = [`<form action="${endpoint}" method="POST">`, `  <input name="name" placeholder="Your name" required>`];

    if (settings.email !== "hidden") lines.push(`  <input name="email" type="email" placeholder="Email"${req(settings.email)}>`);
    lines.push(`  <input name="phone" type="tel" placeholder="Phone" required>`);
    if (settings.company !== "hidden") lines.push(`  <input name="company" placeholder="Company"${req(settings.company)}>`);

    for (const field of settings.customFields) {
        const definition = askableFields(definitions).find((item) => item.key === field.key);
        if (!definition) continue;
        const name = `cf_${definition.key}`;
        if (definition.type === "SELECT") {
            lines.push(`  <select name="${name}"${req(field.required)}>`, `    <option value="">${definition.label}</option>`);
            for (const option of definition.options ?? []) lines.push(`    <option>${option}</option>`);
            lines.push("  </select>");
        } else if (definition.type === "BOOLEAN") {
            lines.push(`  <label><input type="checkbox" name="${name}" value="true"${req(field.required)}> ${definition.label}</label>`);
        } else {
            const type = definition.type === "NUMBER" ? "number" : definition.type === "DATE" ? "date" : "text";
            lines.push(`  <input name="${name}" type="${type}" placeholder="${definition.label}"${req(field.required)}>`);
        }
    }

    if (settings.message !== "hidden") lines.push(`  <textarea name="message" placeholder="How can we help?"${req(settings.message)}></textarea>`);

    lines.push(
        `  <!-- spam trap: leave it hidden and empty -->`,
        `  <input name="website" tabindex="-1" autocomplete="off" style="display:none">`,
    );
    if (!settings.redirectUrl) {
        lines.push(`  <!-- optional: send people to your own page afterwards -->`, `  <!-- <input type="hidden" name="redirect" value="https://your-site.com/thanks"> -->`);
    }
    lines.push(
        `  <!-- the ad campaign the visitor came from (?utm_campaign=… on your page's link) -->`,
        `  <input type="hidden" name="utm_source">`,
        `  <input type="hidden" name="utm_medium">`,
        `  <input type="hidden" name="utm_campaign">`,
        `  <button type="submit">${texts.buttonLabel}</button>`,
        `</form>`,
        `<script>`,
        `  new URLSearchParams(location.search).forEach(function (value, key) {`,
        `    document.querySelectorAll('input[name="' + key + '"][type="hidden"]').forEach(function (input) { input.value = value; });`,
        `  });`,
        `</script>`,
    );
    return lines.join("\n");
}
