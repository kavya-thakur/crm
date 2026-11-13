"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { IconBriefcase, IconChartBar, IconDotsVertical, IconLayoutKanban, IconPencil, IconPlus, IconTrash } from "@tabler/icons-react";

import { api, errorMessage } from "@/lib/api/client";
import { Dropdown, MenuItem } from "@/components/Dropdown";
import { ErrorState } from "@/components/ErrorState";
import { ConfirmDeleteModal } from "@/components/ListPage";
import { PageLoader, Spinner } from "@/components/Loader";
import { Modal } from "@/components/Modal";
import { Pill } from "@/components/Pill";
import { SectionIcon } from "@/components/SectionIcon";
import { StageBadge } from "@/components/StageBadge";
import { toast } from "@/components/Toast";
import { usePipelines, type Pipeline } from "../../deals/shared";
import { OptionListEditor, type OptionListConfig } from "../stages/OptionListEditor";

// The endpoint and cache key are per pipeline: filled in for the one picked
const PIPELINE_STAGES: OptionListConfig = {
    title: "Stages",
    description: "",
    endpoint: "/pipeline-stages",
    queryKey: ["pipelineStage"],
    // the deals board and every stage picker read all pipelines' stages, and the cards above their counts
    refreshes: ["pipelineStage", "pipelines"],
    flags: [
        { key: "isWon", word: "won", tone: "green" },
        { key: "isLost", word: "lost", tone: "red" },
    ],
    recordLabel: "Deal",
    recordIcon: IconBriefcase,
    fieldLabel: "Stage",
};

// What a pipeline is, in a sentence each, for someone setting up their first second one
const TIPS = [
    { icon: IconBriefcase, text: "Every deal is in one pipeline. Pick it when adding a deal, or move a deal from its panel." },
    { icon: IconLayoutKanban, text: "The Deals page shows one pipeline's board at a time, with a switcher at the top." },
    { icon: IconChartBar, text: "The dashboard and automations can look at one pipeline, or all of them together." },
];

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

/*
 * Settings > Pipelines: the workspace's deal boards ("New sales", "Renewals"), each a card with
 * its stages and deal count, and the picked one's stages to edit underneath. While a stage list
 * has unsaved edits the other cards wait (Save or Cancel first), so switching never loses them.
 */
