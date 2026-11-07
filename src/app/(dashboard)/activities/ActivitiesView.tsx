"use client";

import { useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { IconChevronDown, IconUserCircle } from "@tabler/icons-react";

import { api, errorMessage } from "@/lib/api/client";
import { Dropdown, MenuItem } from "@/components/Dropdown";
import { ListHeader, Pagination, ViewSwitcher } from "@/components/ListPage";
import { toast } from "@/components/Toast";
import type { AgentOption } from "../shared/customFields";
import { toggledStatus } from "../shared/activities";
import ActivitiesTable from "./ActivitiesTable";
import ActivitiesBoard from "./ActivitiesBoard";
import ActivitiesCalendar from "./ActivitiesCalendar";
import ActivityPanel from "./ActivityPanel";
import NewActivityDialog from "./NewActivityDialog";
import { refreshActivities, type Activity, type ActivityScope, type Paginated } from "./shared";
import { oneOf, PAGE_SIZES, usePaging, useUrlState } from "../shared/useUrlState";


const SCOPES: { value: ActivityScope; label: string }[] = [
    { value: "upcoming", label: "Upcoming" },
    { value: "overdue", label: "Overdue" },
    { value: "completed", label: "Completed" },
    { value: "cancelled", label: "Cancelled" },
    { value: "all", label: "All" },
];

export default function ActivitiesView({ seeAgents }: { seeAgents: boolean }) {
    const queryClient = useQueryClient();

    // Everything you've chosen here lives in the URL, so a refresh (or a shared link) keeps it:
    // board or list, which activities, whose, and the open one (?open=12)
    const page = useUrlState();
    const view = oneOf(page.get("view"), ["table", "board", "calendar"] as const, "board");
    // the calendar keeps its month or week and day in the URL too; they mean nothing elsewhere
    const setView = (next: typeof view) => page.set({ view: next === "board" ? null : next, cal: null, date: null });
    const scope = oneOf(page.get("scope"), SCOPES.map((item) => item.value), "upcoming");
    const setScope = (next: ActivityScope) => page.set({ page: null, scope: next === "upcoming" ? null : next });
    // your own schedule (assigned to you or tagged on) is what you usually want; switch it to see the team's
    const mineOnly = page.get("whose") !== "team";
    const setMineOnly = (mine: boolean) => page.set({ page: null, whose: mine ? null : "team" });
    // booking a new one; `at` when a day was picked on the calendar
    const [creating, setCreating] = useState<{ at?: string } | null>(null);

    const openActivityId = Number(page.get("open")) || null;
    const openActivity = (id: number | null) => page.set({ open: id ? String(id) : null }, "push");

    // one page of the list at a time; which one, and its size, are in the URL (the Pagination bar)
    const paging = usePaging();
    const activitiesQuery = useQuery({
        queryKey: ["activities", "list", scope, mineOnly, paging.page, paging.size],
        queryFn: () =>
            api
                .get<Paginated<Activity>>("/activities", {
                    params: { scope, assignedTo: mineOnly ? "me" : undefined, page: paging.page, limit: paging.size },
                })
                .then((res) => res.data),
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

    const activities = activitiesQuery.data?.data ?? [];
    const total = activitiesQuery.data?.pagination.total;

    if (creating) {
        return (
            <NewActivityDialog
                agents={agents.data}
                startAt={creating.at}
                onClose={() => setCreating(null)}
                onCreated={(activity) => {
                    setCreating(null);
                    refreshActivities(queryClient);
                    openActivity(activity.id);
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
                onClose={() => openActivity(null)}
            />
        );
    }

    return (
        <div className="flex h-full flex-col">
            <ListHeader section="activities" title="Activities" count={total} createLabel="New Activity" onCreate={() => setCreating({})} />

            <div className="flex h-10 shrink-0 items-center gap-1 overflow-x-auto border-b border-line-light px-2 font-medium text-muted [&>*]:shrink-0">
                <ViewSwitcher view={view} onChange={setView} views={["table", "board", "calendar"]} />

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
                {view === "calendar" ? (
                    <ActivitiesCalendar mineOnly={mineOnly} onOpen={openActivity} onCreate={(at) => setCreating({ at })} />
                ) : view === "board" ? (
                    <ActivitiesBoard
                        mineOnly={mineOnly}
                        agents={seeAgents ? agents.data : undefined}
                        onOpen={openActivity}
                        onCreate={() => setCreating({})}
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
                        onToggle={(activity) => updateActivity.mutate({ id: activity.id, changes: { status: toggledStatus(activity.status) } })}
                        onUpdate={(activity, changes) => updateActivity.mutate({ id: activity.id, changes })}
                        onOpen={openActivity}
                        onCreate={() => setCreating({})}
                    />
                )}
            </div>

            {/* which page of the list, and how many rows a page */}
            {view === "table" && <Pagination page={paging.page} size={paging.size} total={total} sizes={PAGE_SIZES} onPage={paging.setPage} onSize={paging.setSize} />}
        </div>
    );
}
