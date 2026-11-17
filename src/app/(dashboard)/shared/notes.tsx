"use client";

import { useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { IconPencil, IconSend, IconTrash } from "@tabler/icons-react";

import { api, errorMessage } from "@/lib/api/client";
import { Avatar } from "@/components/Avatar";
import { ErrorState } from "@/components/ErrorState";
import { ConfirmDeleteModal } from "@/components/ListPage";
import { SkeletonList, Spinner } from "@/components/Loader";
import { toast } from "@/components/Toast";
import { timeAgo } from "@/lib/utils/format";
import type { TimelineMetadata } from "@/lib/work/timeline";
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
    updatedAt: string;
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
                <p className="rounded-xl border border-dashed border-line-strong px-4 py-8 text-center text-faint">
                    No notes yet. Write one above, or @mention a teammate to loop them in.
                </p>
            )}

            <ul className="flex flex-col gap-3">
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
    const [deleting, setDeleting] = useState(false);

    const remove = useMutation({
        mutationFn: () => api.delete(notePath),
        onSuccess: () => {
            toast.success("Note deleted");
            setDeleting(false);
            onChanged();
        },
        onError: (error) => {
            toast.error(errorMessage(error));
            setDeleting(false);
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
        <li>
            <NoteCard
                author={note.author.name}
                createdAt={note.createdAt}
                // saved again a moment after it was written: an edit
                edited={new Date(note.updatedAt).getTime() - new Date(note.createdAt).getTime() > 1000}
                body={note.body}
                mentionedUserIds={note.mentionedUserIds}
                agents={agents}
                actions={
                    isMine && (
                        <>
                            <button
                                type="button"
                                aria-label="Edit note"
                                onClick={() => setEditing(true)}
                                className="flex size-7 items-center justify-center rounded-lg text-faint hover:bg-fill hover:text-ink"
                            >
                                <IconPencil size={15} />
                            </button>
                            <button
                                type="button"
                                aria-label="Delete note"
                                onClick={() => setDeleting(true)}
                                className="flex size-7 items-center justify-center rounded-lg text-faint hover:bg-danger-soft hover:text-danger"
                            >
                                <IconTrash size={15} />
                            </button>
                        </>
                    )
                }
            />
            <ConfirmDeleteModal
                open={deleting}
                title="Delete this note?"
                description="It's removed from the notes and the timeline. This can't be undone."
                pending={remove.isPending}
                onCancel={() => setDeleting(false)}
                onConfirm={() => remove.mutate()}
            />
        </li>
    );
}

// A note as a card: who wrote it and when (and whether it was edited), then the note itself.
// The Notes tab gives it edit and delete buttons, shown on hover (always on touch screens).
export function NoteCard({
    author,
    createdAt,
    edited,
    body,
    mentionedUserIds,
    agents,
    actions,
}: {
    author: string;
    createdAt: string;
    edited?: boolean;
    body: string;
    mentionedUserIds: number[];
    agents: AgentOption[];
    actions?: ReactNode;
}) {
    return (
        <article className="group rounded-xl border border-line bg-surface px-3.5 pt-2.5 pb-3 shadow-light">
            <header className="flex h-7 items-center gap-2">
                <Avatar name={author} />
                <span className="truncate font-medium text-ink">{author}</span>
                <time dateTime={createdAt} title={new Date(createdAt).toLocaleString()} className="shrink-0 text-sm text-faint">
                    {timeAgo(createdAt)}
                </time>
                {edited && <span className="shrink-0 text-sm text-faint">· edited</span>}
                {actions && (
                    <span className="ml-auto flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 [@media(hover:none)]:opacity-100">
                        {actions}
                    </span>
                )}
            </header>
            <NoteBody body={body} mentionedUserIds={mentionedUserIds} agents={agents} className="mt-1.5" />
        </article>
    );
}

// A note's text: as written (line breaks kept), @mentions as chips, a long one cut to six lines
// with "Show more"
export function NoteBody({ body, mentionedUserIds, agents, className = "" }: { body: string; mentionedUserIds: number[]; agents: AgentOption[]; className?: string }) {
    const [open, setOpen] = useState(false);
    const long = body.length > 360 || body.split("\n").length > 6;

    return (
        <div className={className}>
            <p className={`leading-6 break-words whitespace-pre-wrap text-ink ${long && !open ? "line-clamp-6" : ""}`}>
                {renderNoteBody(body, mentionedUserIds, agents)}
            </p>
            {long && (
                <button type="button" onClick={() => setOpen(!open)} className="mt-1 text-sm font-medium text-accent hover:underline">
                    {open ? "Show less" : "Show more"}
                </button>
            )}
        </div>
    );
}

// A note on a lead, deal or contact's timeline: the note itself, under "… added a note". Entries
// from before notes were kept whole only have the start of it ("Note added: …"), shown as it is.
export function TimelineNote({ entry, agents }: { entry: { message: string; metadata?: TimelineMetadata | null }; agents: AgentOption[] }) {
    const body = entry.metadata?.noteId ? entry.message : entry.message.replace(/^Note added: /, "");
    return (
        <div className="mt-2 rounded-xl border border-line bg-surface px-3.5 py-2.5 shadow-light">
            <NoteBody body={body} mentionedUserIds={entry.metadata?.mentionedUserIds ?? []} agents={agents} />
        </div>
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
                placeholder="Write a note…"
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
                <span className="mr-auto pl-1 text-sm text-faint">Type @ to mention a teammate</span>
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
            ? <span key={index} className="rounded bg-accent-soft px-1 font-medium text-accent">{part}</span>
            : <span key={index}>{part}</span>
    );
}
