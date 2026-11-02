"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { IconPencil, IconTrash } from "@tabler/icons-react";

import { api, errorMessage } from "@/lib/api/client";
import { Avatar } from "@/components/Avatar";
import { Board, BoardCard, BoardColumn, CardControl, ColumnTitle } from "@/components/Board";
import { toast } from "@/components/Toast";
import { timeAgo } from "@/lib/format";
import { NoteComposer, renderNoteBody } from "../shared/notes";
import type { AgentOption } from "../shared/customFields";
import type { NoteFeedEntity, NoteFeedItem } from "@/app/api/notes/route";

const COLUMN_LIMIT = 50;

export const NOTE_ENTITIES: Record<NoteFeedEntity, { label: string; color: string; href: string; path: string }> = {
    lead: { label: "Lead notes", color: "#ce2c31", href: "/leads", path: "/leads" },
    deal: { label: "Deal notes", color: "#218358", href: "/deals", path: "/deals" },
    contact: { label: "Contact notes", color: "#3a5bc7", href: "/contacts", path: "/contacts" },
};

// Notes in three columns, one per kind of record. A note can't move to another kind of
// record, so there's no dragging; your own notes can be edited or deleted right on the card.
export default function NotesBoard({
    scope,
    entities,
    meId,
    agents,
}: {
    scope: string;
    entities: NoteFeedEntity[];
    meId: number;
    agents: AgentOption[];
}) {
    return (
        <Board>
            {entities.map((entity) => (
                <EntityColumn key={entity} entity={entity} scope={scope} meId={meId} agents={agents} />
            ))}
        </Board>
    );
}

function EntityColumn({ entity, scope, meId, agents }: { entity: NoteFeedEntity; scope: string; meId: number; agents: AgentOption[] }) {
    const router = useRouter();
    const meta = NOTE_ENTITIES[entity];

    const notesQuery = useQuery({
        queryKey: ["notes-feed", scope, entity],
        queryFn: () =>
            api.get<{ data: NoteFeedItem[] }>("/notes", { params: { scope, entity, limit: COLUMN_LIMIT } }).then((res) => res.data.data),
    });

    const notes = notesQuery.data ?? [];

    return (
        <BoardColumn
            id={entity}
            title={<ColumnTitle color={meta.color}>{meta.label}</ColumnTitle>}
            count={notesQuery.data?.length}
            loading={notesQuery.isPending}
            error={notesQuery.error}
            onRetry={() => notesQuery.refetch()}
            emptyText="No notes"
        >
            {notes.map((note) => (
                <NoteCard
                    key={note.id}
                    note={note}
                    isMine={note.author.id === meId}
                    agents={agents}
                    onOpen={() => router.push(`${meta.href}?open=${note.recordId}`)}
                />
            ))}
            {notes.length === COLUMN_LIMIT && <p className="py-1 text-center text-sm text-faint">Showing the latest {COLUMN_LIMIT}</p>}
        </BoardColumn>
    );
}

function NoteCard({ note, isMine, agents, onOpen }: { note: NoteFeedItem; isMine: boolean; agents: AgentOption[]; onOpen: () => void }) {
    const queryClient = useQueryClient();
    const [editing, setEditing] = useState(false);
    const notePath = `${NOTE_ENTITIES[note.entity].path}/${note.recordId}/notes/${note.id}`;

    // the feed, and the record's own Notes tab, both show this note
    function refresh() {
        queryClient.invalidateQueries({ queryKey: ["notes-feed"] });
        queryClient.invalidateQueries({ queryKey: [note.entity] });
    }

    const remove = useMutation({
        mutationFn: () => api.delete(notePath),
        onSuccess: () => {
            toast.success("Note deleted");
            refresh();
        },
        onError: (error) => toast.error(errorMessage(error)),
    });

    return (
        <BoardCard id={note.id} columnId={note.entity} onOpen={editing ? undefined : onOpen}>
            <div className="flex items-center gap-2">
                <Avatar name={note.author.name} size="md" />
                <div className="min-w-0 flex-1 leading-tight">
                    <p className="truncate font-medium text-ink">{isMine ? "You" : note.author.name}</p>
                    <time dateTime={note.createdAt} title={new Date(note.createdAt).toLocaleString()} className="text-sm text-faint">
                        {timeAgo(note.createdAt)}
                    </time>
                </div>
                {isMine && !editing && (
                    <CardControl className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover/card:opacity-100 focus-within:opacity-100">
                        <button
                            type="button"
                            aria-label="Edit note"
                            onClick={() => setEditing(true)}
                            className="flex size-7 items-center justify-center rounded-md text-faint hover:bg-fill hover:text-ink"
                        >
                            <IconPencil size={14} />
                        </button>
                        <button
                            type="button"
                            aria-label="Delete note"
                            onClick={() => remove.mutate()}
                            disabled={remove.isPending}
                            className="flex size-7 items-center justify-center rounded-md text-faint hover:bg-danger-soft hover:text-danger"
                        >
                            <IconTrash size={14} />
                        </button>
                    </CardControl>
                )}
            </div>

            {editing ? (
                <CardControl className="mt-2">
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
                        onDone={() => {
                            setEditing(false);
                            refresh();
                        }}
                        onCancel={() => setEditing(false)}
                    />
                </CardControl>
            ) : (
                <p className="mt-2.5 line-clamp-6 whitespace-pre-wrap text-muted">{renderNoteBody(note.body, note.mentionedUserIds, agents)}</p>
            )}

            {/* what it's about: the record it's on */}
            <p className="mt-3 flex items-center gap-1.5 border-t border-line-light pt-2 text-sm text-faint">
                <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: NOTE_ENTITIES[note.entity].color }} />
                <span className="truncate font-medium text-muted">{note.recordLabel}</span>
            </p>
        </BoardCard>
    );
}
