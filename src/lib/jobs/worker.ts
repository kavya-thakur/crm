import { Worker } from "bullmq";
import { queueConnection } from "@/lib/db/redis";
import { failImport, runImport } from "@/lib/jobs/leadImport";
import { failBulkJob, runBulkJob } from "@/lib/jobs/bulkActions";
import { BULK_QUEUE, IMPORTS_QUEUE, type BulkJobData, type ImportJobData } from "./queues";

/**
 * The worker: takes jobs off the queue in Redis and runs them. Started by server.ts, so it
 * lives in the same process as the website for now; it could move to a process of its own
 * (`tsx worker.ts`) without any other change, since the queue in Redis sits between them.
 */
export function startWorkers() {
    const imports = new Worker<ImportJobData>(IMPORTS_QUEUE, (job) => runImport(job.data.importJobId), {
        connection: queueConnection("imports worker"),
        // two imports at a time; the rest wait their turn in the queue
        concurrency: 2,
    });

    imports.on("failed", (job, error) => {
        if (!job) return;
        console.error(`Import ${job.data.importJobId} failed (attempt ${job.attemptsMade}):`, error.message);
        // out of retries: the import is given up on, and whoever started it is told
        if (job.attemptsMade >= (job.opts.attempts ?? 1)) void failImport(job.data.importJobId, error.message);
    });

    const bulk = new Worker<BulkJobData>(BULK_QUEUE, (job) => runBulkJob(job.data.bulkJobId), {
        connection: queueConnection("bulk worker"),
        concurrency: 1,
    });

    bulk.on("failed", (job, error) => {
        if (!job) return;
        console.error(`Bulk job ${job.data.bulkJobId} failed (attempt ${job.attemptsMade}):`, error.message);
        if (job.attemptsMade >= (job.opts.attempts ?? 1)) void failBulkJob(job.data.bulkJobId, error.message);
    });

    return [imports, bulk];
}
