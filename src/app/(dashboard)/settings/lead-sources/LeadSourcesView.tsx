"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { IconArrowDown, IconArrowUp, IconPlus, IconTag, IconTrash } from "@tabler/icons-react";

import { api, errorMessage } from "@/lib/api/client";
import { SidePanel } from "@/components/SidePanel";
import { ConfirmDeleteModal } from "@/components/ListPage";
import { ColorSwatchPicker } from "@/components/ColorSwatchPicker";
import { ErrorState } from "@/components/ErrorState";
import { PageLoader, Spinner } from "@/components/Loader";
import { toast } from "@/components/Toast";
import { STAGE_COLORS } from "@/lib/stageColors";
import type { LeadSource } from "@/app/(dashboard)/leads/shared";

interface OptionsResponse<T> {
    ok: boolean;
    data: T[];
}

export default function LeadSourcesView() {
    const queryClient = useQueryClient();
    // null = dialog closed, "new" = creating, a source = editing it
    const [editing, setEditing] = useState<LeadSource | "new" | null>(null);
    const [deletingSource, setDeletingSource] = useState<LeadSource | null>(null);

    const sourcesQuery = useQuery({
        queryKey: ["leadSource"],
        queryFn: () => api.get<OptionsResponse<LeadSource>>("/lead-sources").then((res) => res.data.data),
    });

    const sources = sourcesQuery.data ?? [];

    const reorder = useMutation({
        mutationFn: (sourceIds: number[]) => api.patch("/lead-sources/reorder", { sourceIds }),
        // optimistic: the arrows should feel instant, not wait on a round trip
        onMutate: async (sourceIds) => {
            await queryClient.cancelQueries({ queryKey: ["leadSource"] });
            const previous = queryClient.getQueryData<LeadSource[]>(["leadSource"]);
            if (previous) {
                const byId = new Map(previous.map((source) => [source.id, source]));
                queryClient.setQueryData(
                    ["leadSource"],
                    sourceIds.map((id) => byId.get(id)).filter((source): source is LeadSource => !!source),
                );
            }
            return { previous };
        },
        onSuccess: () => toast.success("Source order saved"),
        onError: (error, _sourceIds, context) => {
            if (context?.previous) queryClient.setQueryData(["leadSource"], context.previous);
            toast.error(errorMessage(error));
        },
        onSettled: () => queryClient.invalidateQueries({ queryKey: ["leadSource"] }),
    });

    const remove = useMutation({
        mutationFn: (id: number) => api.delete(`/lead-sources/${id}`),
        onSuccess: () => {
            toast.success("Source deleted");
            setDeletingSource(null);
            queryClient.invalidateQueries({ queryKey: ["leadSource"] });
        },
        onError: (error) => toast.error(errorMessage(error)),
    });

    function move(index: number, direction: -1 | 1) {
        const target = index + direction;
        if (target < 0 || target >= sources.length) return;

        const next = [...sources];
        [next[index], next[target]] = [next[target], next[index]];
        reorder.mutate(next.map((source) => source.id));
    }

    return (
        <div className="flex h-full flex-col">
            <header className="flex h-12 shrink-0 items-center gap-2 border-b border-line bg-paper px-3">
                <IconTag size={16} className="text-[#838383]" />
                <h1 className="font-semibold">Lead Sources</h1>
                {sourcesQuery.data && <span className="text-faint">{sourcesQuery.data.length}</span>}

                <button
                    onClick={() => setEditing("new")}
                    className="ml-auto flex h-6 items-center gap-1 rounded-lg bg-accent px-2 font-medium text-on-accent hover:bg-accent-hover"
                >
                    <IconPlus size={14} />
                    New source
                </button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto">
                <div className="mx-auto max-w-3xl px-6 py-8">
                    <h2 className="text-lg font-semibold">Lead sources</h2>
                    <p className="mt-1 text-muted">
                        The options offered when picking where a lead came from, in the order they appear.
                    </p>

                    {sourcesQuery.isPending && <PageLoader label="Loading sources" />}
                    {sourcesQuery.isError && (
                        <ErrorState
                            title="Couldn't load sources"
                            error={sourcesQuery.error}
                            onRetry={() => sourcesQuery.refetch()}
                            retrying={sourcesQuery.isFetching}
                        />
                    )}

                    {sourcesQuery.data && (
                        <ul className="mt-6 overflow-hidden rounded-lg border border-line">
                            {sources.map((source, index) => (
                                <li
                                    key={source.id}
                                    className="flex h-12 items-center gap-3 border-b border-line-light px-3 last:border-b-0"
                                >
                                    <div className="flex flex-col">
                                        <button
                                            type="button"
                                            aria-label={`Move ${source.name} up`}
                                            disabled={index === 0 || reorder.isPending}
                                            onClick={() => move(index, -1)}
                                            className="flex size-4 items-center justify-center text-faint hover:text-ink disabled:opacity-30"
                                        >
                                            <IconArrowUp size={12} />
                                        </button>
                                        <button
                                            type="button"
                                            aria-label={`Move ${source.name} down`}
                                            disabled={index === sources.length - 1 || reorder.isPending}
                                            onClick={() => move(index, 1)}
                                            className="flex size-4 items-center justify-center text-faint hover:text-ink disabled:opacity-30"
                                        >
                                            <IconArrowDown size={12} />
                                        </button>
                                    </div>

                                    <button
                                        type="button"
                                        onClick={() => setEditing(source)}
                                        className="flex min-w-0 flex-1 items-center gap-2 text-left"
                                    >
                                        <span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: source.color }} />
                                        <span className="truncate font-medium">{source.name}</span>
                                    </button>

                                    <button
                                        type="button"
                                        aria-label={`Delete ${source.name}`}
                                        onClick={() => setDeletingSource(source)}
                                        className="flex size-7 items-center justify-center rounded-lg text-muted hover:bg-danger-soft hover:text-danger"
                                    >
                                        <IconTrash size={14} />
                                    </button>
                                </li>
                            ))}
                            {sources.length === 0 && (
                                <p className="px-3 py-6 text-center text-faint">No lead sources yet</p>
                            )}
                        </ul>
                    )}
                </div>
            </div>

            <SidePanel open={editing !== null} onClose={() => setEditing(null)}>
                {editing && <SourceForm source={editing === "new" ? null : editing} onDone={() => setEditing(null)} />}
            </SidePanel>

            <ConfirmDeleteModal
                open={deletingSource !== null}
                title={`Delete ${deletingSource?.name}?`}
                description="Leads using this source just lose it — they aren't blocked or deleted."
                pending={remove.isPending}
                onCancel={() => setDeletingSource(null)}
                onConfirm={() => deletingSource && remove.mutate(deletingSource.id)}
            />
        </div>
    );
}

