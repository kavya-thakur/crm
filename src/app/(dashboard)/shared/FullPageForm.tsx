"use client";

import { useState, type ComponentType, type ReactNode } from "react";
import type { UseFormRegisterReturn } from "react-hook-form";
import {
    IconChecklist,
    IconChevronUp,
    IconLock,
    IconNotes,
    IconPhoneCall,
    IconProgress,
} from "@tabler/icons-react";
import { Avatar } from "@/components/Avatar";
import { usePanelEnter } from "./usePanelEnter";

/**
 * The "new record" page shell shared by Leads/Deals/Contacts: a breadcrumb
 * header with Cancel/Create in the top right (not buried at the bottom of
 * the form), a fixed-width column of collapsible field groups on the left,
 * and a locked Timeline/Calls/Notes/Activities tab shell on the right —
 * those only make sense once the record actually exists.
 */

interface RecordFormShellProps {
    icon: ComponentType<{ size?: number; className?: string }>;
    /** the list page this breadcrumbs back to, e.g. "Leads" */
    entityLabel: string;
    /** e.g. "lead" — used for "New lead" / "Create lead" / "lead is created" */
    noun: string;
    formId: string;
    onSubmit: (e: React.FormEvent) => void;
    onCancel: () => void;
    submitDisabled?: boolean;
    /** for records with no Timeline/Calls/Notes/Activities of their own (e.g. a task): centres the form instead */
    hideTabs?: boolean;
    children: ReactNode;
}

export function RecordFormShell({
    icon: Icon,
    entityLabel,
    noun,
    formId,
    onSubmit,
    onCancel,
    submitDisabled,
    hideTabs,
    children,
}: RecordFormShellProps) {
    const enterRef = usePanelEnter<HTMLDivElement>();

    return (
        <div ref={enterRef} className="flex h-full min-h-0 flex-col">
            <header className="flex h-12 shrink-0 items-center gap-1.5 border-b border-line bg-paper px-3">
                <Icon size={16} className="text-accent" />
                <button type="button" onClick={onCancel} className="rounded px-1 text-muted hover:bg-fill hover:text-ink">
                    {entityLabel}
                </button>
                <span className="text-faint">/</span>
                <span className="rounded px-1 font-semibold">New {noun}</span>

                <div className="ml-auto flex items-center gap-2">
                    <button
                        type="button"
                        onClick={onCancel}
                        className="h-8 rounded-lg border border-fill bg-black/2 px-3 font-medium text-muted hover:bg-app"
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        form={formId}
                        disabled={submitDisabled}
                        className="flex h-8 items-center gap-1.5 rounded-lg bg-accent px-3 font-medium text-on-accent hover:bg-accent-hover disabled:opacity-60"
                    >
                        Create {noun}
                    </button>
                </div>
            </header>

            <div className="flex min-h-0 flex-1">
                <form
                    id={formId}
                    noValidate
                    onSubmit={onSubmit}
                    className={`flex w-full max-w-lg shrink-0 flex-col overflow-y-auto ${hideTabs ? "mx-auto" : "border-r border-line-light"}`}
                >
                    <div className="space-y-1 px-6 py-6">{children}</div>
                </form>

                {!hideTabs && <LockedRecordTabs noun={noun} />}
            </div>
        </div>
    );
}

// The avatar + big centered name input at the top of every record form —
// "name" for a lead/contact, "title" for a deal. The avatar is a generic
// placeholder (CloudShope's own form shows a dash, not a live initial).
export function FormIdentityHeader({
    placeholder,
    error,
    registerProps,
}: {
    placeholder: string;
    error?: string;
    registerProps: UseFormRegisterReturn;
}) {
    return (
        <div className="flex flex-col items-center gap-3 pb-4">
            <Avatar name="-" size="lg" />
            <input
                autoFocus
                placeholder={placeholder}
                aria-invalid={!!error}
                {...registerProps}
                className="h-9 w-full rounded-lg border border-line px-3 text-center outline-none placeholder:text-light focus:border-accent focus:ring-3 focus:ring-accent-soft"
            />
            {error && <p className="text-sm text-danger">{error}</p>}
        </div>
    );
}

// A collapsible group of fields, Twenty/CloudShope-style
export function FormSection({ title, children }: { title: string; children: ReactNode }) {
    const [open, setOpen] = useState(true);

    return (
        <div className="border-b border-line-light py-3 first:pt-0">
            <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                className="flex w-full items-center justify-between rounded px-1 py-1 text-left font-medium hover:bg-fill"
            >
                {title}
                <IconChevronUp size={16} className={`text-faint transition-transform ${open ? "" : "rotate-180"}`} />
            </button>
            {open && <div className="mt-1 space-y-0.5">{children}</div>}
        </div>
    );
}

export function FormFieldRow({
    icon: Icon,
    label,
    required,
    children,
}: {
    icon: ComponentType<{ size?: number; className?: string }>;
    label: string;
    required?: boolean;
    children: ReactNode;
}) {
    return (
        <div className="flex min-h-9 items-center gap-2 py-1">
            <span className="flex w-32 shrink-0 items-center gap-1.5 text-sm text-muted">
                <Icon size={15} className="text-faint" />
                {label} {required && <span className="text-danger">*</span>}
            </span>
            <div className="min-w-0 flex-1">{children}</div>
        </div>
    );
}

const TABS = ["Timeline", "Calls", "Notes", "Activities"] as const;
const TAB_ICONS: Record<(typeof TABS)[number], typeof IconProgress> = {
    Timeline: IconProgress,
    Calls: IconPhoneCall,
    Notes: IconNotes,
    Activities: IconChecklist,
};

function LockedRecordTabs({ noun }: { noun: string }) {
    const [tab, setTab] = useState<(typeof TABS)[number]>("Timeline");

    return (
        <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex h-11 shrink-0 items-center gap-1 border-b border-line-light px-3">
                {TABS.map((label) => {
                    const Icon = TAB_ICONS[label];
                    return (
                        <button
                            key={label}
                            type="button"
                            onClick={() => setTab(label)}
                            className={`flex h-8 items-center gap-1.5 border-b-2 px-2 text-sm font-medium
                                ${tab === label ? "border-accent text-ink" : "border-transparent text-faint hover:text-muted"}`}
                        >
                            <Icon size={14} />
                            {label}
                        </button>
                    );
                })}
            </div>

            <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
                <IconLock size={24} className="text-light" />
                <p className="text-faint">{tab} unlocks once the {noun} is created</p>
            </div>
        </div>
    );
}
