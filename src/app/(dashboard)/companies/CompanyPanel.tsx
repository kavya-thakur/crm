"use client";

import { useState, type ComponentType, type ReactNode } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { IconBriefcase, IconBuilding, IconExternalLink, IconFileDescription, IconPhone, IconTrash, IconUser, IconWorld, IconX } from "@tabler/icons-react";

import { api, errorMessage } from "@/lib/api/client";
import { formatDay, formatMoney } from "@/lib/utils/format";
import { ConfirmDeleteModal } from "@/components/ListPage";
import { ErrorState } from "@/components/ErrorState";
import { SkeletonList } from "@/components/Loader";
import { SectionIcon } from "@/components/SectionIcon";
import { toast } from "@/components/Toast";
import { usePanelEnter } from "../shared/usePanelEnter";
import { websiteHref, websiteLabel, type CompanyPermissions } from "./shared";

interface Company {
    id: number;
    name: string;
    website: string | null;
    industry: string | null;
    phone: string | null;
    description: string | null;
    contacts: { total: number; items: { id: number; name: string; email: string | null; phone: string; jobTitle: string | null }[] };
    // null: no permission to see deals
    deals: {
        total: number;
        items: {
            id: number;
            title: string;
            amount: number;
            closedAt: string | null;
            expectedCloseDate: string | null;
            pipelineStage: { name: string; color: string; isWon: boolean; isLost: boolean };
        }[];
        open: { count: number; value: number };
        won: { count: number; value: number };
    } | null;
}

type Field = "name" | "website" | "industry" | "phone" | "description";
type Icon = ComponentType<{ size?: number; className?: string }>;

const count = (value: number) => value.toLocaleString("en-IN");

