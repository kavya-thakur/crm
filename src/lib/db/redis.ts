import IORedis from "ioredis";

/*
 * Redis: a small, very fast in-memory store that lives outside the app (`brew services start
 * redis` locally; a managed one when deployed). Flash uses it for the job queue (BullMQ, see
 * src/lib/jobs) and for rate limits. Nothing in it is the source of truth: the data itself
 * is always in Postgres. See docs/QUEUES.md.
 */

const url = () => process.env.REDIS_URL ?? "redis://localhost:6379";

const holder = globalThis as unknown as { crmRedis?: IORedis };

function logErrors(connection: IORedis, name: string) {
    let warned = false;
    connection.on("error", (error) => {
        // once until it reconnects, not on every retry
        if (!warned) console.error(`Redis (${name}) unavailable: ${error.message}`);
        warned = true;
    });
    connection.on("ready", () => {
        warned = false;
    });
    return connection;
}

/**
 * The shared connection for quick commands (rate limits). A command waits for the
 * connection while it's being made (on start-up), but never long: if Redis is down it
 * fails within half a second, so callers can carry on without it.
 * Kept on globalThis, so reloads in dev don't open a new connection each time.
 */
export function redis() {
    holder.crmRedis ??= logErrors(new IORedis(url(), { maxRetriesPerRequest: 1, commandTimeout: 500 }), "commands");
    return holder.crmRedis;
}

// A connection for BullMQ. Its workers wait on Redis for new jobs, so it must never give up
// on a command (maxRetriesPerRequest: null, as BullMQ requires).
export function queueConnection(name: string) {
    return logErrors(new IORedis(url(), { maxRetriesPerRequest: null }), name);
}
