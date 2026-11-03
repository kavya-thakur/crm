"use client";

import { useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { IconChevronDown, IconFlag, IconUserCircle } from "@tabler/icons-react";

import { api, errorMessage } from "@/lib/api/client";
import { Dropdown, MenuItem } from "@/components/Dropdown";
import { ListHeader, Pagination, ViewSwitcher } from "@/components/ListPage";
import { toast } from "@/components/Toast";
import type { AgentOption } from "../shared/customFields";
import { PriorityBadge } from "../shared/tasks";
import NewTaskDialog from "./NewTaskDialog";
import TaskPanel from "./TaskPanel";
import TasksTable from "./TasksTable";
import TasksBoard from "./TasksBoard";
import { TASK_PRIORITIES, refreshTasks, type Paginated, type Task, type TaskPriority, type TaskScope } from "./shared";
import { oneOf, PAGE_SIZES, usePaging, useUrlState } from "../shared/useUrlState";


const SCOPES: { value: TaskScope; label: string }[] = [
    { value: "open", label: "Open" },
    { value: "overdue", label: "Overdue" },
    { value: "completed", label: "Completed" },
    { value: "all", label: "All" },
];

export default function TasksView({ seeAgents }: { seeAgents: boolean }) {
    const queryClient = useQueryClient();

    // Everything you've chosen here lives in the URL, so a refresh (or a shared link) keeps it:
    // board or list, which tasks, whose, which priority, and the open task (?open=12, which is
    // also how a link from a timeline lands on one)
    const page = useUrlState();
    const view = page.get("view") === "table" ? "table" : "board";
    const setView = (next: "table" | "board") => page.set({ view: next === "board" ? null : next });
    const scope = oneOf(page.get("scope"), SCOPES.map((item) => item.value), "open");
    const setScope = (next: TaskScope) => page.set({ page: null, scope: next === "open" ? null : next });
    // your own tasks are what you usually want; switch it to see the whole team's
    const mineOnly = page.get("whose") !== "team";
    const setMineOnly = (mine: boolean) => page.set({ page: null, whose: mine ? null : "team" });
    // undefined = every priority
    const priority = TASK_PRIORITIES.find((item) => item.value === page.get("priority"))?.value;
    const setPriority = (next: TaskPriority | undefined) => page.set({ page: null, priority: next ?? null });
    const [creating, setCreating] = useState(false);

    const openTaskId = Number(page.get("open")) || null;
    const openTask = (id: number | null) => page.set({ open: id ? String(id) : null }, "push");

    // one page of the list at a time; which one, and its size, are in the URL (the Pagination bar)
    const paging = usePaging();
    const tasksQuery = useQuery({
        queryKey: ["tasks", "list", scope, mineOnly, priority, paging.page, paging.size],
        queryFn: () =>
            api
                .get<Paginated<Task>>("/tasks", {
                    params: { scope, assignedTo: mineOnly ? "me" : undefined, priority, page: paging.page, limit: paging.size },
                })
                .then((res) => res.data),
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

    const tasks = tasksQuery.data?.data ?? [];
    const total = tasksQuery.data?.pagination.total;

    if (creating) {
        return (
            <NewTaskDialog
                agents={agents.data}
                onClose={() => setCreating(false)}
                onCreated={(task) => {
                    setCreating(false);
                    refreshTasks(queryClient);
                    openTask(task.id);
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
                onClose={() => openTask(null)}
            />
        );
    }

    return (
        <div className="flex h-full flex-col">
            <ListHeader section="tasks" title="Tasks" count={total} createLabel="New Task" onCreate={() => setCreating(true)} />

            <div className="flex h-10 shrink-0 items-center gap-1 overflow-x-auto border-b border-line-light px-2 font-medium text-muted [&>*]:shrink-0">
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
                        onOpen={openTask}
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
                        onToggle={(task) =>
                            updateTask.mutate({ id: task.id, changes: { status: task.status === "COMPLETED" ? "PENDING" : "COMPLETED" } })
                        }
                        onUpdate={(task, changes) => updateTask.mutate({ id: task.id, changes })}
                        onOpen={openTask}
                        onCreate={() => setCreating(true)}
                    />
                )}
            </div>

            {/* which page of the list, and how many rows a page */}
            {view === "table" && <Pagination page={paging.page} size={paging.size} total={total} sizes={PAGE_SIZES} onPage={paging.setPage} onSize={paging.setSize} />}
        </div>
    );
}
