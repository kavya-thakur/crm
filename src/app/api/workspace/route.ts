import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/auth/requirePermission";
import { handleRouteError, parseBody } from "@/lib/api/http";
import { assertNotDemo } from "@/lib/demo/workspace";
import { CURRENCIES } from "@/lib/utils/format";

const workspaceSchema = z.object({
    currency: z.enum(CURRENCIES.map((currency) => currency.code) as [string, ...string[]], "Pick one of the listed currencies"),
});

// Settings > Workspace: the workspace-wide settings (for now, its currency)
export async function PATCH(req: NextRequest) {
    try {
        const user = await requirePermission("workspace:manage");
        // the demo workspace is shared by every visitor
        assertNotDemo(user);

        const body = await parseBody(req, workspaceSchema);
        if (!body.success) return body.response;

        const workspace = await prisma.organization.update({
            where: { id: user.organizationId },
            data: body.data,
            select: { name: true, currency: true },
        });

        return NextResponse.json({ ok: true, message: "Workspace saved", data: workspace });
    } catch (error) {
        return handleRouteError(error, "Update workspace");
    }
}
