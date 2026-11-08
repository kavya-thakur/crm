"use client";

import { useEffect, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { IconClockPlus, IconCrown, IconDots, IconLogin2, IconSearch, IconShieldOff, IconShieldStar, IconX } from "@tabler/icons-react";

import { api, errorMessage } from "@/lib/api/client";
import { formatDate } from "@/lib/utils/format";
import { BILLING_CYCLES, PRO_PLANS, type BillingCycle } from "@/lib/billing/plans";
import { Avatar } from "@/components/Avatar";
import { Dropdown, MenuItem } from "@/components/Dropdown";
import { ErrorState } from "@/components/ErrorState";
import { SkeletonList } from "@/components/Loader";
import { Pill } from "@/components/Pill";
import { SectionIcon } from "@/components/SectionIcon";
import { toast } from "@/components/Toast";

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

interface Page<T> {
    data: T[];
    total: number;
    pageSize: number;
    // workspaces whose owner asked for Pro
    waiting?: number;
}

const count = (value: number) => value.toLocaleString("en-IN");

/**
 * Settings > Site admin, for the people who run the website: every user and every workspace
 * (company) signed up, with "Log in as" anyone. A root admin (SITE_ADMIN_EMAILS) can also make
 * others site admins.
 */
export default function SiteAdminView({ meId, root }: { meId: number; root: boolean }) {
    const [tab, setTab] = useState<"users" | "workspaces">("users");
    // the Users tab narrowed to one workspace, picked on the Workspaces tab
    const [workspace, setWorkspace] = useState<{ id: number; name: string } | null>(null);

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
                        Everyone on the website, in every company. Log in as anyone to see what they see; nobody is notified. Only site admins see this page.
                    </p>

                    <div className="mt-5 flex gap-1">
                        {(["users", "workspaces"] as const).map((value) => (
                            <button
                                key={value}
                                type="button"
                                onClick={() => setTab(value)}
                                className={`flex h-7 items-center rounded-lg px-2.5 capitalize ${tab === value ? "bg-fill text-ink" : "text-muted hover:bg-app"}`}
                            >
                                {value}
                            </button>
                        ))}
                    </div>

                    {tab === "users" ? (
                        <UsersTab meId={meId} root={root} workspace={workspace} onClearWorkspace={() => setWorkspace(null)} />
                    ) : (
                        <WorkspacesTab
                            onOpen={(picked) => {
                                setWorkspace(picked);
                                setTab("users");
                            }}
                        />
                    )}
                </div>
            </div>
        </div>
    );
}

// A list with search and pages: what both tabs share
function useSearchPage<T>(key: string, endpoint: string, extra: Record<string, unknown> = {}) {
    const [typed, setTyped] = useState("");
    const [search, setSearch] = useState("");
    const [page, setPage] = useState(1);

    // search once typing pauses
    useEffect(() => {
        const timer = setTimeout(() => {
            setSearch(typed.trim());
            setPage(1);
        }, 300);
        return () => clearTimeout(timer);
    }, [typed]);

    const query = useQuery({
        queryKey: ["site-admin", key, search, page, extra],
        queryFn: () => api.get<Page<T>>(endpoint, { params: { search: search || undefined, page, ...extra } }).then((res) => res.data),
        placeholderData: keepPreviousData,
    });
    return { typed, setTyped, search, page, setPage, query };
}

