"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { IconFileInvoice, IconPencilPlus, IconPlus, IconX } from "@tabler/icons-react";

import { api, errorMessage } from "@/lib/api/client";
import { lineAmounts, quoteTotals } from "@/lib/deals/quote";
import { formatMoneyExact } from "@/lib/utils/format";
import { Dropdown, MenuItem, SearchableItems } from "@/components/Dropdown";
import { toast } from "@/components/Toast";
import { refreshDeals, type DealLine, type Product } from "./shared";

/**
 * A deal's Products tab: what's being sold, as the lines of a quote. Pick from the catalogue
 * (Settings > Products) or add a one-off line, change quantity, price, discount or tax right in
 * the row, and the deal's amount becomes the total. "Quote" opens it as a page to print or save as PDF.
 */
export function DealProducts({ dealId, lines, editable, canManageCatalogue }: { dealId: number; lines: DealLine[]; editable: boolean; canManageCatalogue: boolean }) {
    const queryClient = useQueryClient();

    const catalogue = useQuery({
        queryKey: ["products"],
        queryFn: () => api.get<{ data: Product[] }>("/products").then((res) => res.data.data),
        enabled: editable,
    });

    const done = (message: string) => {
        toast.success(message);
        void refreshDeals(queryClient);
    };
    const onError = (error: Error) => toast.error(errorMessage(error));

    const add = useMutation({
        mutationFn: (line: { productId?: number; name?: string; price?: number }) => api.post(`/deals/${dealId}/products`, line),
        onSuccess: () => done("Product added"),
        onError,
    });
    const change = useMutation({
        mutationFn: ({ id, changes }: { id: number; changes: Partial<DealLine> }) => api.put(`/deals/${dealId}/products/${id}`, changes),
        onSuccess: () => done("Line saved"),
        onError,
    });
    const remove = useMutation({
        mutationFn: (id: number) => api.delete(`/deals/${dealId}/products/${id}`),
        onSuccess: () => done("Line removed"),
        onError,
    });

    const totals = quoteTotals(lines);
    const save = (line: DealLine, key: keyof DealLine, value: string | number) => {
        if (String(value) !== String(line[key])) change.mutate({ id: line.id, changes: { [key]: value } });
    };

    return (
        <div>
            <div className="mb-3 flex items-center gap-2">
                <p className="text-muted">
                    {lines.length === 0 ? "No products yet" : `${lines.length} ${lines.length === 1 ? "line" : "lines"}`}
                </p>
                {lines.length > 0 && (
                    <Link
                        href={`/quote/${dealId}`}
                        target="_blank"
                        className="ml-auto flex h-8 items-center gap-1.5 rounded-lg border border-line px-3 font-medium text-muted hover:bg-fill hover:text-ink"
                    >
                        <IconFileInvoice size={15} /> Quote
                    </Link>
                )}
            </div>

            {lines.length === 0 && (
                <p className="mb-3 rounded-xl border border-dashed border-line-strong px-4 py-6 text-center text-faint">
                    Add what you&apos;re selling to build a quote. The deal&apos;s amount then adds itself up.
                </p>
            )}

            {lines.length > 0 && (
                // wide enough for its numbers; scrolls sideways on a phone
                <div className="-mx-1 overflow-x-auto">
                    <table className="w-full min-w-[560px] text-left">
                        <thead className="text-sm text-faint">
                            <tr className="border-b border-line-light">
                                <th className="px-1 py-1.5 font-medium">Product</th>
                                <th className="w-16 px-1 py-1.5 text-right font-medium">Qty</th>
                                <th className="w-28 px-1 py-1.5 text-right font-medium">Price</th>
                                <th className="w-18 px-1 py-1.5 text-right font-medium">Disc. %</th>
                                <th className="w-16 px-1 py-1.5 text-right font-medium">Tax %</th>
                                <th className="w-28 px-1 py-1.5 text-right font-medium">Total</th>
                                {editable && <th className="w-8" />}
                            </tr>
                        </thead>
                        <tbody>
                            {lines.map((line) => (
                                <tr key={line.id} className="border-b border-line-light">
                                    <td className="px-1 py-1">
                                        <Cell value={line.name} editable={editable} onSave={(value) => value.trim() && save(line, "name", value.trim())} />
                                    </td>
                                    <td className="px-1 py-1">
                                        <Cell number value={line.quantity} editable={editable} onSave={(value) => Number(value) >= 1 && save(line, "quantity", Math.round(Number(value)))} />
                                    </td>
                                    <td className="px-1 py-1">
                                        <Cell number value={Number(line.price)} editable={editable} onSave={(value) => value !== "" && Number(value) >= 0 && save(line, "price", Number(value))} />
                                    </td>
                                    <td className="px-1 py-1">
                                        <Cell number value={line.discountPercent} editable={editable} onSave={(value) => percent(value) !== null && save(line, "discountPercent", percent(value)!)} />
                                    </td>
                                    <td className="px-1 py-1">
                                        <Cell number value={line.taxPercent} editable={editable} onSave={(value) => percent(value) !== null && save(line, "taxPercent", percent(value)!)} />
                                    </td>
                                    <td className="px-1 py-1 text-right font-medium tabular-nums">{formatMoneyExact(lineAmounts(line).total)}</td>
                                    {editable && (
                                        <td className="py-1 text-right">
                                            <button
                                                type="button"
                                                aria-label={`Remove ${line.name}`}
                                                onClick={() => remove.mutate(line.id)}
                                                className="flex size-7 items-center justify-center rounded-lg text-faint hover:bg-danger-soft hover:text-danger"
                                            >
                                                <IconX size={14} />
                                            </button>
                                        </td>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            <div className="mt-3 flex flex-col-reverse gap-3 sm:flex-row sm:items-start">
                {editable && (
                    <Dropdown
                        buttonClassName="flex h-8 items-center gap-1.5 rounded-lg px-2 font-medium text-muted hover:bg-fill hover:text-ink"
                        label={
                            <>
                                <IconPlus size={15} /> Add product
                            </>
                        }
                    >
                        {(close) => (
                            <>
                                {catalogue.data && catalogue.data.length > 0 && (
                                    <SearchableItems items={catalogue.data} label={(product) => product.name}>
                                        {(product) => (
                                            <MenuItem key={product.id} onClick={() => { add.mutate({ productId: product.id }); close(); }}>
                                                <span className="truncate">{product.name}</span>
                                                <span className="ml-auto pl-3 text-faint tabular-nums">{formatMoneyExact(Number(product.price))}</span>
                                            </MenuItem>
                                        )}
                                    </SearchableItems>
                                )}
                                {catalogue.data?.length === 0 && (
                                    <p className="px-1.5 py-1 text-sm text-faint">
                                        {canManageCatalogue ? (
                                            <Link href="/settings/products" className="text-accent hover:underline">
                                                Add your products in Settings
                                            </Link>
                                        ) : (
                                            "No products in the catalogue yet"
                                        )}
                                    </p>
                                )}
                                {/* something not in the catalogue: a line to fill in right in the table */}
                                <MenuItem onClick={() => { add.mutate({ name: "New item", price: 0 }); close(); }}>
                                    <IconPencilPlus size={16} /> One-off line
                                </MenuItem>
                            </>
                        )}
                    </Dropdown>
                )}

                {lines.length > 0 && (
                    <dl className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-1 tabular-nums sm:ml-auto sm:min-w-64">
                        <dt className="text-muted">Subtotal</dt>
                        <dd className="text-right">{formatMoneyExact(totals.gross)}</dd>
                        {totals.discount > 0 && (
                            <>
                                <dt className="text-muted">Discount</dt>
                                <dd className="text-right">−{formatMoneyExact(totals.discount)}</dd>
                            </>
                        )}
                        <dt className="text-muted">Tax</dt>
                        <dd className="text-right">{formatMoneyExact(totals.tax)}</dd>
                        <dt className="border-t border-line-light pt-1 font-semibold">Total</dt>
                        <dd className="border-t border-line-light pt-1 text-right font-semibold">{formatMoneyExact(totals.total)}</dd>
                    </dl>
                )}
            </div>
        </div>
    );
}

// 0 to 100, or null for anything else
function percent(value: string) {
    const number = Number(value);
    return value !== "" && number >= 0 && number <= 100 ? number : null;
}

// A table cell you type into; saves when you leave it or press Enter, Esc puts it back
function Cell({ value, editable, number, onSave }: { value: string | number; editable: boolean; number?: boolean; onSave: (value: string) => void }) {
    const align = number ? "text-right tabular-nums" : "";
    if (!editable) return <span className={`block truncate px-1 ${align}`}>{value}</span>;

    return (
        <input
            // a new value from the server (someone else's change, or the save) resets what's typed
            key={String(value)}
            defaultValue={value}
            type={number ? "number" : "text"}
            min={number ? 0 : undefined}
            step="any"
            aria-label="Edit"
            onBlur={(event) => onSave(event.target.value)}
            onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
                if (event.key === "Escape") {
                    // only the edit, not the whole panel
                    event.stopPropagation();
                    event.currentTarget.value = String(value);
                    event.currentTarget.blur();
                }
            }}
            className={`h-7 w-full min-w-0 rounded-md border border-transparent bg-transparent px-1 outline-none hover:border-line focus:border-accent focus:bg-surface ${align}`}
        />
    );
}
