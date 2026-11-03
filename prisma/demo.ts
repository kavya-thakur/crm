// Builds (or rebuilds) the "Flash Demo" workspace: `npm run db:demo`. The work itself is in
// src/lib/demo/workspace.ts, which the server also runs every night to reset the demo.
import "dotenv/config";
import { prisma } from "../src/lib/db/prisma";
import { buildDemoWorkspace } from "../src/lib/demo/workspace";

buildDemoWorkspace()
    .catch((error) => {
        console.error(error);
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
