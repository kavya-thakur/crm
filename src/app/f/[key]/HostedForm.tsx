"use client";

import { useState, type ReactNode } from "react";
import { IconCircleCheckFilled } from "@tabler/icons-react";

import type { FieldMode } from "@/lib/validations/leadForms";
import { Spinner } from "@/components/Loader";

// One of the lead custom fields a form asks for
export interface HostedField {
    key: string;
    label: string;
    type: "TEXT" | "NUMBER" | "DATE" | "SELECT" | "BOOLEAN" | "AGENT";
    options: string[];
    required: boolean;
}

interface HostedFormProps {
    formKey: string;
    workspace: string;
    texts: { title: string; buttonLabel: string; thankYou: string };
    intro: string;
    redirectUrl: string | null;
    builtIn: { email: FieldMode; company: FieldMode; message: FieldMode };
    customFields: HostedField[];
}

const inputClass =
    "h-10 w-full rounded-lg border border-line bg-surface px-3 text-[15px] outline-none placeholder:text-light focus:border-accent focus:ring-3 focus:ring-accent-soft aria-invalid:border-danger";

// The API's errors come as { field: "message" } or, from its first check, { field: ["message"] }
function firstMessages(errors: Record<string, string | string[]> | undefined) {
    return Object.fromEntries(Object.entries(errors ?? {}).map(([field, message]) => [field, Array.isArray(message) ? message[0] : message]));
}

/**
 * The public form people fill in. It sends to the same endpoint as a form embedded on a
 * website (POST /api/public/forms/<key>), so the rules, duplicate check, owner and reply
 * task are all the same; only the page around it is ours.
 */
export default function HostedForm({ formKey, workspace, texts, intro, redirectUrl, builtIn, customFields }: HostedFormProps) {
    const [values, setValues] = useState({ name: "", email: "", phone: "", company: "", message: "", website: "" });
    const [answers, setAnswers] = useState<Record<string, string | boolean>>({});
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [problem, setProblem] = useState<string | null>(null);
    const [sending, setSending] = useState(false);
    const [sent, setSent] = useState(false);

    const set = (field: keyof typeof values, value: string) => setValues((current) => ({ ...current, [field]: value }));

    async function submit(event: React.FormEvent) {
        event.preventDefault();
        setSending(true);
        setProblem(null);

        try {
            const res = await fetch(`/api/public/forms/${formKey}`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                // the campaign tags on the link they came in on (?utm_campaign=…), for the lead
                body: JSON.stringify({ ...values, ...utmTags(window.location.search), customFields: answers }),
            });
            const body = await res.json().catch(() => ({}));

            if (!res.ok) {
                setErrors(firstMessages(body.errors));
                setProblem(body.message ?? "Something went wrong. Please try again.");
                return;
            }

            if (redirectUrl) {
                window.location.assign(redirectUrl);
                return;
            }
            setSent(true);
        } catch {
            setProblem("Couldn't send it. Check your connection and try again.");
        } finally {
            setSending(false);
        }
    }

    return (
        <main className="flex min-h-screen flex-col items-center bg-shell px-4 py-10 sm:py-16">
            <div className="w-full max-w-lg">
                <p className="mb-4 flex items-center gap-2 px-1 font-medium text-muted">
                    <span className="flex size-6 items-center justify-center rounded-md bg-ink text-[12px] font-semibold text-white">
                        {workspace[0]?.toUpperCase()}
                    </span>
                    {workspace}
                </p>

                <div className="rounded-2xl border border-line bg-surface p-6 shadow-[0_1px_2px_rgb(0_0_0/0.04),0_16px_40px_-20px_rgb(0_0_0/0.18)] sm:p-8">
                    {sent ? (
                        <div className="flex flex-col items-center py-8 text-center" role="status">
                            <IconCircleCheckFilled size={44} className="text-[#218358]" />
                            <p className="mt-3 text-[17px] font-medium text-ink">{texts.thankYou}</p>
                        </div>
                    ) : (
                        <form noValidate onSubmit={submit}>
                            <h1 className="text-[22px] leading-7 font-semibold tracking-[-0.01em] text-ink">{texts.title}</h1>
                            {intro && <p className="mt-2 whitespace-pre-line text-muted">{intro}</p>}

                            <div className="mt-6 flex flex-col gap-4">
                                <Field id="name" label="Name" required error={errors.name}>
                                    <input id="name" autoComplete="name" value={values.name} aria-invalid={!!errors.name} onChange={(e) => set("name", e.target.value)} className={inputClass} />
                                </Field>

                                {builtIn.email !== "hidden" && (
                                    <Field id="email" label="Email" required={builtIn.email === "required"} error={errors.email}>
                                        <input id="email" type="email" autoComplete="email" value={values.email} aria-invalid={!!errors.email} onChange={(e) => set("email", e.target.value)} className={inputClass} />
                                    </Field>
                                )}

                                <Field id="phone" label="Phone" required error={errors.phone}>
                                    <input id="phone" type="tel" autoComplete="tel" value={values.phone} aria-invalid={!!errors.phone} onChange={(e) => set("phone", e.target.value)} className={inputClass} />
                                </Field>

                                {builtIn.company !== "hidden" && (
                                    <Field id="company" label="Company" required={builtIn.company === "required"} error={errors.company}>
                                        <input id="company" autoComplete="organization" value={values.company} aria-invalid={!!errors.company} onChange={(e) => set("company", e.target.value)} className={inputClass} />
                                    </Field>
                                )}

                                {customFields.map((field) => (
                                    <CustomInput key={field.key} field={field} value={answers[field.key]} error={errors[field.key]} onChange={(value) => setAnswers((current) => ({ ...current, [field.key]: value }))} />
                                ))}

                                {builtIn.message !== "hidden" && (
                                    <Field id="message" label="Message" required={builtIn.message === "required"} error={errors.message}>
                                        <textarea
                                            id="message"
                                            rows={4}
                                            value={values.message}
                                            aria-invalid={!!errors.message}
                                            onChange={(e) => set("message", e.target.value)}
                                            className={`${inputClass} h-auto resize-none py-2 leading-6`}
                                        />
                                    </Field>
                                )}

                                {/* spam trap: people never see it, so only bots fill it in */}
                                <input name="website" tabIndex={-1} autoComplete="off" aria-hidden value={values.website} onChange={(e) => set("website", e.target.value)} className="hidden" />
                            </div>

                            {problem && (
                                <p role="alert" className="mt-5 rounded-lg bg-danger-soft px-3 py-2 text-danger">
                                    {problem}
                                </p>
                            )}

                            <button
                                type="submit"
                                disabled={sending}
                                className="mt-6 flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-accent font-medium text-on-accent hover:bg-accent-hover disabled:opacity-70"
                            >
                                {sending && <Spinner size={15} />}
                                {texts.buttonLabel}
                            </button>
                        </form>
                    )}
                </div>

                <p className="mt-5 text-center text-sm text-faint">
                    Powered by <span className="font-medium text-muted">Flash</span>
                </p>
            </div>
        </main>
    );
}

