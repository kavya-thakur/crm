"use client";

import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { IconPencil, IconSend, IconTrash } from "@tabler/icons-react";

import { api, errorMessage } from "@/lib/api/client";
import { Avatar } from "@/components/Avatar";
import { ErrorState } from "@/components/ErrorState";
import { SkeletonList, Spinner } from "@/components/Loader";
import { toast } from "@/components/Toast";
import { timeAgo } from "@/lib/format";
import type { AgentOption } from "./customFields";

type NoteEntity = "lead" | "deal" | "contact";

const ENTITY_PATHS: Record<NoteEntity, string> = {
    lead: "leads",
    deal: "deals",
    contact: "contacts",
};

interface Note {
    id: number;
    body: string;
    mentionedUserIds: number[];
    createdAt: string;
    author: { id: number; name: string; email: string };
}

export function NotesTab({
    entity,
    recordId,
    agents,
    meId,
}: {
    entity: NoteEntity;
    recordId: number;
    agents?: AgentOption[];
    meId: number;
}) {
    const queryClient = useQueryClient();
    const path = `/${ENTITY_PATHS[entity]}/${recordId}/notes`;
    const queryKey = [entity, recordId, "notes"];

    const notesQuery = useQuery({
        queryKey,
        queryFn: () => api.get<{ data: Note[] }>(path, { params: { page: 1, limit: 100 } }).then((res) => res.data.data),
    });

    function refresh() {
        queryClient.invalidateQueries({ queryKey });
    }

    return (
        <div className="flex flex-col gap-4">
            <NoteComposer
                agents={agents ?? []}
                submitLabel="Post"
                successMessage="Note posted"
                onSubmit={(body, mentionedUserIds) => api.post(path, { body, mentionedUserIds })}
                onDone={refresh}
            />

            {notesQuery.isPending && <SkeletonList rows={3} />}
            {notesQuery.isError && (
                <ErrorState
                    variant="inline"
                    title="Couldn't load notes"
                    error={notesQuery.error}
                    onRetry={() => notesQuery.refetch()}
                    retrying={notesQuery.isFetching}
                />
            )}
            {notesQuery.isSuccess && notesQuery.data.length === 0 && (
                <p className="text-light">No notes yet — write one above, or @mention a teammate to loop them in.</p>
            )}

            <ul className="flex flex-col gap-4">
                {notesQuery.data?.map((note) => (
                    <NoteItem
                        key={note.id}
                        note={note}
                        agents={agents ?? []}
                        isMine={note.author.id === meId}
                        notePath={`${path}/${note.id}`}
                        onChanged={refresh}
                    />
                ))}
            </ul>
        </div>
    );
}

function NoteItem({
    note,
    agents,
    isMine,
    notePath,
    onChanged,
}: {
    note: Note;
    agents: AgentOption[];
    isMine: boolean;
    notePath: string;
    onChanged: () => void;
}) {
    const [editing, setEditing] = useState(false);

    const remove = useMutation({
        mutationFn: () => api.delete(notePath),
        onSuccess: () => {
            toast.success("Note deleted");
            onChanged();
        },
    });

    if (editing) {
        return (
            <li>
                <NoteComposer
                    agents={agents}
                    initialBody={note.body}
                    initialMentions={note.mentionedUserIds
                        .map((id) => agents.find((agent) => agent.id === id))
                        .filter((agent): agent is AgentOption => !!agent)}
                    submitLabel="Save"
                    successMessage="Note updated"
                    autoFocus
                    onSubmit={(body, mentionedUserIds) => api.patch(notePath, { body, mentionedUserIds })}
                    onDone={() => { setEditing(false); onChanged(); }}
                    onCancel={() => setEditing(false)}
                />
            </li>
        );
    }

    return (
        <li className="flex gap-2.5">
            <Avatar name={note.author.name} />
            <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5">
                    <span className="font-medium text-ink">{note.author.name}</span>
                    <time dateTime={note.createdAt} title={new Date(note.createdAt).toLocaleString()} className="text-sm text-faint">
                        {timeAgo(note.createdAt)}
                    </time>

                    {isMine && (
                        <span className="ml-auto flex items-center gap-0.5">
                            <button
                                type="button"
                                aria-label="Edit note"
                                onClick={() => setEditing(true)}
                                className="flex size-6 items-center justify-center rounded text-faint hover:bg-fill hover:text-ink"
                            >
                                <IconPencil size={14} />
                            </button>
                            <button
                                type="button"
                                aria-label="Delete note"
                                onClick={() => remove.mutate()}
                                disabled={remove.isPending}
                                className="flex size-6 items-center justify-center rounded text-faint hover:bg-danger-soft hover:text-danger"
                            >
                                <IconTrash size={14} />
                            </button>
                        </span>
                    )}
                </p>

                <p className="whitespace-pre-wrap text-muted">{renderNoteBody(note.body, note.mentionedUserIds, agents)}</p>

                {remove.isError && <p role="alert" className="mt-1 text-sm text-danger">{errorMessage(remove.error)}</p>}
            </div>
        </li>
    );
}

