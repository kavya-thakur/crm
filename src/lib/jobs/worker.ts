import { Worker } from "bullmq";
import { queueConnection } from "@/lib/db/redis";
import { failImport, runImport } from "@/lib/jobs/leadImport";
import { failBulkJob, runBulkJob } from "@/lib/jobs/bulkActions";
import { buildDemoWorkspace } from "@/lib/demo/workspace";
import { failEmail, sendEmail } from "@/lib/emails/send";
import { runAutomations } from "@/lib/automations/engine";
import {
    AUTOMATIONS_QUEUE,
    BULK_QUEUE,
    DEMO_QUEUE,
    demoQueue,
    EMAILS_QUEUE,
    IMPORTS_QUEUE,
    type AutomationJobData,
    type BulkJobData,
    type EmailJobData,
    type ImportJobData,
} from "./queues";

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

    const emails = new Worker<EmailJobData>(EMAILS_QUEUE, (job) => sendEmail(job.data.emailId), {
        connection: queueConnection("emails worker"),
        concurrency: 2,
    });

    emails.on("failed", (job, error) => {
        if (!job) return;
        console.error(`Email ${job.data.emailId} failed (attempt ${job.attemptsMade}):`, error.message);
        // the mail server kept saying no (wrong password, blocked address): the sender is told
        if (job.attemptsMade >= (job.opts.attempts ?? 1)) void failEmail(job.data.emailId, error.message);
    });

    // Automation rules, one event at a time per worker slot. A retry skips the rules that
    // already ran for the event (see claimRun in the engine), so nothing is done twice.
    const automations = new Worker<AutomationJobData>(AUTOMATIONS_QUEUE, (job) => runAutomations(job.data), {
        connection: queueConnection("automations worker"),
        concurrency: 2,
    });
    automations.on("failed", (job, error) => console.error(`Automations for lead ${job?.data.leadId} failed:`, error.message));

    // The demo workspace is rebuilt every night, undoing whatever visitors changed. A job
    // scheduler is BullMQ's cron: the schedule lives in Redis, so it survives restarts and runs
    // once a night however many servers there are. "upsert" means starting again doesn't add a second one.
    const demo = new Worker(DEMO_QUEUE, () => buildDemoWorkspace(), { connection: queueConnection("demo worker") });
    demo.on("failed", (_job, error) => console.error("Nightly demo reset failed:", error.message));
    void demoQueue()
        .upsertJobScheduler("nightly-demo-reset", { pattern: "0 3 * * *", tz: "Asia/Kolkata" }, { name: "reset" })
        .catch((error) => console.error("Couldn't schedule the nightly demo reset:", error.message));

    return [imports, bulk, emails, automations, demo];
}