function Field({ id, label, required, error, children }: { id: string; label: string; required?: boolean; error?: string; children: ReactNode }) {
    return (
        <div>
            <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-ink">
                {label}
                {required ? <span className="text-danger"> *</span> : <span className="font-normal text-faint"> (optional)</span>}
            </label>
            {children}
            {error && <p className="mt-1 text-sm text-danger">{error}</p>}
        </div>
    );
}

// A lead custom field as a form input, by its type
function CustomInput({ field, value, error, onChange }: { field: HostedField; value: string | boolean | undefined; error?: string; onChange: (value: string | boolean) => void }) {
    const id = `cf-${field.key}`;

    if (field.type === "BOOLEAN") {
        return (
            <div>
                <label htmlFor={id} className="flex items-center gap-2 text-[15px] text-ink">
                    <input id={id} type="checkbox" checked={value === true} onChange={(e) => onChange(e.target.checked)} className="size-4 accent-accent" />
                    {field.label}
                    {field.required && <span className="text-danger">*</span>}
                </label>
                {error && <p className="mt-1 text-sm text-danger">{error}</p>}
            </div>
        );
    }

    const text = typeof value === "string" ? value : "";

    return (
        <Field id={id} label={field.label} required={field.required} error={error}>
            {field.type === "SELECT" ? (
                <select id={id} value={text} aria-invalid={!!error} onChange={(e) => onChange(e.target.value)} className={inputClass}>
                    <option value="">Choose…</option>
                    {field.options.map((option) => (
                        <option key={option} value={option}>
                            {option}
                        </option>
                    ))}
                </select>
            ) : (
                <input
                    id={id}
                    type={field.type === "NUMBER" ? "number" : field.type === "DATE" ? "date" : "text"}
                    value={text}
                    aria-invalid={!!error}
                    onChange={(e) => onChange(e.target.value)}
                    className={inputClass}
                />
            )}
        </Field>
    );
}

// utm_source / utm_medium / utm_campaign from a query string; the ones that aren't there are left out
function utmTags(search: string) {
    const params = new URLSearchParams(search);
    return Object.fromEntries(UTM_TAGS.flatMap((tag) => (params.get(tag) ? [[tag, params.get(tag)]] : [])));
}

const UTM_TAGS = ["utm_source", "utm_medium", "utm_campaign"] as const;