// Shared by posting a new note and editing an existing one: a textarea where
// typing "@" opens a picker of agents to mention.
export function NoteComposer({
    agents,
    initialBody = "",
    initialMentions = [],
    submitLabel,
    successMessage,
    autoFocus,
    onSubmit,
    onDone,
    onCancel,
}: {
    agents: AgentOption[];
    initialBody?: string;
    initialMentions?: AgentOption[];
    submitLabel: string;
    // what the toast says once it's saved: "Note posted" or "Note updated"
    successMessage: string;
    autoFocus?: boolean;
    onSubmit: (body: string, mentionedUserIds: number[]) => Promise<unknown>;
    onDone: () => void;
    onCancel?: () => void;
}) {
    const [body, setBody] = useState(initialBody);
    // Every agent ever picked from the @ menu this session — at submit time,
    // only the ones whose "@Name" text is still actually present are kept.
    // ponytail: name-substring matching, not a real token/id embedded in the
    // text — two agents sharing a name, or a hand-typed "@Name", can misfire.
    // Upgrade path: a rich editor with atomic mention chips if that bites.
    const [mentioned, setMentioned] = useState<AgentOption[]>(initialMentions);
    const [suggestQuery, setSuggestQuery] = useState<string | null>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const submit = useMutation({
        mutationFn: () => {
            const mentionedUserIds = mentioned
                .filter((agent) => body.includes(`@${agent.name}`))
                .map((agent) => agent.id);
            return onSubmit(body.trim(), mentionedUserIds);
        },
        onSuccess: () => {
            toast.success(successMessage);
            setBody("");
            setMentioned([]);
            onDone();
        },
    });

    function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
        const value = e.target.value;
        setBody(value);

        const uptoCursor = value.slice(0, e.target.selectionStart ?? value.length);
        const match = uptoCursor.match(/@(\w*)$/);
        setSuggestQuery(match ? match[1] : null);
    }

    function pickAgent(agent: AgentOption) {
        const textarea = textareaRef.current;
        const cursor = textarea?.selectionStart ?? body.length;
        const before = body.slice(0, cursor).replace(/@(\w*)$/, `@${agent.name} `);
        const after = body.slice(cursor);

        setBody(before + after);
        setMentioned((prev) => [...prev, agent]);
        setSuggestQuery(null);

        requestAnimationFrame(() => {
            textarea?.focus();
            textarea?.setSelectionRange(before.length, before.length);
        });
    }

    const suggestions = suggestQuery === null
        ? []
        : agents.filter((agent) => agent.name.toLowerCase().includes(suggestQuery.toLowerCase()));

    return (
        <div className="relative rounded-lg border border-line bg-surface focus-within:border-accent focus-within:ring-3 focus-within:ring-accent-soft">
            <textarea
                ref={textareaRef}
                autoFocus={autoFocus}
                rows={2}
                value={body}
                onChange={handleChange}
                onBlur={() => setTimeout(() => setSuggestQuery(null), 150)}
                placeholder="Write a note... type @ to mention a teammate"
                className="w-full resize-none rounded-t-lg px-3 py-2 outline-none placeholder:text-light"
            />

            {suggestQuery !== null && suggestions.length > 0 && (
                <div className="absolute z-20 mt-1 w-56 max-h-48 overflow-y-auto rounded-lg border border-line bg-surface shadow-strong">
                    {suggestions.map((agent) => (
                        <button
                            key={agent.id}
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => pickAgent(agent)}
                            className="flex h-8 w-full items-center gap-2 px-2 text-left text-sm hover:bg-fill"
                        >
                            <Avatar name={agent.name} />
                            {agent.name}
                        </button>
                    ))}
                </div>
            )}

            {submit.isError && (
                <p role="alert" className="border-t border-line-light px-3 py-1.5 text-sm text-danger">
                    {errorMessage(submit.error)}
                </p>
            )}

            <div className="flex items-center justify-end gap-2 border-t border-line-light px-2 py-1.5">
                {onCancel && (
                    <button
                        type="button"
                        onClick={onCancel}
                        className="h-7 rounded-lg px-2.5 font-medium text-muted hover:bg-app"
                    >
                        Cancel
                    </button>
                )}
                <button
                    type="button"
                    disabled={!body.trim() || submit.isPending}
                    onClick={() => submit.mutate()}
                    className="flex h-7 items-center gap-1.5 rounded-lg bg-accent px-2.5 font-medium text-on-accent hover:bg-accent-hover disabled:opacity-60"
                >
                    {submit.isPending ? <Spinner size={14} /> : <IconSend size={14} />}
                    {submitLabel}
                </button>
            </div>
        </div>
    );
}

function escapeRegExp(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Highlights "@Name" for every agent this note actually mentions. Exported
// for the cross-entity notes feed, which renders note bodies the same way.
export function renderNoteBody(body: string, mentionedUserIds: number[], agents: AgentOption[]) {
    const names = mentionedUserIds
        .map((id) => agents.find((agent) => agent.id === id)?.name)
        .filter((name): name is string => !!name);

    if (names.length === 0) return body;

    const pattern = new RegExp(`(@(?:${names.map(escapeRegExp).join("|")}))`, "g");

    return body.split(pattern).map((part, index) =>
        names.some((name) => part === `@${name}`)
            ? <span key={index} className="font-medium text-accent">{part}</span>
            : <span key={index}>{part}</span>
    );
}