// One company: its details (edited in place), what it's worth, its people and its deals
export default function CompanyPanel({ companyId, can, onClose }: { companyId: number; can: CompanyPermissions; onClose: () => void }) {
    const queryClient = useQueryClient();
    const [confirmingDelete, setConfirmingDelete] = useState(false);
    const enterRef = usePanelEnter<HTMLDivElement>();

    const query = useQuery({
        queryKey: ["company", companyId],
        queryFn: () => api.get<{ data: Company }>(`/companies/${companyId}`).then((res) => res.data.data),
    });
    const company = query.data;

    const refresh = () => {
        queryClient.invalidateQueries({ queryKey: ["company", companyId] });
        queryClient.invalidateQueries({ queryKey: ["companies"] });
        // the contact panel shows the company's name
        queryClient.invalidateQueries({ queryKey: ["contact"] });
    };

    const update = useMutation({
        mutationFn: (changes: Partial<Record<Field, string | null>>) => api.put(`/companies/${companyId}`, changes),
        onSuccess: refresh,
        onError: (error) => toast.error(errorMessage(error)),
    });

    const remove = useMutation({
        mutationFn: () => api.delete(`/companies/${companyId}`),
        onSuccess: () => {
            toast.success("Company deleted");
            refresh();
            onClose();
        },
    });

    return (
        <div ref={enterRef} className="flex h-full min-h-0 flex-col">
            <header className="flex h-12 shrink-0 items-center gap-1.5 border-b border-line bg-paper px-3">
                <SectionIcon section="companies" size="md" />
                <button type="button" onClick={onClose} className="rounded px-1 text-muted hover:bg-fill hover:text-ink">
                    Companies
                </button>
                <span className="text-faint">/</span>
                <span className="truncate rounded px-1 font-semibold">{company?.name ?? "..."}</span>

                <div className="ml-auto flex items-center gap-0.5">
                    {can.delete && company && (
                        <button
                            type="button"
                            aria-label="Delete company"
                            onClick={() => setConfirmingDelete(true)}
                            className="flex size-7 items-center justify-center rounded-lg text-muted hover:bg-danger-soft hover:text-danger"
                        >
                            <IconTrash size={16} />
                        </button>
                    )}
                    <button type="button" aria-label="Close" onClick={onClose} className="flex size-7 items-center justify-center rounded-lg text-muted hover:bg-fill hover:text-ink">
                        <IconX size={16} />
                    </button>
                </div>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto">
                {query.isPending && (
                    <div className="p-6">
                        <SkeletonList rows={6} />
                    </div>
                )}
                {query.isError && <ErrorState title="Couldn't load this company" error={query.error} onRetry={() => query.refetch()} retrying={query.isFetching} />}

                {company && (
                    <div className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-6 sm:px-6">
                        <div className="flex items-start gap-3">
                            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-app text-lg font-semibold text-muted">
                                {company.name.charAt(0).toUpperCase()}
                            </span>
                            <div className="min-w-0 flex-1">
                                <InlineEdit value={company.name} placeholder="Name" disabled={!can.update} onSave={(name) => name && update.mutate({ name })} className="text-lg font-semibold" />
                                {company.website && (
                                    <a href={websiteHref(company.website)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 px-1 text-sm text-accent hover:underline">
                                        {websiteLabel(company.website)}
                                        <IconExternalLink size={13} />
                                    </a>
                                )}
                            </div>
                        </div>

                        {/* what it's worth at a glance */}
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                            {company.deals && <Stat label="Won" value={formatMoney(company.deals.won.value)} detail={`${count(company.deals.won.count)} deals`} tone="text-success" />}
                            {company.deals && <Stat label="Open pipeline" value={formatMoney(company.deals.open.value)} detail={`${count(company.deals.open.count)} open deals`} />}
                            <Stat label="Contacts" value={count(company.contacts.total)} detail="people here" />
                        </div>

                        <section>
                            <h2 className="mb-1 text-sm font-semibold tracking-wide text-faint uppercase">Details</h2>
                            <Row icon={IconWorld} label="Website">
                                <InlineEdit value={company.website} placeholder="acme.com" disabled={!can.update} onSave={(website) => update.mutate({ website })} />
                            </Row>
                            <Row icon={IconBuilding} label="Industry">
                                <InlineEdit value={company.industry} placeholder="Industry" disabled={!can.update} onSave={(industry) => update.mutate({ industry })} />
                            </Row>
                            <Row icon={IconPhone} label="Phone">
                                <InlineEdit value={company.phone} placeholder="Phone" disabled={!can.update} onSave={(phone) => update.mutate({ phone })} />
                            </Row>
                            <Row icon={IconFileDescription} label="About">
                                <InlineEdit value={company.description} placeholder="What they do, how you work with them" disabled={!can.update} onSave={(description) => update.mutate({ description })} />
                            </Row>
                        </section>

                        <div className="grid items-start gap-4 lg:grid-cols-2">
                            <ListCard icon={IconUser} title="People" total={company.contacts.total} shown={company.contacts.items.length} empty="No contacts here yet. Set a contact's Company to add them.">
                                {company.contacts.items.map((contact) => (
                                    <li key={contact.id}>
                                        <Link href={`/contacts?open=${contact.id}`} className="flex min-h-11 items-center gap-2.5 rounded-lg px-3 py-1.5 hover:bg-paper">
                                            <div className="min-w-0 flex-1">
                                                <span className="block truncate font-medium text-ink">{contact.name}</span>
                                                <span className="block truncate text-sm text-faint">{[contact.jobTitle, contact.email ?? contact.phone].filter(Boolean).join(" · ")}</span>
                                            </div>
                                        </Link>
                                    </li>
                                ))}
                            </ListCard>

                            {company.deals && (
                                <ListCard icon={IconBriefcase} title="Deals" total={company.deals.total} shown={company.deals.items.length} empty="No deals with this company yet.">
                                    {company.deals.items.map((deal) => (
                                        <li key={deal.id}>
                                            <Link href={`/deals?open=${deal.id}`} className="flex min-h-11 items-center gap-2.5 rounded-lg px-3 py-1.5 hover:bg-paper">
                                                <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ backgroundColor: deal.pipelineStage.color }} />
                                                <div className="min-w-0 flex-1">
                                                    <span className="block truncate font-medium text-ink">{deal.title}</span>
                                                    <span className="block truncate text-sm text-faint">
                                                        {deal.pipelineStage.name}
                                                        {!deal.closedAt && deal.expectedCloseDate && ` · closes ${formatDay(deal.expectedCloseDate)}`}
                                                    </span>
                                                </div>
                                                <span
                                                    className={`shrink-0 text-sm font-medium whitespace-nowrap tabular-nums ${deal.pipelineStage.isWon ? "text-success" : deal.pipelineStage.isLost ? "text-faint" : "text-ink"}`}
                                                >
                                                    {formatMoney(deal.amount)}
                                                </span>
                                            </Link>
                                        </li>
                                    ))}
                                </ListCard>
                            )}
                        </div>
                    </div>
                )}
            </div>

            <ConfirmDeleteModal
                open={confirmingDelete}
                title={`Delete ${company?.name ?? "this company"}?`}
                description="Only the company goes. Its contacts and deals stay, just without a company."
                error={remove.isError ? errorMessage(remove.error) : undefined}
                pending={remove.isPending}
                onCancel={() => setConfirmingDelete(false)}
                onConfirm={() => remove.mutate()}
            />
        </div>
    );
}

