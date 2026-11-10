"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Select } from "@/components/Select";
import { IconDots, IconLogin2, IconShieldOff, IconShieldStar, IconX } from "@tabler/icons-react";

import { api, errorMessage } from "@/lib/api/client";
import { formatDate } from "@/lib/utils/format";
import { PRO_PLANS, type BillingCycle } from "@/lib/billing/plans";
import { Avatar } from "@/components/Avatar";
import { Dropdown, MenuItem } from "@/components/Dropdown";
import { ErrorState } from "@/components/ErrorState";
import { SkeletonList } from "@/components/Loader";
import { Pill } from "@/components/Pill";
import { SectionIcon } from "@/components/SectionIcon";
import { SidePanel } from "@/components/SidePanel";
import { toast } from "@/components/Toast";
import { Chips, count, Pager, PlanCell, Results, SearchInput, useSearchPage } from "./parts";
import { PaymentLine, rupees, WorkspacePanel, type PaymentRow } from "./WorkspacePanel";

interface SiteUser {
    id: number;
    name: string;
    email: string;
    createdAt: string;
    isOwner: boolean;
    isSiteAdmin: boolean;
    isRootAdmin: boolean;
    role: { name: string };
    organization: { id: number; name: string };
}

interface Workspace {
    id: number;
    name: string;
    createdAt: string;
    billingCycle: string | null;
    // the owner asked for Pro ("MONTHLY" | "YEARLY")
    planRequest: string | null;
    planRequestedAt: string | null;
    access: { state: "trial" | "pro" | "ended"; endsAt: string | null; daysLeft: number };
    owner: { id: number; name: string; email: string } | null;
    counts: { users: number; leads: number; deals: number };
}

interface Ending {
    id: number;
    name: string;
    owner: { name: string; email: string } | null;
    users: number;
    daysLeft: number;
    endsAt: string;
    wantsPro: string | null;
}

interface Overview {
    workspaces: { total: number; trial: number; pro: number; ended: number };
    newThisMonth: number;
    revenue: { thisMonth: number; thisMonthPayments: number; allTime: number; allTimePayments: number };
    payingCustomers: number;
    trialsEnding: Ending[];
    proEnding: Ending[];
}

const TABS = ["overview", "workspaces", "users", "payments"] as const;
type Tab = (typeof TABS)[number];
type PlanFilter = "trial" | "pro" | "ended";
type PeriodFilter = "thisMonth" | "lastMonth";

/**
 * Settings > Site admin, for the people who run the website: how the business is doing, every
 * company and user signed up, every payment, and "Log in as" anyone. A root admin
 * (SITE_ADMIN_EMAILS) can also make others site admins.
 */
