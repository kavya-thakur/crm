"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { IconAlertCircle, IconChevronDown, IconMail, IconMailOpened, IconPencil, IconSend } from "@tabler/icons-react";

import { api, errorMessage } from "@/lib/api/client";
import { fillTemplate, type TemplateValues } from "@/lib/emails/templates";
import { ErrorState } from "@/components/ErrorState";
import { SkeletonList, Spinner } from "@/components/Loader";
import { Select } from "@/components/Select";
import { toast } from "@/components/Toast";
import { timeAgo } from "@/lib/utils/format";

type EmailEntity = "lead" | "deal";
type EmailStatus = "QUEUED" | "SENT" | "FAILED" | "SKIPPED";

interface Email {
    id: number;
    to: string;
    subject: string;
    body: string;
    status: EmailStatus;
    error: string | null;
    sentAt: string | null;
    openedAt: string | null;
    createdAt: string;
    sentBy: { id: number; name: string } | null;
}

export interface EmailTemplate {
    id: number;
    name: string;
    subject: string;
    body: string;
}

// The templates, plus who's sending (for {{me.name}} and friends)
export function useEmailTemplates() {
    return useQuery({
        queryKey: ["emailTemplates"],
        queryFn: () =>
            api
                .get<{ data: EmailTemplate[]; me: { name: string; email: string; workspace: string } }>("/email-templates")
                .then((res) => res.data),
    });
}

const inputClassName =
    "h-8 w-full rounded-lg border border-line bg-surface px-2 outline-none placeholder:text-light focus:border-accent focus:ring-3 focus:ring-accent-soft";

/**
 * The Emails tab of a lead or deal: write one (from scratch or a template) and see every email
 * sent from here, with whether it went out and whether it was opened. Sending is quick: the
 * server queues it and the worker sends it, so the status changes live (Sending → Sent → Opened).
 */
export function EmailsTab({ entity, recordId, to, values }: { entity: EmailEntity; recordId: number; to: string | null; values: TemplateValues }) {
    const [writing, setWriting] = useState(false);
    const link = entity === "lead" ? { leadId: recordId } : { dealId: recordId };

    const emailsQuery = useQuery({
        queryKey: ["emails", entity, recordId],
        queryFn: () => api.get<{ data: Email[] }>("/emails", { params: link }).then((res) => res.data.data),
    });

    return (
        <div className="flex flex-col gap-3">
            {writing ? (
                <Composer link={link} defaultTo={to ?? ""} values={values} onDone={() => setWriting(false)} />
            ) : (
                <button
                    type="button"
                    onClick={() => setWriting(true)}
                    className="flex h-9 items-center gap-2 rounded-lg border border-line bg-surface px-3 text-left text-light hover:border-line-strong"
                >
                    <IconPencil size={14} className="text-faint" />
                    {to ? `Write an email to ${to}...` : "Write an email..."}
                </button>
            )}

            {emailsQuery.isPending && <SkeletonList rows={3} />}
            {emailsQuery.isError && (
                <ErrorState variant="inline" title="Couldn't load emails" error={emailsQuery.error} onRetry={() => emailsQuery.refetch()} retrying={emailsQuery.isFetching} />
            )}
            {emailsQuery.isSuccess && emailsQuery.data.length === 0 && !writing && (
                <p className="text-light">No emails yet. Emails you send from here, and whether they were opened, show up here.</p>
            )}

            {emailsQuery.data && emailsQuery.data.length > 0 && (
                <ul className="flex flex-col gap-2">
                    {emailsQuery.data.map((email) => (
                        <EmailCard key={email.id} email={email} />
                    ))}
                </ul>
            )}
        </div>
    );
}

