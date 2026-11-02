/*
 * The app's own server: Next.js and Socket.IO on one port. `npm run dev` / `npm start` run
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
    const { announceChange, startRealtime } = await import("./src/lib/realtime/socketServer");

    const app = next({ dev, port });
    const handle = app.getRequestHandler();
    await app.prepare();

    const httpServer = createServer((req, res) => {
        // once the API has answered, tell the rest of the workspace if something changed
        if (req.url?.startsWith("/api/")) res.on("finish", () => announceChange(req, res.statusCode));
        handle(req, res);
    });

    startRealtime(httpServer);

    httpServer.listen(port, () => console.log(`> Ready on http://localhost:${port} (Next.js + Socket.IO)`));
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
