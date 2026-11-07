"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { IconPlus } from "@tabler/icons-react";

import { api, errorMessage } from "@/lib/api/client";
import { currencySymbol, formatMoneyExact } from "@/lib/utils/format";
import { ErrorState } from "@/components/ErrorState";
import { SkeletonList, Spinner } from "@/components/Loader";
import { Modal } from "@/components/Modal";
import { SectionIcon } from "@/components/SectionIcon";
import { toast } from "@/components/Toast";
import type { Product } from "../../deals/shared";

/**
 * Settings > Products: what the workspace sells, at its list price and tax. A deal's Products tab
 * picks from here to build its quote. A changed price is for new lines only: deals keep theirs.
 */
export default function ProductsView() {
    // null: closed; "new"; or the product being edited
    const [editing, setEditing] = useState<Product | "new" | null>(null);

    const products = useQuery({
        queryKey: ["products"],
        queryFn: () => api.get<{ data: Product[] }>("/products").then((res) => res.data.data),
    });

    return (
        <div className="flex h-full flex-col">
            <header className="flex h-12 shrink-0 items-center gap-2 border-b border-line bg-paper px-3">
                <SectionIcon section="products" size="md" />
                <h1 className="font-semibold">Products</h1>
                {products.data && <span className="text-faint tabular-nums">{products.data.length}</span>}
                <button
                    type="button"
                    onClick={() => setEditing("new")}
                    className="ml-auto flex h-8 items-center gap-1.5 rounded-lg bg-accent px-3 font-medium text-on-accent hover:bg-accent-hover"
                >
                    <IconPlus size={14} />
                    <span className="hidden sm:inline">New product</span>
                </button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto">
                <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
                    <p className="mb-4 text-muted">
                        What you sell. Add them to a deal from its Products tab to build a quote; the deal&apos;s amount then adds itself up.
                    </p>

                    {products.isPending && <SkeletonList rows={5} />}
                    {products.isError && <ErrorState title="Couldn't load products" error={products.error} onRetry={() => products.refetch()} retrying={products.isFetching} />}

                    {products.data?.length === 0 && (
                        <p className="rounded-xl border border-dashed border-line-strong px-4 py-10 text-center text-faint">No products yet. Add your first with New product.</p>
                    )}

                    {products.data && products.data.length > 0 && (
                        <table className="w-full table-fixed text-left">
                            <thead className="text-sm text-faint">
                                <tr className="border-b border-line-light">
                                    <th className="py-2 pr-3 font-medium">Product</th>
                                    <th className="w-32 px-3 py-2 text-right font-medium">Price</th>
                                    <th className="w-20 py-2 pl-3 text-right font-medium">Tax</th>
                                </tr>
                            </thead>
                            <tbody>
                                {products.data.map((product) => (
                                    <tr key={product.id} onClick={() => setEditing(product)} className="cursor-pointer border-b border-line-light hover:bg-paper">
                                        <td className="py-2.5 pr-3">
                                            <button type="button" onClick={() => setEditing(product)} className="block max-w-full truncate text-left font-medium text-ink hover:underline">
                                                {product.name}
                                            </button>
                                            {product.description && <span className="block truncate text-sm text-faint">{product.description}</span>}
                                        </td>
                                        <td className="px-3 py-2.5 text-right tabular-nums">{formatMoneyExact(Number(product.price))}</td>
                                        <td className="py-2.5 pl-3 text-right text-muted tabular-nums">{product.taxPercent ? `${product.taxPercent}%` : "—"}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>

            <Modal open={editing !== null} onClose={() => setEditing(null)}>
                {editing !== null && <ProductForm key={editing === "new" ? "new" : editing.id} product={editing === "new" ? null : editing} onDone={() => setEditing(null)} />}
            </Modal>
        </div>
    );
}

// New or edit; editing has Delete too
function ProductForm({ product, onDone }: { product: Product | null; onDone: () => void }) {
    const queryClient = useQueryClient();
    const [name, setName] = useState(product?.name ?? "");
    const [price, setPrice] = useState(product ? String(Number(product.price)) : "");
    const [tax, setTax] = useState(product ? String(product.taxPercent) : "18");
    const [description, setDescription] = useState(product?.description ?? "");

    const finish = (message: string) => {
        toast.success(message);
        void queryClient.invalidateQueries({ queryKey: ["products"] });
        onDone();
    };

    const save = useMutation({
        mutationFn: () => {
            const values = { name, price: Number(price), taxPercent: Number(tax || 0), description: description || null };
            return product ? api.put(`/products/${product.id}`, values) : api.post("/products", values);
        },
        onSuccess: () => finish(product ? "Product saved" : "Product added"),
    });
    const remove = useMutation({
        mutationFn: () => api.delete(`/products/${product!.id}`),
        onSuccess: () => finish("Product deleted"),
    });

    const input = "h-8 w-full rounded-lg border border-line bg-surface px-2 outline-none placeholder:text-light focus:border-accent focus:ring-3 focus:ring-accent-soft";
    const error = save.error ?? remove.error;

    return (
        <form
            noValidate
            onSubmit={(event) => {
                event.preventDefault();
                if (name.trim() && price !== "") save.mutate();
            }}
            className="flex flex-col gap-3 p-5"
        >
            <h2 className="text-lg font-semibold">{product ? "Edit product" : "New product"}</h2>
            <label className="block">
                <span className="mb-1 block text-sm font-medium text-muted">Name</span>
                <input autoFocus value={name} onChange={(event) => setName(event.target.value)} maxLength={200} placeholder="Annual licence" className={input} />
            </label>
            <div className="grid grid-cols-2 gap-3">
                <label className="block">
                    <span className="mb-1 block text-sm font-medium text-muted">Price ({currencySymbol()})</span>
                    <input type="number" min={0} step="any" value={price} onChange={(event) => setPrice(event.target.value)} placeholder="25000" className={input} />
                </label>
                <label className="block">
                    <span className="mb-1 block text-sm font-medium text-muted">Tax (GST/VAT %)</span>
                    <input type="number" min={0} max={100} step="any" value={tax} onChange={(event) => setTax(event.target.value)} placeholder="18" className={input} />
                </label>
            </div>
            <label className="block">
                <span className="mb-1 block text-sm font-medium text-muted">Description</span>
                <input value={description} onChange={(event) => setDescription(event.target.value)} maxLength={1000} placeholder="Optional" className={input} />
            </label>
            {product && <p className="text-sm text-faint">A new price is for deals it&apos;s added to from now on. Deals that have it keep theirs.</p>}

            {error && (
                <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-danger">
                    {errorMessage(error)}
                </p>
            )}

            <div className="mt-1 flex items-center gap-2">
                {product && (
                    <button
                        type="button"
                        onClick={() => remove.mutate()}
                        disabled={remove.isPending}
                        className="h-8 rounded-lg px-3 font-medium text-danger hover:bg-danger-soft disabled:opacity-60"
                    >
                        Delete
                    </button>
                )}
                <button type="button" onClick={onDone} className="ml-auto h-8 rounded-lg border border-line px-3 font-medium text-muted hover:bg-fill">
                    Cancel
                </button>
                <button
                    type="submit"
                    disabled={!name.trim() || price === "" || save.isPending}
                    className="flex h-8 items-center gap-1.5 rounded-lg bg-accent px-3 font-medium text-on-accent hover:bg-accent-hover disabled:opacity-60"
                >
                    {save.isPending && <Spinner size={14} />}
                    {product ? "Save" : "Add product"}
                </button>
            </div>
        </form>
    );
}
