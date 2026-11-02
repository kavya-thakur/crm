"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { IconChevronDown, IconFlag, IconUserCircle } from "@tabler/icons-react";

import { api, errorMessage } from "@/lib/api/client";
import { Dropdown, MenuItem } from "@/components/Dropdown";
import { ListHeader, ViewSwitcher } from "@/components/ListPage";
import { toast } from "@/components/Toast";
import type { AgentOption } from "../shared/customFields";
import { PriorityBadge } from "../shared/tasks";
import NewTaskDialog from "./NewTaskDialog";
import TaskPanel from "./TaskPanel";
import TasksTable from "./TasksTable";
import TasksBoard from "./TasksBoard";
import { TASK_PRIORITIES, refreshTasks, type Paginated, type Task, type TaskPriority, type TaskScope } from "./shared";

const PAGE_SIZE = 50;

const SCOPES: { value: TaskScope; label: string }[] = [
    { value: "open", label: "Open" },
    { value: "overdue", label: "Overdue" },
    { value: "completed", label: "Completed" },
    { value: "all", label: "All" },
];

export default function TasksView({ seeAgents }: { seeAgents: boolean }) {
    const router = useRouter();
    const queryClient = useQueryClient();
    const searchParams = useSearchParams();

    const [view, setView] = useState<"table" | "board">("table");
    const [scope, setScope] = useState<TaskScope>("open");
    // your own tasks are what you usually want; switch it to see the whole team's
    const [mineOnly, setMineOnly] = useState(true);
    // undefined = every priority
    const [priority, setPriority] = useState<TaskPriority | undefined>();
    const [creating, setCreating] = useState(false);

    // The open task lives in the URL, so a link from a timeline (or a row here) lands on it
    const openTaskId = Number(searchParams.get("open")) || null;

    const tasksQuery = useInfiniteQuery({
        queryKey: ["tasks", "list", scope, mineOnly, priority],
        queryFn: ({ pageParam }) =>
            api
                .get<Paginated<Task>>("/tasks", {
                    params: { scope, assignedTo: mineOnly ? "me" : undefined, priority, page: pageParam, limit: PAGE_SIZE },
                })
                .then((res) => res.data),
        initialPageParam: 1,
        getNextPageParam: ({ pagination }) =>
            pagination.page < pagination.totalPages ? pagination.page + 1 : undefined,
        placeholderData: keepPreviousData,
    });

    // For the assignee column and the new-task form
    const agents = useQuery({
        queryKey: ["agents"],
        queryFn: () => api.get<{ data: AgentOption[] }>("/agents").then((res) => res.data.data),
        enabled: seeAgents,
    });

    // Ticking a task off and inline edits from the table are the same single-row PUT the panel uses
    const updateTask = useMutation({
        mutationFn: ({ id, changes }: { id: number; changes: Record<string, unknown> }) => api.put(`/tasks/${id}`, changes),
        onSuccess: (_, { changes }) => {
            toast.success(changes.status === "COMPLETED" ? "Task completed" : changes.status === "PENDING" ? "Task reopened" : "Task updated");
            refreshTasks(queryClient);
        },
        onError: (error) => toast.error(errorMessage(error)),
    });

    const tasks = tasksQuery.data?.pages.flatMap((page) => page.data) ?? [];
    const total = tasksQuery.data?.pages[0]?.pagination.total;

    if (creating) {
        return (
            <NewTaskDialog
                agents={agents.data}
                onClose={() => setCreating(false)}
                onCreated={(task) => {
                    setCreating(false);
                    refreshTasks(queryClient);
                    router.push(`/tasks?open=${task.id}`);
                }}
            />
        );
    }

    if (openTaskId !== null) {
        return (
            <TaskPanel
                // key: switching tasks starts a fresh panel (no leftover edit state)
                key={openTaskId}
                taskId={openTaskId}
                agents={agents.data}
                onClose={() => router.push("/tasks")}
            />
        );
    }

    return (
        <div className="flex h-full flex-col">
            <ListHeader section="tasks" title="Tasks" count={total} createLabel="New Task" onCreate={() => setCreating(true)} />

            <div className="flex h-10 shrink-0 items-center gap-1 border-b border-line-light px-2 font-medium text-muted">
                <ViewSwitcher view={view} onChange={setView} />

                {/* the board's columns already split tasks by status, so these are table-only */}
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

                <div className="ml-auto flex items-center gap-1">
                    <Dropdown
                        align="right"
                        buttonClassName="flex h-7 items-center gap-1 rounded-lg px-2 hover:bg-fill"
                        label={
                            <>
                                <IconFlag size={14} />
                                {priority ? TASK_PRIORITIES.find((item) => item.value === priority)?.label : "All priorities"}
                                <IconChevronDown size={14} className="text-faint" />
                            </>
                        }
                    >
                        {(close) => (
                            <>
                                <MenuItem selected={priority === undefined} onClick={() => { setPriority(undefined); close(); }}>
                                    All priorities
                                </MenuItem>
                                {TASK_PRIORITIES.map((item) => (
                                    <MenuItem key={item.value} selected={priority === item.value} onClick={() => { setPriority(item.value); close(); }}>
                                        <PriorityBadge priority={item.value} />
                                    </MenuItem>
                                ))}
                            </>
                        )}
                    </Dropdown>

                    <Dropdown
                        align="right"
                        buttonClassName="flex h-7 items-center gap-1 rounded-lg px-2 hover:bg-fill"
                        label={
                            <>
                                <IconUserCircle size={14} />
                                {mineOnly ? "My tasks" : "Everyone's tasks"}
                                <IconChevronDown size={14} className="text-faint" />
                            </>
                        }
                    >
                        {(close) => (
                            <>
                                <MenuItem selected={mineOnly} onClick={() => { setMineOnly(true); close(); }}>
                                    My tasks
                                </MenuItem>
                                <MenuItem selected={!mineOnly} onClick={() => { setMineOnly(false); close(); }}>
                                    Everyone&apos;s tasks
                                </MenuItem>
                            </>
                        )}
                    </Dropdown>
                </div>
            </div>

            <div className="relative min-h-0 flex-1 overflow-auto">
                {view === "board" ? (
                    <TasksBoard
                        filters={{ assignedTo: mineOnly ? "me" : undefined, priority }}
                        agents={seeAgents ? agents.data : undefined}
                        onOpen={(id) => router.push(`/tasks?open=${id}`)}
                        onCreate={() => setCreating(true)}
                    />
                ) : (
                    <TasksTable
                        tasks={tasks}
                        scope={scope}
                        agents={seeAgents ? agents.data : undefined}
                        loading={tasksQuery.isPending}
                        failed={tasksQuery.isError}
                        error={tasksQuery.error}
                        onRetry={() => tasksQuery.refetch()}
                        hasMore={tasksQuery.hasNextPage}
                        loadingMore={tasksQuery.isFetchingNextPage}
                        onLoadMore={tasksQuery.fetchNextPage}
                        onToggle={(task) =>
                            updateTask.mutate({ id: task.id, changes: { status: task.status === "COMPLETED" ? "PENDING" : "COMPLETED" } })
                        }
                        onUpdate={(task, changes) => updateTask.mutate({ id: task.id, changes })}
                        onOpen={(id) => router.push(`/tasks?open=${id}`)}
                        onCreate={() => setCreating(true)}
                    />
                )}
            </div>
        </div>
    );
}
