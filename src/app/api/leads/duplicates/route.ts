import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { hasPermission, requirePermission } from "@/lib/auth/requirePermission";
import { handleRouteError, validationError } from "@/lib/api/http";
import { searchParamsToObject } from "@/lib/validations/common";
import { findSimilarLeads } from "@/lib/leadDuplicates";

const duplicatesQuerySchema = z.object({
    email: z.string().trim().max(254).optional(),
    phone: z.string().trim().max(30).optional(),
});

// Asked while someone fills in "New lead": does this person already exist as a lead?
// Only a warning; creating the lead anyway is allowed (someone can come back for more).
export async function GET(req: NextRequest) {
    try {
        const user = await requirePermission("lead:create");

        const query = duplicatesQuerySchema.safeParse(searchParamsToObject(req.nextUrl.searchParams));

        if (!query.success) {
            return validationError(query.error);
        }

        const matches = await findSimilarLeads(user.organizationId, query.data);
        const seesAll = hasPermission(user, "lead:all");
        const email = query.data.email?.toLowerCase();

        return NextResponse.json({
            ok: true,
            data: matches.map((lead) => ({
                id: lead.id,
                name: lead.name,
                companyName: lead.companyName,
                stage: { name: lead.stage.name, color: lead.stage.color },
                // still being worked on, as opposed to converted or lost
                open: !lead.stage.isConverted && !lead.stage.isLost,
                owner: lead.assignedTo?.name ?? null,
                matchedOn: email && lead.email?.toLowerCase() === email ? "email" : "phone",
                // someone who only sees their own leads can't open a colleague's
                canOpen: seesAll || lead.assignedToId === user.id,
            })),
        });
    } catch (error) {
        return handleRouteError(error, "Find duplicate leads");
    }
}
