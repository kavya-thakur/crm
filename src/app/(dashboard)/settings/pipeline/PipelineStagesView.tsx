"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { IconArrowDown, IconArrowUp, IconPlus, IconTargetArrow, IconTrash } from "@tabler/icons-react";

import { api, errorMessage } from "@/lib/api/client";
import { SidePanel } from "@/components/SidePanel";
import { ConfirmDeleteModal } from "@/components/ListPage";
import { ColorSwatchPicker } from "@/components/ColorSwatchPicker";
import { ErrorState } from "@/components/ErrorState";
import { PageLoader, Spinner } from "@/components/Loader";
import { toast } from "@/components/Toast";
import { STAGE_COLORS } from "@/lib/stageColors";
import type { PipelineStage } from "@/app/(dashboard)/deals/shared";

interface OptionsResponse<T> {
    ok: boolean;
    data: T[];
}

export default function PipelineStagesView() {
    const queryClient = useQueryClient();
    // null = dialog closed, "new" = creating, a stage = editing it
    const [editing, setEditing] = useState<PipelineStage | "new" | null>(null);
    const [deletingStage, setDeletingStage] = useState<PipelineStage | null>(null);

    const stagesQuery = useQuery({
        queryKey: ["pipelineStage"],
        queryFn: () =>
            api.get<OptionsResponse<PipelineStage>>("/pipeline-stages").then((res) => res.data.data),
    });

    const stages = stagesQuery.data ?? [];

    const reorder = useMutation({
        mutationFn: (stageIds: number[]) => api.patch("/pipeline-stages/reorder", { stageIds }),
        // optimistic: the arrows should feel instant, not wait on a round trip
        onMutate: async (stageIds) => {
            await queryClient.cancelQueries({ queryKey: ["pipelineStage"] });
            const previous = queryClient.getQueryData<PipelineStage[]>(["pipelineStage"]);
            if (previous) {
                const byId = new Map(previous.map((stage) => [stage.id, stage]));
                queryClient.setQueryData(
                    ["pipelineStage"],
                    stageIds.map((id) => byId.get(id)).filter((stage): stage is PipelineStage => !!stage),
                );
            }
            return { previous };
        },
        onSuccess: () => toast.success("Stage order saved"),
        onError: (error, _stageIds, context) => {
            if (context?.previous) queryClient.setQueryData(["pipelineStage"], context.previous);
            toast.error(errorMessage(error));
        },
        onSettled: () => queryClient.invalidateQueries({ queryKey: ["pipelineStage"] }),
    });

    const remove = useMutation({
        mutationFn: (id: number) => api.delete(`/pipeline-stages/${id}`),
        onSuccess: () => {
            toast.success("Stage deleted");
            setDeletingStage(null);
            queryClient.invalidateQueries({ queryKey: ["pipelineStage"] });
        },
        onError: (error) => toast.error(errorMessage(error)),
    });

    function move(index: number, direction: -1 | 1) {
        const target = index + direction;
        if (target < 0 || target >= stages.length) return;

        const next = [...stages];
        [next[index], next[target]] = [next[target], next[index]];
        reorder.mutate(next.map((stage) => stage.id));
    }

    return (
        <div className="flex h-full flex-col">
            <header className="flex h-12 shrink-0 items-center gap-2 border-b border-line bg-paper px-3">
                <IconTargetArrow size={16} className="text-[#838383]" />
                <h1 className="font-semibold">Pipeline</h1>
                {stagesQuery.data && <span className="text-faint">{stagesQuery.data.length}</span>}

                <button
                    onClick={() => setEditing("new")}
                    className="ml-auto flex h-6 items-center gap-1 rounded-lg bg-accent px-2 font-medium text-on-accent hover:bg-accent-hover"
                >
                    <IconPlus size={14} />
                    New stage
                </button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto">
                <div className="mx-auto max-w-3xl px-6 py-8">
                    <h2 className="text-lg font-semibold">Pipeline stages</h2>
                    <p className="mt-1 text-muted">
                        The columns of the deals board, in the order they appear. A won or lost stage marks a deal as closed.
                    </p>

                    {stagesQuery.isPending && <PageLoader label="Loading stages" />}
                    {stagesQuery.isError && (
                        <ErrorState
                            title="Couldn't load stages"
                            error={stagesQuery.error}
                            onRetry={() => stagesQuery.refetch()}
                            retrying={stagesQuery.isFetching}
                        />
                    )}

                    {stagesQuery.data && (
                        <ul className="mt-6 overflow-hidden rounded-lg border border-line">
                            {stages.map((stage, index) => (
                                <li
                                    key={stage.id}
                                    className="flex h-12 items-center gap-3 border-b border-line-light px-3 last:border-b-0"
                                >
                                    <div className="flex flex-col">
                                        <button
                                            type="button"
                                            aria-label={`Move ${stage.name} up`}
                                            disabled={index === 0 || reorder.isPending}
                                            onClick={() => move(index, -1)}
                                            className="flex size-4 items-center justify-center text-faint hover:text-ink disabled:opacity-30"
                                        >
                                            <IconArrowUp size={12} />
                                        </button>
                                        <button
                                            type="button"
                                            aria-label={`Move ${stage.name} down`}
                                            disabled={index === stages.length - 1 || reorder.isPending}
                                            onClick={() => move(index, 1)}
                                            className="flex size-4 items-center justify-center text-faint hover:text-ink disabled:opacity-30"
                                        >
                                            <IconArrowDown size={12} />
                                        </button>
                                    </div>

                                    <button
                                        type="button"
                                        onClick={() => setEditing(stage)}
                                        className="flex min-w-0 flex-1 items-center gap-2 text-left"
                                    >
                                        <span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: stage.color }} />
                                        <span className="truncate font-medium">{stage.name}</span>
                                        {stage.isWon && <span className="rounded bg-app px-1.5 text-sm text-muted">Won</span>}
                                        {stage.isLost && <span className="rounded bg-app px-1.5 text-sm text-muted">Lost</span>}
                                    </button>

                                    <button
                                        type="button"
                                        aria-label={`Delete ${stage.name}`}
                                        onClick={() => setDeletingStage(stage)}
                                        className="flex size-7 items-center justify-center rounded-lg text-muted hover:bg-danger-soft hover:text-danger"
                                    >
                                        <IconTrash size={14} />
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>

            <SidePanel open={editing !== null} onClose={() => setEditing(null)}>
                {editing && <StageForm stage={editing === "new" ? null : editing} onDone={() => setEditing(null)} />}
            </SidePanel>

            <ConfirmDeleteModal
                open={deletingStage !== null}
                title={`Delete ${deletingStage?.name}?`}
                description="Deals in this stage must be moved or deleted first."
                pending={remove.isPending}
                onCancel={() => setDeletingStage(null)}
                onConfirm={() => deletingStage && remove.mutate(deletingStage.id)}
            />
        </div>
    );
}

interface StageFormProps {
    stage: PipelineStage | null;
    onDone: () => void;
}

// Create (stage = null) or edit a stage: name, color, and the won/lost flags
function StageForm({ stage, onDone }: StageFormProps) {
    const queryClient = useQueryClient();
    const [name, setName] = useState(stage?.name ?? "");
    const [color, setColor] = useState(stage?.color ?? STAGE_COLORS.sky);
    const [isWon, setIsWon] = useState(stage?.isWon ?? false);
    const [isLost, setIsLost] = useState(stage?.isLost ?? false);

    const save = useMutation({
        mutationFn: () => {
            const data = { name: name.trim(), color, isWon, isLost };
            return stage ? api.patch(`/pipeline-stages/${stage.id}`, data) : api.post("/pipeline-stages", data);
        },
        onSuccess: () => {
            toast.success(stage ? "Stage updated" : "Stage created");
            queryClient.invalidateQueries({ queryKey: ["pipelineStage"] });
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
                {stage ? "Edit stage" : "New stage"}
            </h2>

            <div className="space-y-3 px-5 py-4">
                <div>
                    <label htmlFor="stage-name" className="mb-1 block text-sm font-medium text-muted">
                        Name
                    </label>
                    <input
                        id="stage-name"
                        autoFocus
                        required
                        maxLength={50}
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Negotiation"
                        className="h-8 w-full rounded-lg border border-line px-2 outline-none placeholder:text-light focus:border-accent focus:ring-3 focus:ring-accent-soft"
                    />
                </div>

                <div>
                    <p className="mb-1.5 block text-sm font-medium text-muted">Color</p>
                    <ColorSwatchPicker value={color} onChange={setColor} />
                </div>

                <label className="flex items-center gap-2">
                    <input
                        type="checkbox"
                        checked={isWon}
                        onChange={(e) => {
                            setIsWon(e.target.checked);
                            if (e.target.checked) setIsLost(false);
                        }}
                        className="size-3.5 accent-accent"
                    />
                    Won stage
                </label>

                <label className="flex items-center gap-2">
                    <input
                        type="checkbox"
                        checked={isLost}
                        onChange={(e) => {
                            setIsLost(e.target.checked);
                            if (e.target.checked) setIsWon(false);
                        }}
                        className="size-3.5 accent-accent"
                    />
                    Lost stage
                </label>

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
                    {stage ? "Save" : "Create stage"}
                </button>
            </div>
        </form>
    );
}