function UsersTab({ meId, root, workspace, onClearWorkspace }: { meId: number; root: boolean; workspace: { id: number; name: string } | null; onClearWorkspace: () => void }) {
    const queryClient = useQueryClient();
    const list = useSearchPage<SiteUser>("users", "/site-admin/users", { organizationId: workspace?.id });

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

            <Results query={list.query} empty={list.search ? `No user matches "${list.search}".` : "No users yet."}>
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

function WorkspacesTab({ onOpen }: { onOpen: (workspace: { id: number; name: string }) => void }) {
    const queryClient = useQueryClient();
    // only the owners waiting for Pro to be switched on
    const [waitingOnly, setWaitingOnly] = useState(false);
    const list = useSearchPage<Workspace>("workspaces", "/site-admin/workspaces", { requested: waitingOnly ? "1" : undefined });
    const data = list.query.data;

    // they've paid: Pro on (or renewed); or more days to try it
    const changePlan = useMutation({
        mutationFn: ({ id, ...change }: { id: number; action: "activate" | "extendTrial"; cycle?: BillingCycle }) => api.put<{ message: string }>(`/site-admin/workspaces/${id}`, change),
        onSuccess: (res) => {
            toast.success(res.data.message);
            void queryClient.invalidateQueries({ queryKey: ["site-admin"] });
        },
        onError: (error) => toast.error(errorMessage(error)),
    });

    return (
        <>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                <SearchInput value={list.typed} onChange={list.setTyped} placeholder="Search companies" />
                <button
                    type="button"
                    onClick={() => setWaitingOnly(!waitingOnly)}
                    className={`flex h-8 items-center gap-1.5 self-start rounded-lg border px-2.5 text-sm font-medium sm:self-auto ${
                        waitingOnly ? "border-accent/40 bg-accent-faint text-ink" : "border-line text-muted hover:bg-fill"
                    }`}
                >
                    Waiting for Pro
                    {!!data?.waiting && <span className="rounded-full bg-accent px-1.5 text-xs text-on-accent tabular-nums">{data.waiting}</span>}
                </button>
                {data && <span className="text-sm text-faint tabular-nums sm:ml-auto">{count(data.total)} workspaces</span>}
            </div>

            <Results query={list.query} empty={list.search ? `No workspace matches "${list.search}".` : "No workspaces yet."}>
                {(rows: Workspace[]) => (
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[820px] text-left">
                            <thead className="text-sm text-faint">
                                <tr className="border-b border-line-light">
                                    <th className="px-3 py-2 font-medium">Company</th>
                                    <th className="px-3 py-2 font-medium">Owner</th>
                                    <th className="px-3 py-2 font-medium">Plan</th>
                                    <th className="w-20 px-3 py-2 text-right font-medium">Users</th>
                                    <th className="w-20 px-3 py-2 text-right font-medium">Leads</th>
                                    <th className="w-20 px-3 py-2 text-right font-medium">Deals</th>
                                    <th className="w-28 px-3 py-2 font-medium">Signed up</th>
                                    <th className="w-10" />
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((workspace) => (
                                    <tr
                                        key={workspace.id}
                                        onClick={() => onOpen(workspace)}
                                        className="cursor-pointer border-b border-line-light last:border-b-0 hover:bg-paper"
                                    >
                                        <td className="max-w-56 px-3 py-2.5">
                                            {/* its people, on the Users tab */}
                                            <button type="button" onClick={() => onOpen(workspace)} className="block max-w-full truncate text-left font-medium text-ink hover:underline">
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
                                        {/* its own menu: clicking it doesn't open the company */}
                                        <td className="px-1 py-2.5" onClick={(event) => event.stopPropagation()}>
                                            <Dropdown
                                                align="right"
                                                buttonClassName="flex size-7 items-center justify-center rounded-lg text-faint hover:bg-fill hover:text-ink"
                                                label={
                                                    <>
                                                        <IconDots size={16} />
                                                        <span className="sr-only">Plan for {workspace.name}</span>
                                                    </>
                                                }
                                            >
                                                {(close) => (
                                                    <>
                                                        {BILLING_CYCLES.map((cycle) => (
                                                            <MenuItem key={cycle} onClick={() => { changePlan.mutate({ id: workspace.id, action: "activate", cycle }); close(); }}>
                                                                <IconCrown size={16} />
                                                                {workspace.access.state === "pro" ? "Add" : "Activate"} Pro {PRO_PLANS[cycle].label.toLowerCase()}
                                                            </MenuItem>
                                                        ))}
                                                        <MenuItem onClick={() => { changePlan.mutate({ id: workspace.id, action: "extendTrial" }); close(); }}>
                                                            <IconClockPlus size={16} /> Extend the trial 7 days
                                                        </MenuItem>
                                                    </>
                                                )}
                                            </Dropdown>
                                        </td>
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

// Trial (days left), Pro (until when), or ended; and a waiting request
function PlanCell({ workspace }: { workspace: Workspace }) {
    const { state, endsAt, daysLeft } = workspace.access;
    return (
        <div className="flex flex-col items-start gap-0.5">
            {state === "pro" ? (
                <span className="text-sm">
                    <Pill tone="green">Pro</Pill> <span className="text-faint">until {endsAt && formatDate(endsAt)}</span>
                </span>
            ) : state === "trial" ? (
                <span className="text-sm">
                    <Pill tone="blue">Trial</Pill> <span className="text-faint">{daysLeft}d left</span>
                </span>
            ) : (
                <Pill tone="red">Ended</Pill>
            )}
            {workspace.planRequest && (
                <span className="text-sm font-medium text-accent">Wants Pro {PRO_PLANS[workspace.planRequest as BillingCycle]?.label.toLowerCase()}</span>
            )}
        </div>
    );
}

function SearchInput({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) {
    return (
        <label className="flex h-8 items-center gap-1.5 rounded-lg border border-line bg-surface px-2 focus-within:border-accent sm:w-80">
            <IconSearch size={14} className="shrink-0 text-faint" />
            <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-light" />
        </label>
    );
}

// Loading, failed, empty, or the rows
function Results<T>({
    query,
    empty,
    children,
}: {
    query: ReturnType<typeof useQuery<Page<T>>>;
    empty: string;
    children: (rows: T[]) => React.ReactNode;
}) {
    if (query.isPending)
        return (
            <div className="mt-4">
                <SkeletonList rows={8} />
            </div>
        );
    if (query.isError) return <ErrorState title="Couldn't load this" error={query.error} onRetry={() => query.refetch()} retrying={query.isFetching} />;
    if (query.data.total === 0) return <p className="mt-4 rounded-xl border border-dashed border-line-strong px-4 py-10 text-center text-faint">{empty}</p>;
    return <div className={`mt-3 rounded-xl border border-line bg-surface ${query.isPlaceholderData ? "opacity-60" : ""}`}>{children(query.data.data)}</div>;
}

function Pager<T>({ page, setPage, data }: { page: number; setPage: (page: number) => void; data: Page<T> | undefined }) {
    if (!data || data.total <= data.pageSize) return null;
    const pages = Math.ceil(data.total / data.pageSize);
    const button = "h-8 rounded-lg border border-line px-3 font-medium text-muted hover:bg-fill disabled:opacity-50";
    return (
        <div className="mt-3 flex items-center justify-between gap-2 text-sm text-muted">
            <span className="tabular-nums">
                {count((page - 1) * data.pageSize + 1)}–{count(Math.min(page * data.pageSize, data.total))} of {count(data.total)}
            </span>
            <div className="flex gap-2">
                <button type="button" disabled={page === 1} onClick={() => setPage(page - 1)} className={button}>
                    Previous
                </button>
                <button type="button" disabled={page >= pages} onClick={() => setPage(page + 1)} className={button}>
                    Next
                </button>
            </div>
        </div>
    );
}
