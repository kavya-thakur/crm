/*
 * The app's own server: Next.js, Socket.IO and the job queue's worker, on one port. `npm run dev` / `npm start` run
 * this instead of `next dev` / `next start`, because Next.js route handlers can't keep a
 * WebSocket open; a plain Node HTTP server can (the same as Express + socket.io).
 * See docs/REALTIME.md.
 */
import { createServer } from "node:http";
import { loadEnvConfig } from "@next/env";
import next from "next";

const dev = process.env.NODE_ENV !== "production";
const port = Number(process.env.PORT) || 3000;

// .env first: the realtime code reads JWT_SECRET and DATABASE_URL as it loads
loadEnvConfig(process.cwd(), dev);

async function main() {
    const app = next({ dev, port });
    const handle = app.getRequestHandler();
    await app.prepare();

    // Loaded only once Next.js is ready: this code reaches Next's own server modules (through
    // the permission helpers), which need the request storage that app.prepare() sets up
    const { announceChange, startRealtime } = await import("./src/lib/realtime/socketServer");
    const { startWorkers } = await import("./src/lib/jobs/worker");

    const httpServer = createServer((req, res) => {
        // once the API has answered, tell the rest of the workspace if something changed
        if (req.url?.startsWith("/api/")) res.on("finish", () => announceChange(req, res.statusCode));
        handle(req, res);
    });

    startRealtime(httpServer);
    // background jobs (CSV imports) from the queue in Redis; see docs/QUEUES.md
    const workers = startWorkers();

    // On stop (Ctrl+C, or the host restarting the app), stop taking jobs without waiting for a
    // running import to finish: its unfinished batch rolls back, and BullMQ hands the job out
    // again on the next start, where the import carries on from its last saved batch
    for (const signal of ["SIGINT", "SIGTERM"] as const) {
        process.once(signal, async () => {
            await Promise.all(workers.map((worker) => worker.close(true)));
            process.exit(0);
        });
    }

    httpServer.listen(port, () => console.log(`> Ready on http://localhost:${port} (Next.js + Socket.IO)`));
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