export default function SiteAdminView({ meId, root }: { meId: number; root: boolean }) {
    const [tab, setTab] = useState<Tab>("overview");
    // tabs opened so far stay mounted (hidden), so their search, filters and page survive switching
    const [opened, setOpened] = useState<Tab[]>(["overview"]);
    const go = (next: Tab) => {
        setTab(next);
        setOpened((tabs) => (tabs.includes(next) ? tabs : [...tabs, next]));
    };
    // filters other places set: the Users tab narrowed to one company (from its panel), and the
    // Workspaces plan and Payments month (from the overview's numbers)
    const [workspace, setWorkspace] = useState<{ id: number; name: string } | null>(null);
    const [plan, setPlan] = useState<PlanFilter | undefined>(undefined);
    const [period, setPeriod] = useState<PeriodFilter | undefined>(undefined);
    // the company open in the side panel (kept while it slides shut)
    const [panelId, setPanelId] = useState<number | null>(null);
    const [panelOpen, setPanelOpen] = useState(false);
    const openPanel = (id: number) => {
        setPanelId(id);
        setPanelOpen(true);
    };

    return (
        <div className="flex h-full flex-col">
            <header className="flex h-12 shrink-0 items-center gap-2 border-b border-line bg-paper px-3">
                <SectionIcon section="siteAdmin" size="md" />
                <h1 className="font-semibold">Site admin</h1>
                {root && <Pill tone="red">Root</Pill>}
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto">
                <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
                    <p className="text-muted">
                        How the business is doing, and everyone on the website in every company. Log in as anyone to see what they see; nobody is notified. Only site admins see this page.
                    </p>

                    <div role="tablist" className="mt-5 flex gap-1">
                        {TABS.map((value) => (
                            <button
                                key={value}
                                type="button"
                                role="tab"
                                aria-selected={tab === value}
                                onClick={() => go(value)}
                                className={`flex h-7 items-center rounded-lg px-2.5 capitalize ${tab === value ? "bg-fill text-ink" : "text-muted hover:bg-app"}`}
                            >
                                {value}
                            </button>
                        ))}
                    </div>

                    {opened.includes("overview") && (
                        <div hidden={tab !== "overview"}>
                            <OverviewTab
                                onOpen={openPanel}
                                onShowWorkspaces={(picked) => {
                                    setPlan(picked);
                                    go("workspaces");
                                }}
                                onShowPayments={(picked) => {
                                    setPeriod(picked);
                                    go("payments");
                                }}
                            />
                        </div>
                    )}
                    {opened.includes("workspaces") && (
                        <div hidden={tab !== "workspaces"}>
                            <WorkspacesTab onOpen={openPanel} plan={plan} setPlan={setPlan} />
                        </div>
                    )}
                    {opened.includes("users") && (
                        <div hidden={tab !== "users"}>
                            <UsersTab meId={meId} root={root} workspace={workspace} onClearWorkspace={() => setWorkspace(null)} />
                        </div>
                    )}
                    {opened.includes("payments") && (
                        <div hidden={tab !== "payments"}>
                            <PaymentsTab onOpen={openPanel} period={period} setPeriod={setPeriod} />
                        </div>
                    )}
                </div>
            </div>

            <SidePanel open={panelOpen} onClose={() => setPanelOpen(false)} wide>
                {panelId !== null && (
                    <WorkspacePanel
                        id={panelId}
                        onClose={() => setPanelOpen(false)}
                        onShowPeople={(picked) => {
                            setWorkspace(picked);
                            go("users");
                            setPanelOpen(false);
                        }}
                    />
                )}
            </SidePanel>
        </div>
    );
}

// Plain numbers, the big one first: how many companies, how they stand, and what they've paid.
// Each number opens the list behind it.
function OverviewTab({
    onOpen,
    onShowWorkspaces,
    onShowPayments,
}: {
    onOpen: (id: number) => void;
    onShowWorkspaces: (plan: PlanFilter | undefined) => void;
    onShowPayments: (period: PeriodFilter | undefined) => void;
}) {
    const query = useQuery({
        queryKey: ["site-admin", "overview"],
        queryFn: () => api.get<{ data: Overview }>("/site-admin/overview").then((res) => res.data.data),
    });

    if (query.isPending)
        return (
            <div className="mt-4">
                <SkeletonList rows={6} />
            </div>
        );
    if (query.isError) return <ErrorState title="Couldn't load the overview" error={query.error} onRetry={() => query.refetch()} retrying={query.isFetching} />;

    const { workspaces, revenue } = query.data;
    const plural = (n: number, word: string) => `${count(n)} ${word}${n === 1 ? "" : "s"}`;
    const tiles = [
        { label: "Revenue this month", value: rupees(revenue.thisMonth), detail: plural(revenue.thisMonthPayments, "payment"), open: () => onShowPayments("thisMonth") },
        { label: "Revenue in all", value: rupees(revenue.allTime), detail: `${plural(revenue.allTimePayments, "payment")} · ${count(query.data.payingCustomers)} paid at least once`, open: () => onShowPayments(undefined) },
        { label: "Companies", value: count(workspaces.total), detail: `${count(query.data.newThisMonth)} new this month`, open: () => onShowWorkspaces(undefined) },
        { label: "On Pro", value: count(workspaces.pro), detail: `${count(workspaces.trial)} on trial · ${count(workspaces.ended)} ended`, open: () => onShowWorkspaces("pro") },
    ];

    return (
        <div className="mt-4 space-y-6">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                {tiles.map((tile) => (
                    <button key={tile.label} type="button" onClick={tile.open} className="rounded-xl border border-line bg-surface px-4 py-3 text-left transition-colors hover:border-line-strong hover:bg-paper">
                        <span className="block text-sm text-muted">{tile.label}</span>
                        <span className="mt-1 block text-2xl font-semibold tabular-nums">{tile.value}</span>
                        <span className="mt-0.5 block text-sm text-faint">{tile.detail}</span>
                    </button>
                ))}
            </div>

            <EndingList title="Trials ending in the next 7 days" empty="No trial ends this week." rows={query.data.trialsEnding} onOpen={onOpen} />
            <EndingList title="Pro plans ending in the next 7 days" empty="No Pro plan ends this week." rows={query.data.proEnding} onOpen={onOpen} />
        </div>
    );
}

