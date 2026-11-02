"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { IconChevronDown, IconUserCircle } from "@tabler/icons-react";

import { api, errorMessage } from "@/lib/api/client";
import { Dropdown, MenuItem } from "@/components/Dropdown";
import { ListHeader, ViewSwitcher } from "@/components/ListPage";
import { toast } from "@/components/Toast";
import type { AgentOption } from "../shared/customFields";
import { toggledStatus } from "../shared/activities";
import ActivitiesTable from "./ActivitiesTable";
import ActivitiesBoard from "./ActivitiesBoard";
import ActivityPanel from "./ActivityPanel";
import NewActivityDialog from "./NewActivityDialog";
import { refreshActivities, type Activity, type ActivityScope, type Paginated } from "./shared";

const PAGE_SIZE = 50;

const SCOPES: { value: ActivityScope; label: string }[] = [
    { value: "upcoming", label: "Upcoming" },
    { value: "overdue", label: "Overdue" },
    { value: "completed", label: "Completed" },
    { value: "cancelled", label: "Cancelled" },
    { value: "all", label: "All" },
];

export default function ActivitiesView({ seeAgents }: { seeAgents: boolean }) {
    const router = useRouter();
    const queryClient = useQueryClient();
    const searchParams = useSearchParams();

    const [view, setView] = useState<"table" | "board">("table");
    const [scope, setScope] = useState<ActivityScope>("upcoming");
    // your own schedule (assigned to you or tagged on) is what you usually want; switch it to see the team's
    const [mineOnly, setMineOnly] = useState(true);
    const [creating, setCreating] = useState(false);

    // The open activity lives in the URL, so a link from elsewhere (or a row here) lands on it
    const openActivityId = Number(searchParams.get("open")) || null;

    const activitiesQuery = useInfiniteQuery({
        queryKey: ["activities", "list", scope, mineOnly],
        queryFn: ({ pageParam }) =>
            api
                .get<Paginated<Activity>>("/activities", {
                    params: { scope, assignedTo: mineOnly ? "me" : undefined, page: pageParam, limit: PAGE_SIZE },
                })
                .then((res) => res.data),
        initialPageParam: 1,
        getNextPageParam: ({ pagination }) =>
            pagination.page < pagination.totalPages ? pagination.page + 1 : undefined,
        placeholderData: keepPreviousData,
    });

    // For the assignee column, the tag picker and the new-activity form
    const agents = useQuery({
        queryKey: ["agents"],
        queryFn: () => api.get<{ data: AgentOption[] }>("/agents").then((res) => res.data.data),
        enabled: seeAgents,
    });

    // Ticking an activity off and inline edits from the table are the same single-row PUT the panel uses
    const updateActivity = useMutation({
        mutationFn: ({ id, changes }: { id: number; changes: Record<string, unknown> }) => api.put(`/activities/${id}`, changes),
        onSuccess: (_, { changes }) => {
            toast.success(
                changes.status === "COMPLETED"
                    ? "Activity completed"
                    : changes.status === "SCHEDULED"
                        ? "Activity reopened"
                        : changes.status === "CANCELLED"
                            ? "Activity cancelled"
                            : "Activity updated"
            );
            refreshActivities(queryClient);
        },
        onError: (error) => toast.error(errorMessage(error)),
    });

    const activities = activitiesQuery.data?.pages.flatMap((page) => page.data) ?? [];
    const total = activitiesQuery.data?.pages[0]?.pagination.total;

    if (creating) {
        return (
            <NewActivityDialog
                agents={agents.data}
                onClose={() => setCreating(false)}
                onCreated={(activity) => {
                    setCreating(false);
                    refreshActivities(queryClient);
                    router.push(`/activities?open=${activity.id}`);
                }}
            />
        );
    }

    if (openActivityId !== null) {
        return (
            <ActivityPanel
                // key: switching activities starts a fresh panel (no leftover edit state)
                key={openActivityId}
                activityId={openActivityId}
                agents={agents.data}
                onClose={() => router.push("/activities")}
            />
        );
    }

    return (
        <div className="flex h-full flex-col">
            <ListHeader section="activities" title="Activities" count={total} createLabel="New Activity" onCreate={() => setCreating(true)} />

            <div className="flex h-10 shrink-0 items-center gap-1 border-b border-line-light px-2 font-medium text-muted">
                <ViewSwitcher view={view} onChange={setView} />

                {/* the board's columns already split activities by status, so these are table-only */}
                {view === "table" && <span className="mx-1 h-4 w-px bg-line" />}
                {view === "table" && SCOPES.map((item) => (
                    <button
                        key={item.value}
                        type="button"
                        onClick={() => setScope(item.value)}
                        className={`flex h-7 items-center rounded-lg px-2.5 ${item.value === scope ? "bg-fill text-ink" : "hover:bg-app"}`}
                    >
                        {item.label}
                    </button>
                ))}

                <div className="ml-auto">
                    <Dropdown
                        align="right"
                        buttonClassName="flex h-7 items-center gap-1 rounded-lg px-2 hover:bg-fill"
                        label={
                            <>
                                <IconUserCircle size={14} />
                                {mineOnly ? "My schedule" : "Everyone's schedule"}
                                <IconChevronDown size={14} className="text-faint" />
                            </>
                        }
                    >
                        {(close) => (
                            <>
                                <MenuItem selected={mineOnly} onClick={() => { setMineOnly(true); close(); }}>
                                    My schedule
                                </MenuItem>
                                <MenuItem selected={!mineOnly} onClick={() => { setMineOnly(false); close(); }}>
                                    Everyone&apos;s schedule
                                </MenuItem>
                            </>
                        )}
                    </Dropdown>
                </div>
            </div>

            <div className="relative min-h-0 flex-1 overflow-auto">
                {view === "board" ? (
                    <ActivitiesBoard
                        mineOnly={mineOnly}
                        agents={seeAgents ? agents.data : undefined}
                        onOpen={(id) => router.push(`/activities?open=${id}`)}
                        onCreate={() => setCreating(true)}
                    />
                ) : (
                    <ActivitiesTable
                        activities={activities}
                        scope={scope}
                        agents={seeAgents ? agents.data : undefined}
                        loading={activitiesQuery.isPending}
                        failed={activitiesQuery.isError}
                        error={activitiesQuery.error}
                        onRetry={() => activitiesQuery.refetch()}
                        hasMore={activitiesQuery.hasNextPage}
                        loadingMore={activitiesQuery.isFetchingNextPage}
                        onLoadMore={activitiesQuery.fetchNextPage}
                        onToggle={(activity) => updateActivity.mutate({ id: activity.id, changes: { status: toggledStatus(activity.status) } })}
                        onUpdate={(activity, changes) => updateActivity.mutate({ id: activity.id, changes })}
                        onOpen={(id) => router.push(`/activities?open=${id}`)}
                        onCreate={() => setCreating(true)}
                    />
                )}
            </div>
        </div>
    );
}