// To, an optional template, subject and message; a template's placeholders are filled in as it's picked
function Composer({ link, defaultTo, values, onDone }: { link: { leadId?: number; dealId?: number }; defaultTo: string; values: TemplateValues; onDone: () => void }) {
    const queryClient = useQueryClient();
    const templatesQuery = useEmailTemplates();
    const [to, setTo] = useState(defaultTo);
    const [templateId, setTemplateId] = useState<string | undefined>();
    const [subject, setSubject] = useState("");
    const [body, setBody] = useState("");

    const me = templatesQuery.data?.me;
    const filled: TemplateValues = { ...values, "me.name": me?.name, "me.email": me?.email, "workspace.name": me?.workspace };

    const send = useMutation({
        mutationFn: () => api.post("/emails", { ...link, to: to.trim(), subject, body }),
        onSuccess: () => {
            toast.success("Sending your email");
            queryClient.invalidateQueries({ queryKey: ["emails"] });
            queryClient.invalidateQueries({ queryKey: [link.leadId ? "lead" : "deal"] });
            onDone();
        },
    });

    function pickTemplate(id: string | undefined) {
        setTemplateId(id);
        const template = templatesQuery.data?.data.find((item) => String(item.id) === id);
        if (!template) return;
        setSubject(fillTemplate(template.subject, filled));
        setBody(fillTemplate(template.body, filled));
    }

    const canSend = to.trim() !== "" && subject.trim() !== "" && body.trim() !== "" && !send.isPending;
    const templates = templatesQuery.data?.data ?? [];

    return (
        <form
            className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-3 shadow-light"
            onSubmit={(event) => {
                event.preventDefault();
                if (canSend) send.mutate();
            }}
        >
            <div className="flex items-center gap-2">
                <label htmlFor="email-to" className="w-16 shrink-0 text-sm text-faint">To</label>
                <input id="email-to" type="email" value={to} onChange={(event) => setTo(event.target.value)} placeholder="name@company.com" className={inputClassName} />
            </div>
            <div className="flex items-center gap-2">
                <span className="w-16 shrink-0 text-sm text-faint">Template</span>
                {templates.length > 0 ? (
                    <Select
                        value={templateId}
                        onChange={pickTemplate}
                        options={templates.map((template) => ({ value: String(template.id), label: template.name }))}
                        placeholder="Start from a template (optional)"
                    />
                ) : (
                    <span className="text-sm text-light">
                        {templatesQuery.isPending ? "Loading..." : "No templates yet. They're made in Settings → Email templates."}
                    </span>
                )}
            </div>
            <div className="flex items-center gap-2">
                <label htmlFor="email-subject" className="w-16 shrink-0 text-sm text-faint">Subject</label>
                <input id="email-subject" value={subject} onChange={(event) => setSubject(event.target.value)} maxLength={200} className={inputClassName} />
            </div>
            <textarea
                aria-label="Message"
                value={body}
                onChange={(event) => setBody(event.target.value)}
                rows={9}
                maxLength={20_000}
                placeholder="Write your message..."
                className="w-full resize-y rounded-lg border border-line bg-surface px-2 py-1.5 leading-relaxed outline-none placeholder:text-light focus:border-accent focus:ring-3 focus:ring-accent-soft"
            />

            {send.isError && <p role="alert" className="text-sm text-danger">{errorMessage(send.error)}</p>}

            <div className="flex flex-wrap items-center gap-2">
                <p className="min-w-0 flex-1 text-sm text-faint">{me ? `Replies come to ${me.email}` : ""}</p>
                <button type="button" onClick={onDone} className="h-8 rounded-lg border border-line px-3 font-medium text-muted hover:bg-fill">
                    Cancel
                </button>
                <button
                    type="submit"
                    disabled={!canSend}
                    className="flex h-8 items-center gap-1.5 rounded-lg bg-accent px-3 font-medium text-on-accent hover:bg-accent-hover disabled:opacity-60"
                >
                    {send.isPending ? <Spinner size={14} /> : <IconSend size={14} />}
                    Send
                </button>
            </div>
        </form>
    );
}

// What happened to it, as a small coloured pill
const STATUS: Record<EmailStatus | "OPENED", { label: string; className: string }> = {
    QUEUED: { label: "Sending", className: "bg-[#fff7c2] text-[#9e6c00]" },
    SENT: { label: "Sent", className: "bg-success-soft text-success" },
    OPENED: { label: "Opened", className: "bg-accent-soft text-accent" },
    FAILED: { label: "Not sent", className: "bg-danger-soft text-danger" },
    SKIPPED: { label: "Demo, not delivered", className: "bg-app text-muted" },
};

// One sent email: subject, status, who sent it to whom and when; click to read it in full
function EmailCard({ email }: { email: Email }) {
    const [open, setOpen] = useState(false);
    const status = STATUS[email.openedAt ? "OPENED" : email.status];

    return (
        <li className="rounded-lg border border-line bg-surface">
            <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-start gap-2.5 px-3 py-2.5 text-left">
                <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md bg-app text-muted">
                    {email.openedAt ? <IconMailOpened size={14} /> : <IconMail size={14} />}
                </span>
                <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                        <span className="truncate font-medium text-ink">{email.subject}</span>
                        <span className={`inline-flex h-5 shrink-0 items-center rounded-full px-2 text-sm font-medium ${status.className}`}>{status.label}</span>
                    </span>
                    <span className="mt-0.5 block truncate text-sm text-faint">
                        {email.sentBy?.name ?? "Someone"} to {email.to} · {timeAgo(email.sentAt ?? email.createdAt)}
                        {email.openedAt && ` · opened ${timeAgo(email.openedAt)}`}
                    </span>
                </span>
                <IconChevronDown size={14} className={`mt-1 shrink-0 text-faint transition-transform ${open ? "rotate-180" : ""}`} />
            </button>

            {email.status === "FAILED" && email.error && (
                <p className="mx-3 mb-2.5 flex items-start gap-1.5 rounded-md bg-danger-soft px-2 py-1.5 text-sm text-danger">
                    <IconAlertCircle size={14} className="mt-0.5 shrink-0" />
                    {email.error}
                </p>
            )}

            {open && <p className="border-t border-line-light px-3 py-2.5 leading-relaxed break-words whitespace-pre-wrap text-muted">{email.body}</p>}
        </li>
    );
}