export default function PipelinesView() {
    const queryClient = useQueryClient();
    const pipelinesQuery = usePipelines();
    const [pickedId, setPickedId] = useState<number | null>(null);
    const [dirty, setDirty] = useState(false);
    // the name dialog: open for a new pipeline (renaming null) or to rename one
    const [naming, setNaming] = useState(false);
    const [renaming, setRenaming] = useState<Pipeline | null>(null);
    const [deleting, setDeleting] = useState<Pipeline | null>(null);

    const refresh = () =>
        Promise.all([queryClient.invalidateQueries({ queryKey: ["pipelines"] }), queryClient.invalidateQueries({ queryKey: ["pipelineStage"] })]);

    const remove = useMutation({
        mutationFn: (pipeline: Pipeline) => api.delete(`/pipelines/${pipeline.id}`).then(() => pipeline),
        onSuccess: (pipeline) => {
            toast.success(`${pipeline.name} deleted`);
            // gone straight away; the first one is picked instead
            queryClient.setQueryData<Pipeline[]>(["pipelines"], (current) => current?.filter((item) => item.id !== pipeline.id));
            if (pickedId === pipeline.id) setPickedId(null);
            setDeleting(null);
            return refresh();
        },
        // "Move or delete the 3 deals in Renewals first": the server says why, word for word
        onError: (error) => {
            toast.error(errorMessage(error));
            setDeleting(null);
        },
    });

    function openNameDialog(target: Pipeline | null) {
        setRenaming(target);
        setNaming(true);
    }

    const pipelines = pipelinesQuery.data ?? [];
    // the one picked, or the first (also after the picked one is deleted)
    const pipeline = pipelines.find((item) => item.id === pickedId) ?? pipelines[0];
    const waitHint = dirty ? "Save or cancel your stage changes first" : undefined;

    return (
        <div className="flex h-full flex-col">
            <header className="flex h-12 shrink-0 items-center gap-2 border-b border-line bg-paper px-3">
                <SectionIcon section="pipelines" size="md" />
                <h1 className="font-display text-[15px] font-semibold tracking-[-0.01em]">Pipelines</h1>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto">
                <div className="mx-auto flex max-w-3xl flex-col gap-10 px-6 py-8">
                    <section>
                        <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0">
                                <h2 className="text-[17px] leading-6 font-semibold tracking-[-0.01em]">Pipelines</h2>
                                <p className="mt-0.5 text-muted">
                                    A pipeline is a deals board with its own stages, for one kind of sale. Most teams need just one. Add another when some
                                    deals go through different steps, like renewals or partnerships.
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => openNameDialog(null)}
                                disabled={dirty || !pipelinesQuery.isSuccess}
                                title={waitHint}
                                className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-accent px-3 font-medium text-on-accent hover:bg-accent-hover disabled:opacity-60"
                            >
                                <IconPlus size={15} />
                                New pipeline
                            </button>
                        </div>

                        <ul className="mt-4 flex flex-col gap-2 rounded-xl bg-app px-4 py-3">
                            {TIPS.map(({ icon: Icon, text }) => (
                                <li key={text} className="flex items-start gap-2.5 text-sm text-muted">
                                    <Icon size={16} className="mt-0.5 shrink-0 text-faint" />
                                    {text}
                                </li>
                            ))}
                        </ul>

                        <div className="mt-4">
                            {pipelinesQuery.isPending ? (
                                <PageLoader label="Loading pipelines" />
                            ) : pipelinesQuery.isError ? (
                                <ErrorState
                                    variant="inline"
                                    title="Couldn't load pipelines"
                                    error={pipelinesQuery.error}
                                    onRetry={() => pipelinesQuery.refetch()}
                                    retrying={pipelinesQuery.isFetching}
                                />
                            ) : (
                                <ul className="divide-y divide-line-light rounded-xl border border-line bg-surface">
                                    {pipelines.map((item) => (
                                        <PipelineRow
                                            key={item.id}
                                            pipeline={item}
                                            picked={item.id === pipeline?.id}
                                            waitHint={item.id === pipeline?.id ? undefined : waitHint}
                                            onPick={() => setPickedId(item.id)}
                                            onRename={() => openNameDialog(item)}
                                            // a workspace always keeps one pipeline
                                            onDelete={pipelines.length > 1 ? () => setDeleting(item) : undefined}
                                        />
                                    ))}
                                </ul>
                            )}
                        </div>
                    </section>

                    {pipeline && (
                        <section>
                            <h2 className="text-[17px] leading-6 font-semibold tracking-[-0.01em]">Stages in {pipeline.name}</h2>
                            <p className="mt-0.5 mb-4 text-muted">The columns of this pipeline&apos;s board, in order. A won or lost stage closes the deal.</p>
                            <OptionListEditor
                                // key: another pipeline is a fresh editor, with its own saved list and no leftover draft
                                key={pipeline.id}
                                config={{ ...PIPELINE_STAGES, endpoint: `/pipeline-stages?pipelineId=${pipeline.id}`, queryKey: ["pipelineStage", pipeline.id] }}
                                onDirtyChange={setDirty}
                            />
                        </section>
                    )}
                </div>
            </div>

            <Modal open={naming} onClose={() => setNaming(false)}>
                <PipelineNameForm
                    pipeline={renaming}
                    onDone={(saved) => {
                        setNaming(false);
                        if (!saved) return;
                        // show it straight away (a new one at the end, picked), then refetch for its counts
                        queryClient.setQueryData<Pipeline[]>(["pipelines"], (current) =>
                            current && (renaming ? current.map((item) => (item.id === saved.id ? { ...item, name: saved.name } : item)) : [...current, saved]),
                        );
                        if (!renaming) setPickedId(saved.id);
                        void refresh();
                    }}
                />
            </Modal>

            <ConfirmDeleteModal
                open={deleting !== null}
                title={`Delete ${deleting?.name}?`}
                description="Its stages go with it. A pipeline can only be deleted once it has no deals."
                pending={remove.isPending}
                onCancel={() => setDeleting(null)}
                onConfirm={() => deleting && remove.mutate(deleting)}
            />
        </div>
    );
}

