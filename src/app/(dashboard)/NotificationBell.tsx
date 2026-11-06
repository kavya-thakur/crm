"use client";

import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { IconBell, IconChecks } from "@tabler/icons-react";

import { api } from "@/lib/api/client";
import { timeAgo } from "@/lib/utils/format";
import { Dropdown } from "@/components/Dropdown";
import { SectionIcon, type Section } from "@/components/SectionIcon";

interface Notification {
    id: number;
    type: string;
    title: string;
    body: string | null;
    link: string | null;
    readAt: string | null;
    createdAt: string;
}

// Each kind of notification wears the icon of the part of the app it's about
const SECTION_OF: Record<string, Section> = {
    LEAD_ASSIGNED: "leads",
    DEAL_ASSIGNED: "deals",
    TASK_ASSIGNED: "tasks",
    ACTIVITY_INVITED: "activities",
    REMINDER: "activities",
    MENTIONED: "notes",
    IMPORT_FINISHED: "leads",
    EMAIL_OPENED: "emails",
    EMAIL_FAILED: "emails",
    AUTOMATION: "automations",
};

/**
 * The bell in the sidebar: an unread count, and a list of what happened for you. New ones
 * arrive over the socket (LiveUpdates refreshes this query), so the count changes live.
 * Clicking one marks it read and goes to the record it's about.
 */
export function NotificationBell() {
    const router = useRouter();
    const queryClient = useQueryClient();

    const query = useQuery({
        queryKey: ["notifications"],
        queryFn: () => api.get<{ data: Notification[]; unread: number }>("/notifications").then((res) => res.data),
    });

    const markRead = useMutation({
        mutationFn: (body: { ids: number[] } | { all: true }) => api.patch("/notifications", body),
        onSettled: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
    });

    const unread = query.data?.unread ?? 0;
    const items = query.data?.data ?? [];

    return (
        <Dropdown
            buttonClassName="relative ml-auto flex size-7 items-center justify-center rounded-lg text-muted hover:bg-fill hover:text-ink"
            label={
                <>
                    <IconBell size={16} aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"} />
                    {unread > 0 && (
                        <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-semibold text-on-accent">
                            {unread > 9 ? "9+" : unread}
                        </span>
                    )}
                </>
            }
            panelClassName="max-h-[70vh] w-96 p-0"
        >
            {(close) => (
                <div className="flex flex-col">
                    <div className="sticky top-0 z-1 flex h-11 items-center border-b border-line-light bg-surface px-3">
                        <p className="font-medium text-ink">Notifications</p>
                        {unread > 0 && (
                            <button
                                type="button"
                                onClick={() => markRead.mutate({ all: true })}
                                className="ml-auto flex h-7 items-center gap-1 rounded-lg px-2 text-sm font-medium text-muted hover:bg-fill hover:text-ink"
                            >
                                <IconChecks size={14} />
                                Mark all read
                            </button>
                        )}
                    </div>

                    {items.length === 0 ? (
                        <p className="px-3 py-10 text-center text-faint">Nothing yet. When someone assigns you work or mentions you, it shows up here.</p>
                    ) : (
                        <ul className="p-1">
                            {items.map((item) => (
                                <li key={item.id}>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            close();
                                            if (!item.readAt) markRead.mutate({ ids: [item.id] });
                                            if (item.link) router.push(item.link);
                                        }}
                                        className="flex w-full items-start gap-2.5 rounded-lg px-2 py-2 text-left hover:bg-paper"
                                    >
                                        <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md bg-app">
                                            <SectionIcon section={SECTION_OF[item.type] ?? "dashboard"} />
                                        </span>
                                        <span className="min-w-0 flex-1">
                                            <span className={`block truncate ${item.readAt ? "text-muted" : "font-medium text-ink"}`}>{item.title}</span>
                                            {item.body && <span className="line-clamp-2 text-sm text-faint">{item.body}</span>}
                                            <span className="text-sm text-light">{timeAgo(item.createdAt)}</span>
                                        </span>
                                        {!item.readAt && <span aria-label="Unread" className="mt-2 size-2 shrink-0 rounded-full bg-accent" />}
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            )}
        </Dropdown>
    );
}
