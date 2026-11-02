import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { hasPermission, requirePermission } from "@/lib/auth/requirePermission";
import { handleRouteError, validationError } from "@/lib/api/http";
import { idParamSchema } from "@/lib/validations/common";
import { importScope, importSummarySelect } from "@/lib/jobs/leadImport";

// One import's progress and counts (the page also gets them live, over the socket)
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const user = await requirePermission("lead:create");

        const id = idParamSchema.safeParse((await params).id);
        if (!id.success) return validationError(id.error);

        const job = await prisma.importJob.findFirst({
            where: { id: id.data, ...importScope(user, hasPermission(user, "lead:all")) },
            select: importSummarySelect,
        });
        if (!job) return NextResponse.json({ ok: false, message: "Import not found" }, { status: 404 });

        return NextResponse.json({ ok: true, data: job });
    } catch (error) {
        return handleRouteError(error, "Get import");
    }
}
