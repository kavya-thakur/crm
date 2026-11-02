import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { hasPermission, requirePermission } from "@/lib/auth/requirePermission";
import { handleRouteError, validationError } from "@/lib/api/http";
import { idParamSchema } from "@/lib/validations/common";
import { importScope } from "@/lib/jobs/leadImport";

// The rows an import couldn't add, as a CSV with a "Problem" column: fix them, import that file
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const user = await requirePermission("lead:create");

        const id = idParamSchema.safeParse((await params).id);
        if (!id.success) return validationError(id.error);

        const job = await prisma.importJob.findFirst({
            where: { id: id.data, ...importScope(user, hasPermission(user, "lead:all")) },
            select: { fileName: true, errorsCsv: true },
        });
        if (!job?.errorsCsv) return NextResponse.json({ ok: false, message: "No problem rows for this import" }, { status: 404 });

        const name = job.fileName.replace(/\.csv$/i, "").replace(/[^\w.-]+/g, "_");
        return new NextResponse(job.errorsCsv, {
            headers: {
                "content-type": "text/csv; charset=utf-8",
                "content-disposition": `attachment; filename="${name}-problems.csv"`,
            },
        });
    } catch (error) {
        return handleRouteError(error, "Download import problems");
    }
}
