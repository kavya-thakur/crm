import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { hasPermission, requirePermission } from "@/lib/auth/requirePermission";
import { handleRouteError } from "@/lib/api/http";
import { tooManyAttempts } from "@/lib/api/rateLimit";
import { importScope, importSummarySelect } from "@/lib/jobs/leadImport";
import { importsQueue } from "@/lib/jobs/queues";
import { readImportUpload } from "@/lib/imports/upload";

// Recent imports, newest first, for the import page's history
export async function GET() {
    try {
        const user = await requirePermission("lead:create");

        const imports = await prisma.importJob.findMany({
            where: importScope(user, hasPermission(user, "lead:all")),
            orderBy: { createdAt: "desc" },
            take: 20,
            select: importSummarySelect,
        });

        return NextResponse.json({ ok: true, data: imports });
    } catch (error) {
        return handleRouteError(error, "Get imports");
    }
}

const fail = (message: string, status = 400) => NextResponse.json({ ok: false, message }, { status });

/**
 * Starts a leads import: checks the file and the column mapping, saves them as an ImportJob,
 * puts its id on the queue and answers straight away. The worker does the actual importing
 * in the background (src/lib/jobs/leadImport.ts), reporting progress live.
 * Sent as a form: `file` (the CSV) and `settings` (JSON: { mapping, defaults }).
 */
export async function POST(req: NextRequest) {
    try {
        const user = await requirePermission("lead:create");

        if (await tooManyAttempts(`import:${user.id}`, 10, 60 * 60 * 1000)) {
            return fail("That's a lot of imports in an hour. Please wait a little before the next one.", 429);
        }

        // the file and its settings, checked (the same as the import screen's check reads them)
        const upload = await readImportUpload(req, user);
        if ("error" in upload) return upload.error;
        const { file, csv, mapping, defaults, rows } = upload;
        const rowCount = rows.length;

        const job = await prisma.importJob.create({
            data: { organizationId: user.organizationId, userId: user.id, entity: "lead", fileName: file.name.slice(0, 200), mapping, defaults, csv, total: rowCount },
            select: importSummarySelect,
        });

        // only the id goes on the queue; the worker reads the rest from the database
        try {
            await importsQueue().add("leads", { importJobId: job.id }, { jobId: `import-${job.id}` });
        } catch {
            await prisma.importJob.update({ where: { id: job.id }, data: { status: "FAILED", error: "The import queue isn't available", csv: null } });
            return fail("Imports aren't available right now. Please try again in a few minutes.", 503);
        }

        return NextResponse.json({ ok: true, data: job }, { status: 201 });
    } catch (error) {
        return handleRouteError(error, "Start import");
    }
}