function Stat({ label, value, detail, tone = "text-ink" }: { label: string; value: string; detail: string; tone?: string }) {
    return (
        <div className="min-w-0 rounded-xl border border-line bg-surface px-4 py-3">
            <p className="text-sm text-faint">{label}</p>
            <p className={`truncate font-display text-[20px] leading-7 font-semibold tracking-tight tabular-nums ${tone}`}>{value}</p>
            <p className="truncate text-sm text-faint">{detail}</p>
        </div>
    );
}

function Row({ icon: Icon, label, children }: { icon: Icon; label: string; children: ReactNode }) {
    return (
        <div className="flex min-h-8 items-center gap-1">
            <span className="flex w-24 shrink-0 items-center gap-1 text-sm text-faint">
                <Icon size={16} />
                {label}
            </span>
            <div className="min-w-0 flex-1">{children}</div>
        </div>
    );
}

// A card of up to 100 people or deals, and a note when there are more
function ListCard({ icon: Icon, title, total, shown, empty, children }: { icon: Icon; title: string; total: number; shown: number; empty: string; children: ReactNode }) {
    return (
        <section className="min-w-0 rounded-xl border border-line bg-surface">
            <header className="flex h-11 items-center gap-2 border-b border-line-light px-4">
                <Icon size={16} className="text-faint" />
                <h3 className="font-semibold">{title}</h3>
                <span className="rounded-full bg-fill px-1.5 text-sm font-medium text-muted tabular-nums">{count(total)}</span>
            </header>
            {total === 0 ? <p className="px-4 py-6 text-center text-faint">{empty}</p> : <ul className="max-h-[28rem] overflow-y-auto p-1">{children}</ul>}
            {total > shown && <p className="border-t border-line-light px-4 py-2.5 text-sm text-faint">Showing {count(shown)} of {count(total)}</p>}
        </section>
    );
}

// Click to edit; Enter or leaving the box saves, Escape cancels
function InlineEdit({ value, placeholder, disabled, onSave, className = "" }: { value: string | null; placeholder: string; disabled: boolean; onSave: (next: string | null) => void; className?: string }) {
    const [editing, setEditing] = useState(false);

    if (editing) {
        return (
            <input
                autoFocus
                defaultValue={value ?? ""}
                placeholder={placeholder}
                className={`h-7 w-full rounded-lg border border-accent bg-surface px-1 outline-none focus:ring-3 focus:ring-accent-soft ${className}`}
                onBlur={(event) => {
                    const next = event.target.value.trim();
                    if (next !== (value ?? "")) onSave(next || null);
                    setEditing(false);
                }}
                onKeyDown={(event) => {
                    if (event.key === "Enter") event.currentTarget.blur();
                    if (event.key === "Escape") setEditing(false);
                }}
            />
        );
    }

    return (
        <button
            type="button"
            disabled={disabled}
            onClick={() => setEditing(true)}
            className={`flex h-7 w-full items-center truncate rounded-lg px-1 text-left enabled:hover:bg-fill ${value ? "text-ink" : "text-light"} ${className}`}
        >
            <span className="truncate">{value || placeholder}</span>
        </button>
    );
}
