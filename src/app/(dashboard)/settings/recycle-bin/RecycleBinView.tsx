"use client";

import { useEffect, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { IconArrowBackUp, IconSearch, IconTrash, IconX } from "@tabler/icons-react";

import { api, errorMessage } from "@/lib/api/client";
import { timeAgo } from "@/lib/utils/format";
import { ConfirmDeleteModal } from "@/components/ListPage";
import { ErrorState } from "@/components/ErrorState";
import { SkeletonList, Spinner } from "@/components/Loader";
import { SectionIcon } from "@/components/SectionIcon";
import { toast } from "@/components/Toast";
import { trackBulkJob, type BulkProgress } from "../../BackgroundJobs";

type Entity = "lead" | "deal" | "contact";

interface BinItem {
    id: number;
    entity: Entity;
    recordId: number;
    name: string;
    deletedAt: string;
    deletedBy: { id: number; name: string } | null;
    // before it's gone for good
    daysLeft: number;
}

interface BinPage {
    data: BinItem[];
    total: number;
    pageSize: number;
    keepDays: number;
}

const TABS: { value: Entity | null; label: string }[] = [
    { value: null, label: "All" },
    { value: "lead", label: "Leads" },
    { value: "deal", label: "Deals" },
    { value: "contact", label: "Contacts" },
];

const KIND = {
    lead: { label: "Lead", section: "leads" },
    deal: { label: "Deal", section: "deals" },
    contact: { label: "Contact", section: "contacts" },
} as const;

// What a bulk action acts on: the ticked items, or everything the tab and search match
type Target = { ids: number[] } | { all: { entity?: Entity; search?: string } };

/**
 * Settings > Recycle bin: deleted leads, deals and contacts, kept 30 days so they can be put back.
 * 50 a page however big the bin is. Tick items (or "Select all 9,812") to restore or delete them
 * together; Empty bin deletes everything in the tab for good. Deleting forever is one quick query
 * on the server; restoring many runs in the background with a progress card.
 */
export default function RecycleBinView() {
    const queryClient = useQueryClient();
    const [entity, setEntity] = useState<Entity | null>(null);
    const [searchInput, setSearchInput] = useState("");
    const [search, setSearch] = useState("");
    const [page, setPage] = useState(1);
    // ticked items (across pages), or every item the tab and search match
    const [selected, setSelected] = useState<Set<number>>(new Set());
    const [allMatching, setAllMatching] = useState(false);
    // what "Delete forever" is about to delete, waiting for the confirm
    const [purging, setPurging] = useState<{ target: Target; count: number } | null>(null);

    const clearSelection = () => {
        setSelected(new Set());
        setAllMatching(false);
    };

    // search once typing pauses; a new search is a new set of items, so the selection goes
    useEffect(() => {
        const timer = setTimeout(() => {
            setSearch(searchInput.trim());
            setPage(1);
            setSelected(new Set());
            setAllMatching(false);
        }, 300);
        return () => clearTimeout(timer);
    }, [searchInput]);

    const query = useQuery({
        queryKey: ["recycle-bin", entity, search, page],
        queryFn: () => api.get<BinPage>("/recycle-bin", { params: { entity: entity ?? undefined, search: search || undefined, page } }).then((res) => res.data),
        placeholderData: keepPreviousData,
    });
    const bin = query.data;
    const pages = bin ? Math.max(1, Math.ceil(bin.total / bin.pageSize)) : 1;
    const shown = bin?.data ?? [];
    const pageTicked = shown.length > 0 && shown.every((item) => selected.has(item.id));
    const count = allMatching ? (bin?.total ?? 0) : selected.size;
    const target: Target = allMatching ? { all: { entity: entity ?? undefined, search: search || undefined } } : { ids: [...selected] };

    // the bin, and the lists things go back into (the server also tells everyone else's open pages)
    const refresh = () => {
        for (const key of ["recycle-bin", "leads", "lead", "deals", "deal", "contacts", "contact", "dashboard", "my-day", "tasks", "activities"]) {
            queryClient.invalidateQueries({ queryKey: [key] });
        }
    };

    const bulk = useMutation({
        mutationFn: (body: { action: "restore" | "purge" } & Target) =>
            api.post<{ message?: string; problems?: string[]; data?: BulkProgress }>("/recycle-bin/bulk", body),
        onSuccess: (res) => {
            clearSelection();
            setPurging(null);
            if (res.data.data) {
                // many to restore: a background job, with its card in the corner
                trackBulkJob(queryClient, res.data.data);
            } else {
                const problem = res.data.problems?.[0];
                if (problem) toast.warning(res.data.message ?? "Some couldn't go back", problem);
                else toast.success(res.data.message ?? "Done");
            }
            refresh();
        },
        onError: (error) => toast.error(errorMessage(error)),
    });

    const togglePage = () => {
        const next = new Set(selected);
        for (const item of shown) {
            if (pageTicked) next.delete(item.id);
            else next.add(item.id);
        }
        setAllMatching(false);
        setSelected(next);
    };
    const toggle = (id: number) => {
        const next = new Set(selected);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setAllMatching(false);
        setSelected(next);
    };

    return (
        <div className="flex h-full flex-col">
            <header className="flex h-12 shrink-0 items-center gap-2 border-b border-line bg-paper px-3">
                <SectionIcon section="recycleBin" size="md" />
                <h1 className="font-semibold">Recycle bin</h1>
                {bin && <span className="text-faint tabular-nums">{bin.total.toLocaleString("en-IN")}</span>}
                {/* everything in the tab, for good; not while searching, where "all" would be unclear */}
                {bin && bin.total > 0 && !search && (
                    <button
                        type="button"
                        onClick={() => setPurging({ target: { all: { entity: entity ?? undefined } }, count: bin.total })}
                        className="ml-auto flex h-8 items-center gap-1.5 rounded-lg border border-line px-3 font-medium text-danger hover:border-danger/30 hover:bg-danger-soft"
                    >
                        <IconTrash size={15} />
                        {entity ? `Delete all ${TABS.find((tab) => tab.value === entity)!.label.toLowerCase()}` : "Empty bin"}
                    </button>
                )}
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto">
                <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
                    <div className="flex items-start gap-4">
                        <SectionIcon section="recycleBin" size="lg" />
                        <div className="min-w-0 flex-1 pt-0.5">
                            <h2 className="text-[17px] leading-6 font-semibold tracking-[-0.01em]">Recycle bin</h2>
                            <p className="mt-0.5 text-muted">
                                Deleted leads, deals and contacts wait here for {bin?.keepDays ?? 30} days with their timeline, notes, tasks, calls and emails.
                                Restore one and it comes back exactly as it was. After that, it&apos;s gone for good.
                            </p>
                        </div>
                    </div>

                    <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:items-center">
                        <div className="flex gap-1 overflow-x-auto">
                            {TABS.map((tab) => (
                                <button
                                    key={tab.label}
                                    type="button"
                                    onClick={() => {
                                        setEntity(tab.value);
                                        setPage(1);
                                        clearSelection();
                                    }}
                                    className={`flex h-7 shrink-0 items-center rounded-lg px-2.5 ${tab.value === entity ? "bg-fill text-ink" : "text-muted hover:bg-app"}`}
                                >
                                    {tab.label}
                                </button>
                            ))}
                        </div>
                        <label className="flex h-8 items-center gap-1.5 rounded-lg border border-line bg-surface px-2 focus-within:border-accent sm:ml-auto sm:w-60">
                            <IconSearch size={14} className="shrink-0 text-faint" />
                            <input
                                value={searchInput}
                                onChange={(event) => setSearchInput(event.target.value)}
                                placeholder="Search by name"
                                aria-label="Search the recycle bin"
                                className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-light"
                            />
                        </label>
                    </div>

                    {query.isPending && (
                        <div className="mt-4">
                            <SkeletonList rows={6} />
                        </div>
                    )}
                    {query.isError && <ErrorState title="Couldn't load the recycle bin" error={query.error} onRetry={() => query.refetch()} retrying={query.isFetching} />}

                    {bin && bin.total === 0 && (
                        <p className="mt-4 rounded-xl border border-dashed border-line-strong px-4 py-10 text-center text-faint">
                            {search ? `Nothing in the bin matches "${search}".` : "The recycle bin is empty."}
                        </p>
                    )}

                    {bin && bin.total > 0 && (
                        <>
                            <div className="mt-4 overflow-hidden rounded-xl border border-line bg-surface">
                                {/* tick the page; with something ticked, what to do with it */}
                                <div className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 border-b border-line bg-paper px-3 py-1.5">
                                    <input type="checkbox" aria-label="Select this page" checked={pageTicked || allMatching} onChange={allMatching ? clearSelection : togglePage} className="size-3.5 accent-accent" />
                                    {count === 0 ? (
                                        <span className="text-sm text-faint">Select items to restore or delete them together</span>
                                    ) : (
                                        <>
                                            <span className="text-sm font-medium tabular-nums">{count.toLocaleString("en-IN")} selected</span>
                                            {!allMatching && pageTicked && bin.total > selected.size && (
                                                <button type="button" onClick={() => setAllMatching(true)} className="text-sm font-medium text-accent hover:underline">
                                                    Select all {bin.total.toLocaleString("en-IN")}
                                                </button>
                                            )}
                                            <div className="ml-auto flex items-center gap-1">
                                                <button
                                                    type="button"
                                                    disabled={bulk.isPending}
                                                    onClick={() => bulk.mutate({ action: "restore", ...target })}
                                                    className="flex h-7 items-center gap-1.5 rounded-lg px-2 font-medium text-ink hover:bg-fill disabled:opacity-60"
                                                >
                                                    {bulk.isPending && !purging ? <Spinner size={13} /> : <IconArrowBackUp size={15} />} Restore
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setPurging({ target, count })}
                                                    className="flex h-7 items-center gap-1.5 rounded-lg px-2 font-medium text-danger hover:bg-danger-soft"
                                                >
                                                    <IconTrash size={15} /> Delete forever
                                                </button>
                                                <button type="button" aria-label="Clear selection" onClick={clearSelection} className="flex size-7 items-center justify-center rounded-lg text-faint hover:bg-fill hover:text-ink">
                                                    <IconX size={15} />
                                                </button>
                                            </div>
                                        </>
                                    )}
                                </div>
                                <ul className={query.isPlaceholderData ? "opacity-60" : ""}>
                                    {bin.data.map((item) => (
                                        <BinRow key={item.id} item={item} ticked={allMatching || selected.has(item.id)} onTick={() => toggle(item.id)} />
                                    ))}
                                </ul>
                            </div>

                            {pages > 1 && (
                                <div className="mt-3 flex items-center justify-between gap-2 text-sm text-muted">
                                    <span>
                                        {((page - 1) * bin.pageSize + 1).toLocaleString("en-IN")}–{Math.min(page * bin.pageSize, bin.total).toLocaleString("en-IN")} of{" "}
                                        {bin.total.toLocaleString("en-IN")}
                                    </span>
                                    <div className="flex gap-2">
                                        <PageButton disabled={page === 1} onClick={() => setPage(page - 1)}>
                                            Previous
                                        </PageButton>
                                        <PageButton disabled={page >= pages} onClick={() => setPage(page + 1)}>
                                            Next
                                        </PageButton>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>

            <ConfirmDeleteModal
                open={purging !== null}
                title={`Delete ${purging?.count.toLocaleString("en-IN")} ${purging?.count === 1 ? "item" : "items"} forever?`}
                description="They and their history can't be brought back after this."
                error={bulk.isError && purging ? errorMessage(bulk.error) : undefined}
                pending={bulk.isPending}
                onCancel={() => setPurging(null)}
                onConfirm={() => purging && bulk.mutate({ action: "purge", ...purging.target })}
            />
        </div>
    );
}

// One deleted record: what it was, who deleted it and when, and Restore / Delete forever
function BinRow({ item, ticked, onTick }: { item: BinItem; ticked: boolean; onTick: () => void }) {
    const queryClient = useQueryClient();
    const [confirming, setConfirming] = useState(false);
    const kind = KIND[item.entity];
    const { daysLeft } = item;

    // the lists it goes back into refresh too (the server also tells everyone else's open pages)
    const refresh = () => {
        for (const key of ["recycle-bin", `${item.entity}s`, item.entity, "dashboard", "my-day", "tasks", "activities"]) {
            queryClient.invalidateQueries({ queryKey: [key] });
        }
    };

    const restore = useMutation({
        mutationFn: () => api.post<{ message: string }>(`/recycle-bin/${item.id}`),
        onSuccess: (res) => {
            toast.success(res.data.message);
            refresh();
        },
        onError: (error) => toast.error(errorMessage(error)),
    });

    const purge = useMutation({
        mutationFn: () => api.delete(`/recycle-bin/${item.id}`),
        onSuccess: () => {
            toast.success("Deleted forever");
            setConfirming(false);
            refresh();
        },
    });

    return (
        <li className={`flex items-center gap-3 border-b border-line-light px-3 py-2.5 last:border-b-0 ${ticked ? "bg-accent-faint" : ""}`}>
            <input type="checkbox" aria-label={`Select ${item.name}`} checked={ticked} onChange={onTick} className="size-3.5 shrink-0 accent-accent" />
            <SectionIcon section={kind.section} size="md" />
            <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{item.name || "(no name)"}</p>
                <p className="truncate text-sm text-faint">
                    {kind.label} · deleted {timeAgo(item.deletedAt)}
                    {item.deletedBy && ` by ${item.deletedBy.name}`}
                    <span className={daysLeft <= 3 ? "text-danger" : ""}> · {daysLeft === 0 ? "goes today" : `${daysLeft} days left`}</span>
                </p>
            </div>
            <button
                type="button"
                onClick={() => restore.mutate()}
                disabled={restore.isPending}
                className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-line px-2.5 font-medium text-ink hover:bg-fill disabled:opacity-60"
            >
                {restore.isPending ? <Spinner size={14} /> : <IconArrowBackUp size={15} />}
                <span className="hidden sm:inline">Restore</span>
            </button>
            <button
                type="button"
                aria-label={`Delete ${item.name} forever`}
                onClick={() => setConfirming(true)}
                className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-danger-soft hover:text-danger"
            >
                <IconTrash size={16} />
            </button>

            <ConfirmDeleteModal
                open={confirming}
                title={`Delete "${item.name}" forever?`}
                description="It and its history can't be brought back after this."
                error={purge.isError ? errorMessage(purge.error) : undefined}
                pending={purge.isPending}
                onCancel={() => setConfirming(false)}
                onConfirm={() => purge.mutate()}
            />
        </li>
    );
}

function PageButton({ disabled, onClick, children }: { disabled: boolean; onClick: () => void; children: React.ReactNode }) {
    return (
        <button type="button" disabled={disabled} onClick={onClick} className="h-8 rounded-lg border border-line px-3 font-medium text-muted hover:bg-fill disabled:opacity-50">
            {children}
        </button>
    );
}
