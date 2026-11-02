"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { IconAddressBook, IconCurrencyRupee, IconTargetArrow } from "@tabler/icons-react";

import { api } from "@/lib/api/client";
import { Avatar } from "@/components/Avatar";
import { SectionIcon } from "@/components/SectionIcon";
import { ViewSwitcher } from "@/components/ListPage";
import { ErrorState } from "@/components/ErrorState";
import { SkeletonList } from "@/components/Loader";
import { timeAgo } from "@/lib/utils/format";
import { renderNoteBody } from "../shared/notes";
import type { AgentOption } from "../shared/customFields";
import type { NoteFeedEntity, NoteFeedItem } from "@/app/api/notes/route";
import NotesBoard from "./NotesBoard";

const ENTITY_META: Record<NoteFeedEntity, { label: string; icon: typeof IconTargetArrow; href: string }> = {
    lead: { label: "Lead", icon: IconTargetArrow, href: "/leads" },
    deal: { label: "Deal", icon: IconCurrencyRupee, href: "/deals" },
    contact: { label: "Contact", icon: IconAddressBook, href: "/contacts" },
};

type Scope = "all" | "mentions" | "mine";

const SCOPES: { value: Scope; label: string }[] = [
    { value: "all", label: "All" },
    { value: "mentions", label: "Mentioning me" },
    { value: "mine", label: "My notes" },
];

const EMPTY_MESSAGE: Record<Scope, string> = {
    all: "No notes yet",
    mentions: "No one has @mentioned you yet",
    mine: "You haven't written any notes yet",
};

export default function NotesView({ meId, entities }: { meId: number; entities: NoteFeedEntity[] }) {
    const [view, setView] = useState<"table" | "board">("table");
    const [scope, setScope] = useState<Scope>("all");

    const notesQuery = useQuery({
        queryKey: ["notes-feed", scope],
        queryFn: () => api.get<{ data: NoteFeedItem[] }>("/notes", { params: { scope, limit: 50 } }).then((res) => res.data.data),
    });

    // Only used to resolve mentioned ids back to names for highlighting — if
    // this user can't list agents, mentions just render as plain "@Name" text.
    const agentsQuery = useQuery({
        queryKey: ["agents"],
        queryFn: () => api.get<{ data: AgentOption[] }>("/agents").then((res) => res.data.data),
        retry: false,
    });

    return (
        <div className="flex h-full flex-col">
            <header className="flex h-12 shrink-0 items-center gap-2 border-b border-line bg-paper px-3">
                <SectionIcon section="notes" size="md" />
                <h1 className="font-display text-[15px] font-semibold tracking-[-0.01em]">Notes</h1>
                {notesQuery.data && <span className="text-faint">{notesQuery.data.length}</span>}
            </header>

            <div className="flex h-10 shrink-0 items-center gap-1 border-b border-line-light px-2">
                <div className="font-medium text-muted">
                    <ViewSwitcher view={view} onChange={setView} />
                </div>
                <span className="mx-1 h-4 w-px bg-line" />
                {SCOPES.map((item) => (
                    <button
                        key={item.value}
                        onClick={() => setScope(item.value)}
                        className={`flex h-7 items-center rounded-lg px-2.5 font-medium ${item.value === scope ? "bg-fill text-ink" : "text-muted hover:bg-app"
                            }`}
                    >
                        {item.label}
                    </button>
                ))}
            </div>

            <div className="min-h-0 flex-1 overflow-auto">
                {view === "board" ? (
                    <NotesBoard scope={scope} entities={entities} meId={meId} agents={agentsQuery.data ?? []} />
                ) : (
                    <div className="px-6 py-6">
                        {notesQuery.isPending && <SkeletonList rows={4} />}
                        {notesQuery.isError && (
                            <ErrorState
                                title="Couldn't load notes"
                                error={notesQuery.error}
                                onRetry={() => notesQuery.refetch()}
                                retrying={notesQuery.isFetching}
                            />
                        )}
                        {notesQuery.isSuccess && notesQuery.data.length === 0 && (
                            <p className="rounded-lg border border-line px-3 py-10 text-center text-faint">{EMPTY_MESSAGE[scope]}</p>
                        )}

                        <ul className="flex flex-col gap-3">
                            {notesQuery.data?.map((note) => {
                                const meta = ENTITY_META[note.entity];
                                const Icon = meta.icon;
                                const isMine = note.author.id === meId;

                                return (
                                    <li key={`${note.entity}-${note.id}`}>
                                        <Link
                                            href={`${meta.href}?open=${note.recordId}`}
                                            className="block rounded-lg border border-line px-4 py-3 hover:border-line-strong hover:bg-paper"
                                        >
                                            <div className="flex items-center gap-2 text-sm">
                                                <Avatar name={note.author.name} />
                                                <span className="font-medium text-ink">{isMine ? "You" : note.author.name}</span>
                                                <span className="text-faint">noted on</span>
                                                <span className="flex items-center gap-1 font-medium text-ink">
                                                    <Icon size={14} className="text-faint" />
                                                    {note.recordLabel}
                                                </span>
                                                <span className="rounded bg-app px-1.5 text-sm text-muted">{meta.label}</span>
                                                <time dateTime={note.createdAt} className="ml-auto shrink-0 text-faint">
                                                    {timeAgo(note.createdAt)}
                                                </time>
                                            </div>
                                            <p className="mt-2 whitespace-pre-wrap text-muted">
                                                {renderNoteBody(note.body, note.mentionedUserIds, agentsQuery.data ?? [])}
                                            </p>
                                        </Link>
                                    </li>
                                );
                            })}
                        </ul>
                    </div>
                )}
            </div>
        </div>
    );
}