// One pipeline's card: its name, how big it is, and its stages in order. Clicking it opens its
// stages below; the menu renames or deletes it.
function PipelineRow({
    pipeline,
    picked,
    waitHint,
    onPick,
    onRename,
    onDelete,
}: {
    pipeline: Pipeline;
    picked: boolean;
    waitHint?: string;
    onPick: () => void;
    onRename: () => void;
    onDelete?: () => void;
}) {
    const deals = pipeline.dealCount ?? 0;

    return (
        <li className={`flex items-start gap-2 px-3 py-3 first:rounded-t-xl last:rounded-b-xl ${picked ? "bg-paper" : ""}`}>
            <button
                type="button"
                onClick={onPick}
                disabled={waitHint !== undefined}
                title={waitHint}
                aria-current={picked}
                className="group flex min-w-0 flex-1 flex-col gap-2 text-left disabled:opacity-60"
            >
                <span className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-ink">{pipeline.name}</span>
                    <span className="text-sm text-faint">
                        {plural(pipeline.stages.length, "stage")} · {plural(deals, "deal")}
                    </span>
                    {picked ? <Pill tone="blue">Editing below</Pill> : <span className="text-sm text-faint group-enabled:group-hover:text-muted">Edit stages</span>}
                </span>
                <span className="flex flex-wrap gap-1">
                    {pipeline.stages.map((stage) => (
                        <StageBadge key={stage.id} name={stage.name} color={stage.color ?? "#6b7280"} />
                    ))}
                </span>
            </button>

            <Dropdown
                align="right"
                buttonClassName="flex size-7 shrink-0 items-center justify-center rounded-lg text-faint hover:bg-fill hover:text-ink"
                label={
                    <>
                        <IconDotsVertical size={15} />
                        <span className="sr-only">Options for {pipeline.name}</span>
                    </>
                }
            >
                {(close) => (
                    <>
                        <MenuItem
                            onClick={() => {
                                close();
                                onRename();
                            }}
                        >
                            <IconPencil size={15} /> Rename pipeline
                        </MenuItem>
                        {onDelete && (
                            <MenuItem
                                danger
                                onClick={() => {
                                    close();
                                    onDelete();
                                }}
                            >
                                <IconTrash size={15} /> Delete pipeline
                            </MenuItem>
                        )}
                    </>
                )}
            </Dropdown>
        </li>
    );
}

// Naming a new pipeline, or renaming one. A new one starts with a few stages to rename.
function PipelineNameForm({ pipeline, onDone }: { pipeline: Pipeline | null; onDone: (saved?: Pipeline) => void }) {
    const [name, setName] = useState(pipeline?.name ?? "");

    const save = useMutation({
        mutationFn: () =>
            (pipeline ? api.patch<{ data: Pipeline }>(`/pipelines/${pipeline.id}`, { name: name.trim() }) : api.post<{ data: Pipeline }>("/pipelines", { name: name.trim() })).then(
                (res) => res.data.data,
            ),
        onSuccess: (saved) => {
            toast.success(pipeline ? "Pipeline renamed" : `${saved.name} created`);
            onDone(saved);
        },
        // a taken name comes back as a 409 with the reason
        onError: (error) => toast.error(errorMessage(error)),
    });

    return (
        <form
            noValidate
            onSubmit={(event) => {
                event.preventDefault();
                if (name.trim()) save.mutate();
            }}
            className="flex flex-col gap-3 p-5"
        >
            <h2 className="text-lg font-semibold">{pipeline ? "Rename pipeline" : "New pipeline"}</h2>
            <label className="block">
                <span className="mb-1 block text-sm font-medium text-muted">Name</span>
                <input
                    autoFocus
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    maxLength={50}
                    placeholder="Renewals"
                    className="h-8 w-full rounded-lg border border-line bg-surface px-2 outline-none placeholder:text-light focus:border-accent focus:ring-3 focus:ring-accent-soft"
                />
            </label>
            {!pipeline && <p className="text-sm text-faint">It starts with New, Qualified, Won and Lost stages, to rename and add to.</p>}
            <div className="mt-1 flex justify-end gap-2">
                <button type="button" onClick={() => onDone()} className="h-8 rounded-lg border border-line px-3 font-medium text-muted hover:bg-fill">
                    Cancel
                </button>
                <button
                    type="submit"
                    disabled={!name.trim() || name.trim() === pipeline?.name || save.isPending}
                    className="flex h-8 items-center gap-1.5 rounded-lg bg-accent px-3 font-medium text-on-accent hover:bg-accent-hover disabled:opacity-60"
                >
                    {save.isPending && <Spinner size={14} />}
                    {pipeline ? "Rename" : "Create pipeline"}
                </button>
            </div>
        </form>
    );
}
