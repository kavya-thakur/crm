"use client";

import { useEffect, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { IconPlus, IconSearch } from "@tabler/icons-react";

import { api, errorMessage } from "@/lib/api/client";
import { formatMoney } from "@/lib/utils/format";
import { ErrorState } from "@/components/ErrorState";
import { SkeletonList, Spinner } from "@/components/Loader";
import { Modal } from "@/components/Modal";
import { SectionIcon } from "@/components/SectionIcon";
import { toast } from "@/components/Toast";
import { useUrlState } from "../shared/useUrlState";
import CompanyPanel from "./CompanyPanel";
import { websiteLabel, type CompanyPermissions } from "./shared";

interface CompanyRow {
    id: number;
    name: string;
    website: string | null;
    industry: string | null;
    contacts: number;
    // null: no permission to see deals
    deals: { open: number; openValue: number; wonValue: number } | null;
}

interface CompaniesPage {
    data: CompanyRow[];
    total: number;
    pageSize: number;
}

const count = (value: number) => value.toLocaleString("en-IN");

/**
 * Companies: who your contacts work for, A to Z, with each company's contacts, open deals and
 * revenue won. Filled in by itself as leads with a company name come in; open one for its people
 * and deals (?open=12, like the other pages, so a link or refresh keeps it open).
 */
export default function CompaniesView({ can }: { can: CompanyPermissions }) {
    const page = useUrlState();
    const openId = Number(page.get("open")) || null;
    const setOpen = (id: number | null) => page.set({ open: id ? String(id) : null }, "push");

    const [searchInput, setSearchInput] = useState("");
    const [search, setSearch] = useState("");
    const [pageNumber, setPageNumber] = useState(1);
    const [creating, setCreating] = useState(false);

    // search once typing pauses
    useEffect(() => {
        const timer = setTimeout(() => {
            setSearch(searchInput.trim());
            setPageNumber(1);
        }, 300);
        return () => clearTimeout(timer);
    }, [searchInput]);

    const query = useQuery({
        queryKey: ["companies", search, pageNumber],
        queryFn: () => api.get<CompaniesPage>("/companies", { params: { search: search || undefined, page: pageNumber } }).then((res) => res.data),
        placeholderData: keepPreviousData,
    });
    const list = query.data;
    const pages = list ? Math.max(1, Math.ceil(list.total / list.pageSize)) : 1;
    const seesDeals = list?.data.some((company) => company.deals !== null) ?? false;

    if (openId !== null) {
        return <CompanyPanel key={openId} companyId={openId} can={can} onClose={() => setOpen(null)} />;
    }

    return (
        <div className="flex h-full flex-col">
            <header className="flex h-12 shrink-0 items-center gap-2 border-b border-line bg-paper px-3">
                <SectionIcon section="companies" size="md" />
                <h1 className="font-semibold">Companies</h1>
                {list && <span className="text-faint tabular-nums">{count(list.total)}</span>}
                {can.create && (
                    <button
                        type="button"
                        onClick={() => setCreating(true)}
                        className="ml-auto flex h-8 items-center gap-1.5 rounded-lg bg-accent px-3 font-medium text-on-accent hover:bg-accent-hover"
                    >
                        <IconPlus size={14} />
                        <span className="hidden sm:inline">New company</span>
                    </button>
                )}
            </header>

            <div className="flex h-11 shrink-0 items-center border-b border-line-light px-3">
                <label className="flex h-8 w-full items-center gap-1.5 rounded-lg px-1 sm:w-72">
                    <IconSearch size={15} className="shrink-0 text-faint" />
                    <input
                        value={searchInput}
                        onChange={(event) => setSearchInput(event.target.value)}
                        placeholder="Search companies or industries"
                        aria-label="Search companies"
                        className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-light"
                    />
                </label>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
                {query.isPending && (
                    <div className="p-4">
                        <SkeletonList rows={8} />
                    </div>
                )}
                {query.isError && <ErrorState title="Couldn't load companies" error={query.error} onRetry={() => query.refetch()} retrying={query.isFetching} />}

                {list && list.total === 0 && (
                    <p className="m-4 rounded-xl border border-dashed border-line-strong px-4 py-10 text-center text-faint">
                        {search
                            ? `No company matches "${search}".`
                            : "No companies yet. They appear here by themselves as leads with a company name come in, or add one with New company."}
                    </p>
                )}

                {list && list.total > 0 && (
                    <table className={`w-full table-fixed text-left ${query.isPlaceholderData ? "opacity-60" : ""}`}>
                        <thead className="sticky top-0 z-1 bg-surface text-sm text-faint">
                            <tr className="border-b border-line-light">
                                <th className="px-4 py-2 font-medium">Company</th>
                                <th className="hidden w-40 px-3 py-2 font-medium md:table-cell">Industry</th>
                                <th className="w-24 px-3 py-2 text-right font-medium">Contacts</th>
                                {seesDeals && <th className="hidden w-44 px-3 py-2 text-right font-medium sm:table-cell">Open deals</th>}
                                {seesDeals && <th className="hidden w-36 px-4 py-2 text-right font-medium lg:table-cell">Won</th>}
                            </tr>
                        </thead>
                        <tbody>
                            {list.data.map((company) => (
                                <tr key={company.id} onClick={() => setOpen(company.id)} className="cursor-pointer border-b border-line-light hover:bg-paper">
                                    <td className="px-4 py-2.5">
                                        <button type="button" onClick={() => setOpen(company.id)} className="block max-w-full truncate text-left font-medium text-ink hover:underline">
                                            {company.name}
                                        </button>
                                        {company.website && <span className="block truncate text-sm text-faint">{websiteLabel(company.website)}</span>}
                                    </td>
                                    <td className="hidden truncate px-3 py-2.5 text-muted md:table-cell">{company.industry ?? <span className="text-light">—</span>}</td>
                                    <td className="px-3 py-2.5 text-right text-muted tabular-nums">{count(company.contacts)}</td>
                                    {seesDeals && (
                                        <td className="hidden px-3 py-2.5 text-right tabular-nums sm:table-cell">
                                            {company.deals?.open ? (
                                                <>
                                                    <span className="font-medium text-ink">{formatMoney(company.deals.openValue)}</span>
                                                    <span className="text-faint"> · {count(company.deals.open)}</span>
                                                </>
                                            ) : (
                                                <span className="text-light">—</span>
                                            )}
                                        </td>
                                    )}
                                    {seesDeals && (
                                        <td className="hidden px-4 py-2.5 text-right tabular-nums lg:table-cell">
                                            {company.deals?.wonValue ? <span className="font-medium text-success">{formatMoney(company.deals.wonValue)}</span> : <span className="text-light">—</span>}
                                        </td>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}

                {list && pages > 1 && (
                    <div className="flex items-center justify-between gap-2 px-4 py-3 text-sm text-muted">
                        <span>
                            {count((pageNumber - 1) * list.pageSize + 1)}–{count(Math.min(pageNumber * list.pageSize, list.total))} of {count(list.total)}
                        </span>
                        <div className="flex gap-2">
                            <button
                                type="button"
                                disabled={pageNumber === 1}
                                onClick={() => setPageNumber(pageNumber - 1)}
                                className="h-8 rounded-lg border border-line px-3 font-medium hover:bg-fill disabled:opacity-50"
                            >
                                Previous
                            </button>
                            <button
                                type="button"
                                disabled={pageNumber >= pages}
                                onClick={() => setPageNumber(pageNumber + 1)}
                                className="h-8 rounded-lg border border-line px-3 font-medium hover:bg-fill disabled:opacity-50"
                            >
                                Next
                            </button>
                        </div>
                    </div>
                )}
            </div>

            <Modal open={creating} onClose={() => setCreating(false)}>
                <NewCompanyForm
                    onDone={(id) => {
                        setCreating(false);
                        if (id) setOpen(id);
                    }}
                />
            </Modal>
        </div>
    );
}

// Name, website and industry; the rest is filled in on the company's page
function NewCompanyForm({ onDone }: { onDone: (id?: number) => void }) {
    const queryClient = useQueryClient();
    const [name, setName] = useState("");
    const [website, setWebsite] = useState("");
    const [industry, setIndustry] = useState("");

    const create = useMutation({
        mutationFn: () => api.post<{ data: { id: number } }>("/companies", { name, website: website || null, industry: industry || null }),
        onSuccess: (res) => {
            toast.success("Company created");
            queryClient.invalidateQueries({ queryKey: ["companies"] });
            onDone(res.data.data.id);
        },
    });

    const input = "h-8 w-full rounded-lg border border-line bg-surface px-2 outline-none placeholder:text-light focus:border-accent focus:ring-3 focus:ring-accent-soft";

    return (
        <form
            noValidate
            onSubmit={(event) => {
                event.preventDefault();
                if (name.trim()) create.mutate();
            }}
            className="flex flex-col gap-3 p-5"
        >
            <h2 className="text-lg font-semibold">New company</h2>
            <label className="block">
                <span className="mb-1 block text-sm font-medium text-muted">Name</span>
                <input autoFocus value={name} onChange={(event) => setName(event.target.value)} maxLength={200} placeholder="Acme Industries" className={input} />
            </label>
            <label className="block">
                <span className="mb-1 block text-sm font-medium text-muted">Website</span>
                <input value={website} onChange={(event) => setWebsite(event.target.value)} maxLength={255} placeholder="acme.com" className={input} />
            </label>
            <label className="block">
                <span className="mb-1 block text-sm font-medium text-muted">Industry</span>
                <input value={industry} onChange={(event) => setIndustry(event.target.value)} maxLength={100} placeholder="Manufacturing" className={input} />
            </label>
            {create.isError && (
                <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-danger">
                    {errorMessage(create.error)}
                </p>
            )}
            <div className="mt-1 flex justify-end gap-2">
                <button type="button" onClick={() => onDone()} className="h-8 rounded-lg border border-line px-3 font-medium text-muted hover:bg-fill">
                    Cancel
                </button>
                <button
                    type="submit"
                    disabled={!name.trim() || create.isPending}
                    className="flex h-8 items-center gap-1.5 rounded-lg bg-accent px-3 font-medium text-on-accent hover:bg-accent-hover disabled:opacity-60"
                >
                    {create.isPending && <Spinner size={14} />}
                    Create company
                </button>
            </div>
        </form>
    );
}