// The companies to follow up with: who they are, how big, and when it ends
function EndingList({ title, empty, rows, onOpen }: { title: string; empty: string; rows: Ending[]; onOpen: (id: number) => void }) {
    return (
        <section>
            <h2 className="mb-2 font-semibold">{title}</h2>
            {rows.length === 0 ? (
                <p className="rounded-xl border border-dashed border-line-strong px-4 py-6 text-center text-faint">{empty}</p>
            ) : (
                <ul className="divide-y divide-line-light rounded-xl border border-line bg-surface">
                    {rows.map((row) => (
                        <li key={row.id}>
                            <button type="button" onClick={() => onOpen(row.id)} className="flex w-full flex-wrap items-baseline gap-x-3 gap-y-0.5 px-3 py-2.5 text-left hover:bg-paper">
                                <span className="max-w-56 truncate font-medium">{row.name}</span>
                                <span className="min-w-0 flex-1 truncate text-sm text-faint">
                                    {row.owner?.email ?? "No owner"} · {count(row.users)} {row.users === 1 ? "person" : "people"}
                                </span>
                                {row.wantsPro && <span className="text-sm font-medium text-accent">Wants Pro {PRO_PLANS[row.wantsPro as BillingCycle]?.label.toLowerCase()}</span>}
                                <span className="shrink-0 text-sm tabular-nums text-muted">
                                    {row.daysLeft}d left · {formatDate(row.endsAt)}
                                </span>
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}

function UsersTab({ meId, root, workspace, onClearWorkspace }: { meId: number; root: boolean; workspace: { id: number; name: string } | null; onClearWorkspace: () => void }) {
    const queryClient = useQueryClient();
    const [type, setType] = useState<"owners" | "agents" | "admins" | undefined>(undefined);
    const list = useSearchPage<SiteUser>("users", "/site-admin/users", { organizationId: workspace?.id, type });
    const filtered = !!(list.search || type || workspace);

    // into their account; a full page load, since the whole app is theirs now (and the live connection reconnects as them)
    const logInAs = useMutation({
        mutationFn: (id: number) => api.post(`/site-admin/users/${id}`),
        onSuccess: () => {
            // eslint-disable-next-line @next/next/no-location-assign-relative-destination
            window.location.href = "/my-day";
        },
        onError: (error) => toast.error(errorMessage(error)),
    });
    const setSiteAdmin = useMutation({
        mutationFn: ({ id, siteAdmin }: { id: number; siteAdmin: boolean }) => api.put<{ message: string }>(`/site-admin/users/${id}`, { siteAdmin }),
        onSuccess: (res) => {
            toast.success(res.data.message);
            void queryClient.invalidateQueries({ queryKey: ["site-admin"] });
        },
        onError: (error) => toast.error(errorMessage(error)),
    });

    const data = list.query.data;
    return (
        <>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                <SearchInput value={list.typed} onChange={list.setTyped} placeholder="Search by name, email or company" />
                <Chips
                    label="Who"
                    value={type}
                    onChange={setType}
                    options={[
                        { value: undefined, label: "Everyone" },
                        { value: "owners", label: "Owners" },
                        { value: "agents", label: "Agents" },
                        { value: "admins", label: "Site admins" },
                    ]}
                />
                {workspace && (
                    <span className="flex h-7 items-center gap-1 self-start rounded-lg bg-accent-faint px-2 text-sm text-ink ring-1 ring-accent/30 ring-inset sm:self-auto">
                        In {workspace.name}
                        <button type="button" aria-label="Show every workspace" onClick={onClearWorkspace} className="text-faint hover:text-ink">
                            <IconX size={14} />
                        </button>
                    </span>
                )}
                {data && <span className="text-sm text-faint tabular-nums sm:ml-auto">{count(data.total)} users</span>}
            </div>

            <Results query={list.query} empty={filtered ? "Nobody matches this search and these filters." : "No users yet."}>
                {(rows: SiteUser[]) => (
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[640px] text-left">
                            <thead className="text-sm text-faint">
                                <tr className="border-b border-line-light">
                                    <th className="px-3 py-2 font-medium">User</th>
                                    <th className="px-3 py-2 font-medium">Company</th>
                                    <th className="px-3 py-2 font-medium">Role</th>
                                    <th className="w-28 px-3 py-2 font-medium">Joined</th>
                                    <th className="w-10" />
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((person) => {
                                    const isMe = person.id === meId;
                                    const admin = person.isSiteAdmin || person.isRootAdmin;
                                    // only a root can open another site admin's account (the API checks too)
                                    const mayLogIn = !isMe && (!admin || root);
                                    const mayToggle = root && !person.isRootAdmin;
                                    return (
                                        <tr key={person.id} className="border-b border-line-light last:border-b-0 hover:bg-paper">
                                            <td className="px-3 py-2.5">
                                                <div className="flex min-w-0 items-center gap-2.5">
                                                    <Avatar name={person.name} size="md" />
                                                    <div className="min-w-0">
                                                        <p className="flex items-center gap-1.5 font-medium">
                                                            <span className="truncate">{person.name}</span>
                                                            {isMe && <Pill tone="indigo">You</Pill>}
                                                            {person.isRootAdmin ? <Pill tone="red">Root admin</Pill> : person.isSiteAdmin && <Pill tone="red">Site admin</Pill>}
                                                        </p>
                                                        <p className="truncate text-sm text-muted">{person.email}</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="max-w-48 truncate px-3 py-2.5 text-muted">{person.organization.name}</td>
                                            <td className="px-3 py-2.5">
                                                <span className="flex items-center gap-1.5">
                                                    <Pill tone="indigo">{person.role.name}</Pill>
                                                    {person.isOwner && <Pill tone="amber">Owner</Pill>}
                                                </span>
                                            </td>
                                            <td className="px-3 py-2.5 text-faint">{formatDate(person.createdAt)}</td>
                                            <td className="px-1 py-2.5">
                                                {(mayLogIn || mayToggle) && (
                                                    <Dropdown
                                                        align="right"
                                                        buttonClassName="flex size-7 items-center justify-center rounded-lg text-faint hover:bg-fill hover:text-ink"
                                                        label={
                                                            <>
                                                                <IconDots size={16} />
                                                                <span className="sr-only">Actions for {person.name}</span>
                                                            </>
                                                        }
                                                    >
                                                        {(close) => (
                                                            <>
                                                                {mayLogIn && (
                                                                    <MenuItem onClick={() => { logInAs.mutate(person.id); close(); }}>
                                                                        <IconLogin2 size={16} /> Log in as {person.name.split(" ")[0]}
                                                                    </MenuItem>
                                                                )}
                                                                {mayToggle && (
                                                                    <MenuItem onClick={() => { setSiteAdmin.mutate({ id: person.id, siteAdmin: !person.isSiteAdmin }); close(); }}>
                                                                        {person.isSiteAdmin ? <IconShieldOff size={16} /> : <IconShieldStar size={16} />}
                                                                        {person.isSiteAdmin ? "Remove site admin" : "Make site admin"}
                                                                    </MenuItem>
                                                                )}
                                                            </>
                                                        )}
                                                    </Dropdown>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </Results>
            <Pager page={list.page} setPage={list.setPage} data={data} />
        </>
    );
}

const SORTS = [
    { value: "newest", label: "Newest first" },
    { value: "oldest", label: "Oldest first" },
    { value: "people", label: "Most people" },
    { value: "leads", label: "Most leads" },
];

function WorkspacesTab({ onOpen, plan, setPlan }: { onOpen: (id: number) => void; plan: PlanFilter | undefined; setPlan: (plan: PlanFilter | undefined) => void }) {
    const [sort, setSort] = useState("newest");
    const list = useSearchPage<Workspace>("workspaces", "/site-admin/workspaces", { plan, sort });
    const data = list.query.data;

    return (
        <>
            <div className="mt-3 flex flex-col gap-2 lg:flex-row lg:items-center">
                <SearchInput value={list.typed} onChange={list.setTyped} placeholder="Search company, owner or email" />
                <Chips
                    label="Plan"
                    value={plan}
                    onChange={setPlan}
                    options={[
                        { value: undefined, label: "All" },
                        { value: "trial", label: "Trial" },
                        { value: "pro", label: "Pro" },
                        { value: "ended", label: "Ended" },
                    ]}
                />
                <div className="w-40 shrink-0">
                    <Select value={sort} onChange={(value) => setSort(value || "newest")} options={SORTS} placeholder="Sort" />
                </div>
                {data && <span className="text-sm text-faint tabular-nums lg:ml-auto">{count(data.total)} workspaces</span>}
            </div>

            <Results query={list.query} empty={list.search || plan ? "No company matches this search and filter." : "No workspaces yet."}>
                {(rows: Workspace[]) => (
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[780px] text-left">
                            <thead className="text-sm text-faint">
                                <tr className="border-b border-line-light">
                                    <th className="px-3 py-2 font-medium">Company</th>
                                    <th className="px-3 py-2 font-medium">Owner</th>
                                    <th className="px-3 py-2 font-medium">Plan</th>
                                    <th className="w-20 px-3 py-2 text-right font-medium">Users</th>
                                    <th className="w-20 px-3 py-2 text-right font-medium">Leads</th>
                                    <th className="w-20 px-3 py-2 text-right font-medium">Deals</th>
                                    <th className="w-28 px-3 py-2 font-medium">Signed up</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((workspace) => (
                                    // the whole row opens the company's panel, where its plan and payments are managed
                                    <tr key={workspace.id} onClick={() => onOpen(workspace.id)} className="cursor-pointer border-b border-line-light last:border-b-0 hover:bg-paper">
                                        <td className="max-w-56 px-3 py-2.5">
                                            <button type="button" onClick={() => onOpen(workspace.id)} className="block max-w-full truncate text-left font-medium text-ink hover:underline">
                                                {workspace.name}
                                            </button>
                                        </td>
                                        <td className="max-w-56 px-3 py-2.5">
                                            {workspace.owner ? (
                                                <>
                                                    <p className="truncate">{workspace.owner.name}</p>
                                                    <p className="truncate text-sm text-faint">{workspace.owner.email}</p>
                                                </>
                                            ) : (
                                                <span className="text-light">—</span>
                                            )}
                                        </td>
                                        <td className="px-3 py-2.5">
                                            <PlanCell workspace={workspace} />
                                        </td>
                                        <td className="px-3 py-2.5 text-right tabular-nums">{count(workspace.counts.users)}</td>
                                        <td className="px-3 py-2.5 text-right tabular-nums">{count(workspace.counts.leads)}</td>
                                        <td className="px-3 py-2.5 text-right tabular-nums">{count(workspace.counts.deals)}</td>
                                        <td className="px-3 py-2.5 text-faint">{formatDate(workspace.createdAt)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </Results>
            <Pager page={list.page} setPage={list.setPage} data={data} />
        </>
    );
}

// Every payment, newest first: online ones with their Razorpay id, manual ones with their reference
function PaymentsTab({ onOpen, period, setPeriod }: { onOpen: (id: number) => void; period: PeriodFilter | undefined; setPeriod: (period: PeriodFilter | undefined) => void }) {
    const [method, setMethod] = useState<"RAZORPAY" | "MANUAL" | undefined>(undefined);
    const list = useSearchPage<PaymentRow & { organization: { id: number; name: string } }>("payments", "/site-admin/payments", { method, period });
    const data = list.query.data;

    return (
        <>
            <div className="mt-3 flex flex-col gap-2 lg:flex-row lg:items-center">
                <SearchInput value={list.typed} onChange={list.setTyped} placeholder="Search company, email, payment id or reference" />
                <Chips
                    label="Paid"
                    value={method}
                    onChange={setMethod}
                    options={[
                        { value: undefined, label: "All" },
                        { value: "RAZORPAY", label: "Online" },
                        { value: "MANUAL", label: "Manual" },
                    ]}
                />
                <Chips
                    label="When"
                    value={period}
                    onChange={setPeriod}
                    options={[
                        { value: undefined, label: "All time" },
                        { value: "thisMonth", label: "This month" },
                        { value: "lastMonth", label: "Last month" },
                    ]}
                />
                {data && (
                    <span className="text-sm text-faint tabular-nums lg:ml-auto">
                        {count(data.total)} {data.total === 1 ? "payment" : "payments"} · {rupees(data.sum ?? 0)}
                    </span>
                )}
            </div>

            <Results query={list.query} empty={list.search || method || period ? "No payment matches this search and these filters." : "No payments yet."}>
                {(rows) => (
                    <ul className="divide-y divide-line-light">
                        {rows.map((payment) => (
                            <PaymentLine key={payment.id} payment={payment} company={{ name: payment.organization.name, onOpen: () => onOpen(payment.organization.id) }} />
                        ))}
                    </ul>
                )}
            </Results>
            <Pager page={list.page} setPage={list.setPage} data={data} />
        </>
    );
}
