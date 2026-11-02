"use client";

import { useState, type ReactNode } from "react";
import { useMutation, useQueries, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { IconAlertTriangle, IconCheck, IconChevronDown, IconGitMerge } from "@tabler/icons-react";

import { api, errorMessage } from "@/lib/api/client";
import { formatDate } from "@/lib/format";
import { SidePanel } from "./SidePanel";
import { Dropdown, MenuItem } from "./Dropdown";
import { Spinner } from "./Loader";
import { toast } from "./Toast";

// One field two copies can disagree on: how to compare it, and how to show it
export interface MergeFieldSpec<TRecord> {
    key: string;
    label: string;
    value: (record: TRecord) => string | number | null;
    show: (record: TRecord) => ReactNode;
}

export interface MergePair {
    keepId: number;
    duplicateId: number;
}

interface MergePanelProps<TRecord> {
    noun: "lead" | "deal";
    /** open while set: the record that stays, and the one merged into it */
    pair: MergePair | null;
    fields: MergeFieldSpec<TRecord>[];
    titleOf: (record: TRecord) => string;
    /** what else moves over, for the explanation ("notes, tasks, activities and the timeline") */
    moves: string;
    refresh: (queryClient: QueryClient) => void;
    onClose: () => void;
    onMerged: (keptId: number) => void;
}

/**
 * Two copies of the same record, side by side. Where they disagree, you pick the value to
 * keep; the rest is kept or filled in by itself. Merging moves everything attached to the
 * duplicate onto the record that stays, then deletes the duplicate. Never automatic: it
 * only happens when someone opens this and clicks Merge.
 */
export function MergePanel<TRecord extends { createdAt: string }>(props: MergePanelProps<TRecord>) {
    // the last pair, so the panel still has something to show while it slides out
    const [shown, setShown] = useState(props.pair);
    if (props.pair && props.pair !== shown) setShown(props.pair);

    return (
        <SidePanel open={props.pair !== null} onClose={props.onClose} wide>
            {shown && <MergeForm {...props} pair={shown} />}
        </SidePanel>
    );
}

function MergeForm<TRecord extends { createdAt: string }>({
    noun,
    pair: { keepId, duplicateId },
    fields,
    titleOf,
    moves,
    refresh,
    onClose,
    onMerged,
}: MergePanelProps<TRecord> & { pair: MergePair }) {
    const queryClient = useQueryClient();
    const [fromDuplicate, setFromDuplicate] = useState<string[]>([]);

    const [keptQuery, duplicateQuery] = useQueries({
        queries: [keepId, duplicateId].map((id) => ({
            queryKey: [noun, id],
            queryFn: () => api.get<{ data: TRecord }>(`/${noun}s/${id}`).then((res) => res.data.data),
        })),
    });
    const kept = keptQuery.data;
    const duplicate = duplicateQuery.data;

    const merge = useMutation({
        mutationFn: () => api.post(`/${noun}s/${keepId}/merge`, { duplicateId, fromDuplicate }),
        onSuccess: () => {
            toast.success(noun === "lead" ? "Leads merged" : "Deals merged");
            queryClient.removeQueries({ queryKey: [noun, duplicateId] });
            refresh(queryClient);
            onMerged(keepId);
        },
    });

    const choose = (field: string, useDuplicate: boolean) =>
        setFromDuplicate((current) => (useDuplicate ? [...current, field] : current.filter((key) => key !== field)));

    return (
        <div className="flex min-h-full flex-col">
            <header className="flex items-center gap-2 border-b border-line-light px-5 py-4">
                <IconGitMerge size={18} className="text-accent" />
                <h2 className="text-lg font-semibold">Merge duplicate {noun}s</h2>
            </header>

            {!kept || !duplicate ? (
                <div className="flex flex-1 items-center justify-center py-16">
                    {keptQuery.isError || duplicateQuery.isError ? (
                        <p className="text-danger">{errorMessage(keptQuery.error ?? duplicateQuery.error)}</p>
                    ) : (
                        <Spinner size={18} />
                    )}
                </div>
            ) : (
                <div className="flex-1 px-5 py-4">
                    <p className="text-muted">
                        Where they differ, pick what to keep. Everything else is kept, and blanks are filled in from the other copy. The {moves} of both end up
                        on one {noun}.
                    </p>

                    <div className="mt-5 grid grid-cols-[6.5rem_1fr_1fr] gap-x-2 gap-y-2">
                        <span />
                        <RecordHeading title={titleOf(kept)} createdAt={kept.createdAt} note="Stays" />
                        <RecordHeading title={titleOf(duplicate)} createdAt={duplicate.createdAt} note="Merged in, then deleted" />

                        {fields.map((field) => {
                            const mine = field.value(kept);
                            const theirs = field.value(duplicate);
                            const label = <span className="flex h-9 items-center text-sm text-faint">{field.label}</span>;

                            // nothing to choose: the same on both, or only one has it
                            if (mine === null || theirs === null || mine === theirs) {
                                const shownValue = mine === null && theirs === null ? <span className="text-light">Empty</span> : field.show(mine !== null ? kept : duplicate);
                                return (
                                    <div key={field.key} className="contents">
                                        {label}
                                        <span className="col-span-2 flex h-9 min-w-0 items-center gap-2 rounded-lg bg-paper px-3 text-muted">
                                            <span className="min-w-0 truncate">{shownValue}</span>
                                            {mine === null && theirs !== null && <span className="ml-auto shrink-0 text-sm text-faint">filled in</span>}
                                        </span>
                                    </div>
                                );
                            }

                            const useDuplicate = fromDuplicate.includes(field.key);
                            return (
                                <div key={field.key} role="radiogroup" aria-label={field.label} className="contents">
                                    {label}
                                    <Choice selected={!useDuplicate} onSelect={() => choose(field.key, false)}>
                                        {field.show(kept)}
                                    </Choice>
                                    <Choice selected={useDuplicate} onSelect={() => choose(field.key, true)}>
                                        {field.show(duplicate)}
                                    </Choice>
                                </div>
                            );
                        })}
                    </div>

                    <p className="mt-4 text-sm text-faint">Custom fields are combined too; where both have a value, the one from the {noun} that stays is kept.</p>

                    {merge.isError && (
                        <p role="alert" className="mt-4 rounded-lg bg-danger-soft px-3 py-2 text-danger">
                            {errorMessage(merge.error)}
                        </p>
                    )}
                </div>
            )}

            <footer className="sticky bottom-0 flex justify-end gap-2 border-t border-line-light bg-surface px-5 py-3">
                <button type="button" onClick={onClose} className="h-8 rounded-lg border border-fill bg-black/2 px-3 font-medium text-muted hover:bg-app">
                    Cancel
                </button>
                <button
                    type="button"
                    onClick={() => merge.mutate()}
                    disabled={!kept || !duplicate || merge.isPending}
                    className="flex h-8 items-center gap-1.5 rounded-lg bg-accent px-3 font-medium text-on-accent hover:bg-accent-hover disabled:opacity-60"
                >
                    {merge.isPending && <Spinner size={14} />}
                    {merge.isPending ? "Merging" : `Merge ${noun}s`}
                </button>
            </footer>
        </div>
    );
}

function RecordHeading({ title, createdAt, note }: { title: string; createdAt: string; note: string }) {
    return (
        <div className="min-w-0 rounded-lg border border-line-light px-3 py-2">
            <p className="truncate font-medium text-ink">{title}</p>
            <p className="truncate text-sm text-faint">
                {note} · added {formatDate(createdAt)}
            </p>
        </div>
    );
}

function Choice({ selected, onSelect, children }: { selected: boolean; onSelect: () => void; children: ReactNode }) {
    return (
        <button
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={onSelect}
            className={`flex h-9 min-w-0 items-center gap-2 rounded-lg border px-3 text-left transition-colors ${
                selected ? "border-accent bg-accent-faint text-ink" : "border-line text-muted hover:bg-paper hover:text-ink"
            }`}
        >
            <span className="min-w-0 flex-1 truncate">{children}</span>
            {selected && <IconCheck size={14} className="shrink-0 text-accent" />}
        </button>
    );
}

// The suggestion in a record's panel, always one line however many there are: one look-alike
// gets a Merge button, several get a "Review" menu to pick from. Only a suggestion; ignoring
// it keeps both.
export function DuplicateSuggestions({ matches, onMerge }: { matches: { id: number; title: string; detail: string }[]; onMerge: (duplicateId: number) => void }) {
    if (matches.length === 0) return null;
    const [first] = matches;
    const action = "flex h-7 shrink-0 items-center gap-1 rounded-lg px-2 text-sm font-medium text-[#8a5a00] hover:bg-[#fbe6bf]";

    return (
        <div role="status" className="mx-3 mt-3 flex h-10 items-center gap-2 rounded-lg border border-[#f5d090] bg-[#fff8eb] pr-1 pl-2.5">
            <IconAlertTriangle size={15} className="shrink-0 text-[#b06a00]" />
            <p className="min-w-0 flex-1 truncate text-sm text-[#8a5a00]">
                {matches.length === 1 ? (
                    <>
                        Possible duplicate: <span className="font-medium">{first.title}</span> · {first.detail}
                    </>
                ) : (
                    <span className="font-medium">{matches.length} possible duplicates</span>
                )}
            </p>

            {matches.length === 1 ? (
                <button type="button" onClick={() => onMerge(first.id)} className={action}>
                    <IconGitMerge size={14} />
                    Merge
                </button>
            ) : (
                <Dropdown align="right" buttonClassName={action} label={<>Review <IconChevronDown size={13} /></>}>
                    {(close) =>
                        matches.map((match) => (
                            <MenuItem
                                key={match.id}
                                onClick={() => {
                                    close();
                                    onMerge(match.id);
                                }}
                            >
                                <span className="min-w-0">
                                    <span className="block truncate text-ink">{match.title}</span>
                                    <span className="block truncate text-sm text-faint">{match.detail}</span>
                                </span>
                                <IconGitMerge size={14} className="ml-auto shrink-0 text-faint" />
                            </MenuItem>
                        ))
                    }
                </Dropdown>
            )}
        </div>
    );
}
