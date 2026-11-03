import { Queue } from "bullmq";
import { queueConnection } from "@/lib/db/redis";

/*
 * The job queues (BullMQ, kept in Redis). A route *adds* a job and answers straight away;
 * the worker (./worker.ts, started by server.ts) *runs* it in the background. Only ids
 * travel in a job: the work itself (the CSV, the counts) is in Postgres. See docs/QUEUES.md.
 */

export const IMPORTS_QUEUE = "imports";
export const BULK_QUEUE = "bulk";
export const DEMO_QUEUE = "demo";
export const EMAILS_QUEUE = "emails";

export interface ImportJobData {
    importJobId: number;
}

export interface BulkJobData {
    bulkJobId: number;
}

export interface EmailJobData {
    emailId: number;
}

const holder = globalThis as unknown as {
    crmImportsQueue?: Queue<ImportJobData>;
    crmBulkQueue?: Queue<BulkJobData>;
    crmDemoQueue?: Queue;
    crmEmailsQueue?: Queue<EmailJobData>;
};

const retries = {
    // a failed run (the database blipped, the server restarted) is tried again: after 10s, 20s, 40s
    attempts: 4,
    backoff: { type: "exponential", delay: 10_000 },
    // Redis keeps a short history; the real record is the job's row in Postgres
    removeOnComplete: 100,
    removeOnFail: 500,
};

// One queue object (and Redis connection) for the whole process, kept across reloads in dev
export function importsQueue() {
    holder.crmImportsQueue ??= new Queue<ImportJobData>(IMPORTS_QUEUE, {
        connection: queueConnection("imports queue"),
        defaultJobOptions: retries,
    });
    return holder.crmImportsQueue;
}

// The nightly rebuild of the demo workspace (a scheduled job, see startWorkers)
export function demoQueue() {
    holder.crmDemoQueue ??= new Queue(DEMO_QUEUE, { connection: queueConnection("demo queue"), defaultJobOptions: retries });
    return holder.crmDemoQueue;
}

// Bulk actions too big for one request (deleting thousands of records)
export function bulkQueue() {
    holder.crmBulkQueue ??= new Queue<BulkJobData>(BULK_QUEUE, { connection: queueConnection("bulk queue"), defaultJobOptions: retries });
    return holder.crmBulkQueue;
}

// Emails sent from the CRM: one job per email, so a mail server that's slow or briefly down
// doesn't hold up the person sending it, and it's tried again by itself
export function emailsQueue() {
    holder.crmEmailsQueue ??= new Queue<EmailJobData>(EMAILS_QUEUE, { connection: queueConnection("emails queue"), defaultJobOptions: retries });
    return holder.crmEmailsQueue;
}