interface SourceFormProps {
    source: LeadSource | null;
    onDone: () => void;
}

// Create (source = null) or edit a source: just a name and a color
function SourceForm({ source, onDone }: SourceFormProps) {
    const queryClient = useQueryClient();
    const [name, setName] = useState(source?.name ?? "");
    const [color, setColor] = useState(source?.color ?? STAGE_COLORS.sky);

    const save = useMutation({
        mutationFn: () => {
            const data = { name: name.trim(), color };
            return source ? api.patch(`/lead-sources/${source.id}`, data) : api.post("/lead-sources", data);
        },
        onSuccess: () => {
            toast.success(source ? "Source updated" : "Source created");
            queryClient.invalidateQueries({ queryKey: ["leadSource"] });
            onDone();
        },
    });

    return (
        <form
            onSubmit={(e) => {
                e.preventDefault();
                save.mutate();
            }}
        >
            <h2 className="border-b border-line-light px-5 py-4 text-lg font-semibold">
                {source ? "Edit source" : "New source"}
            </h2>

            <div className="space-y-3 px-5 py-4">
                <div>
                    <label htmlFor="source-name" className="mb-1 block text-sm font-medium text-muted">
                        Name
                    </label>
                    <input
                        id="source-name"
                        autoFocus
                        required
                        maxLength={50}
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Website"
                        className="h-8 w-full rounded-lg border border-line px-2 outline-none placeholder:text-light focus:border-accent focus:ring-3 focus:ring-accent-soft"
                    />
                </div>

                <div>
                    <p className="mb-1.5 block text-sm font-medium text-muted">Color</p>
                    <ColorSwatchPicker value={color} onChange={setColor} />
                </div>

                {save.isError && (
                    <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-danger">
                        {errorMessage(save.error)}
                    </p>
                )}
            </div>

            <div className="flex justify-end gap-2 border-t border-line-light px-5 py-3">
                <button
                    type="button"
                    onClick={onDone}
                    className="h-8 rounded-lg border border-fill bg-black/2 px-3 font-medium text-muted hover:bg-app"
                >
                    Cancel
                </button>
                <button
                    type="submit"
                    disabled={save.isPending}
                    className="flex h-8 items-center gap-1.5 rounded-lg bg-accent px-3 font-medium text-on-accent hover:bg-accent-hover disabled:opacity-60"
                >
                    {save.isPending && <Spinner size={14} />}
                    {source ? "Save" : "Create source"}
                </button>
            </div>
        </form>
    );
}
