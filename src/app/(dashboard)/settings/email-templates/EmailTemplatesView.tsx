"use client";

import { useRef, useState, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { IconPencil, IconPlus, IconTrash } from "@tabler/icons-react";

import { api, errorMessage } from "@/lib/api/client";
import { STARTER_TEMPLATES, TEMPLATE_VARIABLES, fillTemplate } from "@/lib/emails/templates";
import { ConfirmDeleteModal } from "@/components/ListPage";
import { ErrorState } from "@/components/ErrorState";
import { PageLoader, Spinner } from "@/components/Loader";
import { SectionIcon } from "@/components/SectionIcon";
import { SidePanel } from "@/components/SidePanel";
import { toast } from "@/components/Toast";
import { useEmailTemplates, type EmailTemplate } from "../../shared/emails";

const inputClassName =
    "h-8 w-full rounded-lg border border-line bg-surface px-2 outline-none placeholder:text-light focus:border-accent focus:ring-3 focus:ring-accent-soft";

// the placeholders filled with made-up values, for the cards' preview
const EXAMPLE = Object.fromEntries(TEMPLATE_VARIABLES.map((variable) => [variable.key, variable.example]));

// Settings > Email templates: ready-made emails anyone can start from in a lead's or deal's Emails tab
export default function EmailTemplatesView() {
    const queryClient = useQueryClient();
    const templatesQuery = useEmailTemplates();
    // the template in the side panel: an existing one, "new", or none
    const [editing, setEditing] = useState<EmailTemplate | "new" | null>(null);

    const addStarters = useMutation({
        mutationFn: () => Promise.all(STARTER_TEMPLATES.map((template) => api.post("/email-templates", template))),
        onSuccess: () => {
            toast.success("Added 3 templates");
            queryClient.invalidateQueries({ queryKey: ["emailTemplates"] });
        },
        onError: (error) => toast.error(errorMessage(error)),
    });

    const templates = templatesQuery.data?.data;

    return (
        <div className="flex h-full flex-col">
            <header className="flex h-12 shrink-0 items-center gap-2 border-b border-line bg-paper px-3">
                <SectionIcon section="emailTemplates" size="md" />
                <h1 className="font-semibold">Email templates</h1>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto">
                <div className="mx-auto max-w-3xl px-6 py-8">
                    <div className="flex items-start gap-4">
                        <SectionIcon section="emailTemplates" size="lg" />
                        <div className="min-w-0 flex-1 pt-0.5">
                            <h2 className="text-[17px] leading-6 font-semibold tracking-[-0.01em]">Email templates</h2>
                            <p className="mt-0.5 text-muted">
                                Emails your team sends again and again. Pick one in a lead&apos;s or deal&apos;s Emails tab, and the name, company and your
                                own details are filled in, ready to change before sending.
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={() => setEditing("new")}
                            className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-accent px-3 font-medium text-on-accent hover:bg-accent-hover"
                        >
                            <IconPlus size={14} />
                            New template
                        </button>
                    </div>

                    {templatesQuery.isPending && <PageLoader label="Loading templates" />}
                    {templatesQuery.isError && (
                        <ErrorState title="Couldn't load templates" error={templatesQuery.error} onRetry={() => templatesQuery.refetch()} retrying={templatesQuery.isFetching} />
                    )}

                    {templates?.length === 0 && (
                        <div className="mt-6 flex flex-col items-center gap-3 rounded-xl border border-dashed border-line-strong px-4 py-10 text-center">
                            <p className="text-faint">No templates yet. Write your own, or start with three common ones you can edit.</p>
                            <button
                                type="button"
                                onClick={() => addStarters.mutate()}
                                disabled={addStarters.isPending}
                                className="flex h-8 items-center gap-1.5 rounded-lg border border-line px-3 font-medium text-ink hover:bg-fill disabled:opacity-60"
                            >
                                {addStarters.isPending && <Spinner size={14} />}
                                Add starter templates
                            </button>
                        </div>
                    )}

                    <div className="mt-6 flex flex-col gap-3">
                        {templates?.map((template) => (
                            <TemplateCard key={template.id} template={template} onEdit={() => setEditing(template)} />
                        ))}
                    </div>
                </div>
            </div>

            <SidePanel open={editing !== null} onClose={() => setEditing(null)} wide>
                {editing && <TemplateEditor template={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
            </SidePanel>
        </div>
    );
}

// One template: its name, and the start of the email as a lead would get it
function TemplateCard({ template, onEdit }: { template: EmailTemplate; onEdit: () => void }) {
    const queryClient = useQueryClient();
    const [deleting, setDeleting] = useState(false);

    const remove = useMutation({
        mutationFn: () => api.delete(`/email-templates/${template.id}`),
        onSuccess: () => {
            toast.success("Template deleted");
            setDeleting(false);
            queryClient.invalidateQueries({ queryKey: ["emailTemplates"] });
        },
    });

    return (
        <div className="group rounded-xl border border-line bg-surface p-4">
            <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                    <p className="font-semibold">{template.name}</p>
                    <p className="mt-1 truncate text-ink">{fillTemplate(template.subject, EXAMPLE)}</p>
                    <p className="mt-0.5 line-clamp-2 text-faint">{fillTemplate(template.body, EXAMPLE)}</p>
                </div>
                <div className="flex shrink-0 gap-0.5">
                    <button type="button" aria-label={`Edit ${template.name}`} onClick={onEdit} className="flex size-7 items-center justify-center rounded-lg text-muted hover:bg-fill hover:text-ink">
                        <IconPencil size={16} />
                    </button>
                    <button
                        type="button"
                        aria-label={`Delete ${template.name}`}
                        onClick={() => setDeleting(true)}
                        className="flex size-7 items-center justify-center rounded-lg text-muted hover:bg-danger-soft hover:text-danger"
                    >
                        <IconTrash size={16} />
                    </button>
                </div>
            </div>

            <ConfirmDeleteModal
                open={deleting}
                title={`Delete "${template.name}"?`}
                description="Emails already sent with it stay as they are."
                error={remove.isError ? errorMessage(remove.error) : undefined}
                pending={remove.isPending}
                onCancel={() => setDeleting(false)}
                onConfirm={() => remove.mutate()}
            />
        </div>
    );
}

// Name, subject and message, with the placeholders as buttons that drop in where the cursor is
function TemplateEditor({ template, onClose }: { template: EmailTemplate | null; onClose: () => void }) {
    const queryClient = useQueryClient();
    const [name, setName] = useState(template?.name ?? "");
    const [subject, setSubject] = useState(template?.subject ?? "");
    const [body, setBody] = useState(template?.body ?? "");
    // the field a placeholder button inserts into: whichever was typed in last
    const lastField = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
    const subjectRef = useRef<HTMLInputElement>(null);
    const bodyRef = useRef<HTMLTextAreaElement>(null);

    const save = useMutation({
        mutationFn: () => {
            const data = { name, subject, body };
            return template ? api.put(`/email-templates/${template.id}`, data) : api.post("/email-templates", data);
        },
        onSuccess: () => {
            toast.success(template ? "Template saved" : "Template created");
            queryClient.invalidateQueries({ queryKey: ["emailTemplates"] });
            onClose();
        },
    });

    function insert(key: string) {
        const field = lastField.current ?? bodyRef.current!;
        const text = `{{${key}}}`;
        const start = field.selectionStart ?? field.value.length;
        const end = field.selectionEnd ?? start;
        const next = field.value.slice(0, start) + text + field.value.slice(end);
        if (field === subjectRef.current) setSubject(next);
        else setBody(next);
        // put the cursor just after it, once React has rendered the new value
        requestAnimationFrame(() => {
            field.focus();
            field.setSelectionRange(start + text.length, start + text.length);
        });
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
                <h2 className="text-lg font-semibold">{template ? "Edit template" : "New template"}</h2>
                <p className="text-sm text-faint">Placeholders like {"{{lead.firstName}}"} are filled in when someone picks it</p>
            </header>

            <div className="flex-1 space-y-4 px-5 py-5">
                <Labelled label="Name" hint="Only your team sees this, in the template picker">
                    <input value={name} onChange={(event) => setName(event.target.value)} maxLength={100} placeholder="Follow-up after demo" className={inputClassName} />
                </Labelled>
                <Labelled label="Subject">
                    <input
                        ref={subjectRef}
                        value={subject}
                        onChange={(event) => setSubject(event.target.value)}
                        onFocus={(event) => (lastField.current = event.currentTarget)}
                        maxLength={200}
                        className={inputClassName}
                    />
                </Labelled>
                <Labelled label="Message">
                    <textarea
                        ref={bodyRef}
                        value={body}
                        onChange={(event) => setBody(event.target.value)}
                        onFocus={(event) => (lastField.current = event.currentTarget)}
                        rows={12}
                        maxLength={20_000}
                        className="w-full resize-y rounded-lg border border-line bg-surface px-2 py-1.5 leading-relaxed outline-none focus:border-accent focus:ring-3 focus:ring-accent-soft"
                    />
                </Labelled>

                <div>
                    <p className="mb-1.5 text-sm font-medium text-muted">Insert a placeholder</p>
                    <div className="flex flex-wrap gap-1.5">
                        {TEMPLATE_VARIABLES.map((variable) => (
                            <button
                                key={variable.key}
                                type="button"
                                // keep the cursor where it is in the field
                                onMouseDown={(event) => event.preventDefault()}
                                onClick={() => insert(variable.key)}
                                title={`{{${variable.key}}}, e.g. ${variable.example}`}
                                className="h-7 rounded-full border border-line px-2.5 text-sm text-muted hover:border-accent hover:bg-accent-faint hover:text-accent"
                            >
                                {variable.label}
                            </button>
                        ))}
                    </div>
                </div>

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
                    {template ? "Save template" : "Create template"}
                </button>
            </footer>
        </form>
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
