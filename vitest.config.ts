import { defineConfig } from "vitest/config";
import path from "node:path";

// Integration tests hit a real Postgres (crm_test, migrated but otherwise
// empty) — not mocked, same philosophy as the rest of this codebase. Each
// test creates its own Organization and cleans it up afterwards.
export default defineConfig({
    test: {
        environment: "node",
        env: {
            DATABASE_URL: "postgresql://mac@localhost:5432/crm_test",
        },
        // Integration tests share one Prisma client (one pg connection) against
        // one test database; running files in parallel makes them race on it.
        fileParallelism: false,
    },
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "./src"),
        },
    },
});
