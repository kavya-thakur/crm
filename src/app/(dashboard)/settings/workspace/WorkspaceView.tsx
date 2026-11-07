"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";

import { api, errorMessage } from "@/lib/api/client";
import { CURRENCIES, formatMoneyIn } from "@/lib/utils/format";
import { Select } from "@/components/Select";
import { SectionIcon } from "@/components/SectionIcon";
import { Spinner } from "@/components/Loader";
import { toast } from "@/components/Toast";

// Settings > Workspace: settings for the whole workspace. For now, the currency amounts are shown in.
export default function WorkspaceView({ name, currency, demo }: { name: string; currency: string; demo: boolean }) {
    const [picked, setPicked] = useState(currency);

    const save = useMutation({
        mutationFn: () => api.patch("/workspace", { currency: picked }),
        onSuccess: () => {
            toast.success("Currency changed");
            // every amount on every page is formatted with it, so start the app afresh
            window.location.reload();
        },
        onError: (error) => toast.error(errorMessage(error)),
    });

    return (
        <div className="flex h-full flex-col">
            <header className="flex h-12 shrink-0 items-center gap-2 border-b border-line bg-paper px-3">
                <SectionIcon section="workspace" size="md" />
                <h1 className="font-semibold">Workspace</h1>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto">
                <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
                    <div className="flex items-start gap-4">
                        <SectionIcon section="workspace" size="lg" />
                        <div className="min-w-0 flex-1 pt-0.5">
                            <h2 className="text-[17px] leading-6 font-semibold tracking-[-0.01em]">{name}</h2>
                            <p className="mt-0.5 text-muted">Settings for everyone in this workspace.</p>
                        </div>
                    </div>

                    <section className="mt-8">
                        <h2 className="font-semibold">Currency</h2>
                        <p className="mt-0.5 mb-3 text-muted">
                            Deal amounts, the dashboard and emails show money in this currency. Amounts aren&apos;t converted: a deal of 50,000
                            stays 50,000, only its symbol and format change.
                        </p>

                        {demo ? (
                            <p className="rounded-lg bg-app px-3 py-2 text-muted">The demo workspace is shared by every visitor, so its currency stays rupees.</p>
                        ) : (
                            <div className="flex max-w-md flex-col gap-3 sm:flex-row sm:items-center">
                                <div className="min-w-0 flex-1">
                                    <Select
                                        value={picked}
                                        onChange={(code) => code && setPicked(code)}
                                        options={CURRENCIES.map((item) => ({ value: item.code, label: `${item.name} (${item.code})` }))}
                                        placeholder="Currency"
                                        searchable
                                    />
                                </div>
                                <button
                                    type="button"
                                    onClick={() => save.mutate()}
                                    disabled={picked === currency || save.isPending}
                                    className="flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-lg bg-accent px-3 font-medium text-on-accent hover:bg-accent-hover disabled:opacity-60"
                                >
                                    {save.isPending && <Spinner size={14} />}
                                    Save
                                </button>
                            </div>
                        )}
                        <p className="mt-2 text-sm text-faint">Looks like: {formatMoneyIn(250000, picked)}</p>
                    </section>
                </div>
            </div>
        </div>
    );
}
