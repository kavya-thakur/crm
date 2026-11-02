"use client";

import { useQuery, type QueryClient } from "@tanstack/react-query";
import { IconCircleCheckFilled, IconTrash } from "@tabler/icons-react";

import { api } from "@/lib/api/client";
import { Spinner } from "@/components/Loader";
import { toast } from "@/components/Toast";

export interface BulkProgress {
    id: number;
    entity: "lead" | "deal" | "contact";
    action: string;
    status: "QUEUED" | "RUNNING" | "DONE" | "FAILED";
    total: number;
    processed: number;
    affected: number;
    error: string | null;
}

export const bulkNoun = (job: Pick<BulkProgress, "entity">, count: number) => `${count.toLocaleString()} ${job.entity}${count === 1 ? "" : "s"}`;

const ACTIVE = new Set(["QUEUED", "RUNNING"]);
// a finished job stays on its card this long, so even one done in a blink is seen finishing
const SHOW_FINISHED_MS = 4000;

/**
 * Puts a job's latest state on its card: from the request that started it, and from every
 * "bulk-progress" message the worker sends (LiveUpdates). Either can arrive first: a job
 * that takes a third of a second can finish before its request has even answered, so an
 * older state never replaces a newer one. A finished job is taken off after a few seconds.
 */
export function trackBulkJob(queryClient: QueryClient, update: BulkProgress) {
    queryClient.setQueryData<BulkProgress[]>(["bulk-jobs"], (jobs = []) => {
        const current = jobs.find((job) => job.id === update.id);
        // never go back: a QUEUED reply arriving after the DONE message is ignored
        if (current && !ACTIVE.has(current.status) && ACTIVE.has(update.status)) return jobs;
        if (current && update.processed < current.processed) return jobs;
        return current ? jobs.map((job) => (job.id === update.id ? update : job)) : [...jobs, update];
    });

    if (!ACTIVE.has(update.status)) {
        if (update.status === "FAILED") {
            toast.error("A bulk delete stopped", `${update.error ?? "Something went wrong"}. ${bulkNoun(update, update.affected)} were deleted before it stopped.`);
        }
        setTimeout(() => queryClient.setQueryData<BulkProgress[]>(["bulk-jobs"], (jobs = []) => jobs.filter((job) => job.id !== update.id)), SHOW_FINISHED_MS);
    }
}

/**
 * A small card in the corner, on every page, for each big bulk action: "Deleting 4,230
 * leads… 2,000 of 4,230", then "Deleted 4,230 leads" for a few seconds. Progress arrives over
 * the socket; the running ones are also loaded from the API, so they're back after a reload.
 */
export function BackgroundJobs() {
    const query = useQuery({
        queryKey: ["bulk-jobs"],
        queryFn: () => api.get<{ data: BulkProgress[] }>("/bulk-jobs").then((res) => res.data.data),
        // a safety net in case a socket message was missed, while something's still running
        refetchInterval: (current) => (current.state.data?.some((job) => ACTIVE.has(job.status)) ? 5000 : false),
    });

    const jobs = query.data ?? [];
    if (jobs.length === 0) return null;

    return (
        <div className="fixed right-4 bottom-4 z-40 flex w-80 flex-col gap-2" role="status">
            {jobs.map((job) => {
                const done = job.status === "DONE";
                const failed = job.status === "FAILED";
                const share = done ? 1 : job.total > 0 ? job.processed / job.total : 0;
                return (
                    <div key={job.id} className="rounded-xl border border-line bg-surface p-3 shadow-strong">
                        <p className="flex items-center gap-2 font-medium text-ink">
                            {done ? (
                                <IconCircleCheckFilled size={16} className="text-[#218358]" />
                            ) : job.status === "QUEUED" ? (
                                <Spinner size={14} />
                            ) : (
                                <IconTrash size={15} className="text-danger" />
                            )}
                            {done
                                ? `Deleted ${bulkNoun(job, job.affected)}`
                                : failed
                                  ? `Stopped after ${bulkNoun(job, job.affected)}`
                                  : `Deleting ${bulkNoun(job, job.total)}`}
                        </p>
                        {/* the bar grows by scaling, so it moves smoothly */}
                        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-fill">
                            <div
                                className={`h-full origin-left rounded-full transition-transform duration-500 ease-out ${done ? "bg-[#30a46c]" : failed ? "bg-danger" : "bg-accent"}`}
                                style={{ transform: `scaleX(${share})` }}
                            />
                        </div>
                        <p className="mt-1.5 text-sm text-faint tabular-nums">
                            {done
                                ? job.affected < job.total
                                    ? `${(job.total - job.affected).toLocaleString()} were already gone or out of reach`
                                    : "All done"
                                : failed
                                  ? (job.error ?? "Something went wrong")
                                  : `${job.processed.toLocaleString()} of ${job.total.toLocaleString()} · you can keep working`}
                        </p>
                    </div>
                );
            })}
        </div>
    );
}
