import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { hasPermission, requirePermission } from "@/lib/auth/requirePermission";
import { handleRouteError, validationError } from "@/lib/api/http";
import { idParamSchema, searchParamsToObject } from "@/lib/validations/common";
import { findSimilarLeads, isOpen, matchKeys } from "@/lib/leadDuplicates";

const duplicatesQuerySchema = z.object({
    email: z.string().trim().max(254).optional(),
    phone: z.string().trim().max(30).optional(),
    // asking about an existing lead: leave it out of its own matches
    exceptId: idParamSchema.optional(),
});

// Asked while someone fills in "New lead": does this person already exist as a lead?
// Only a warning; creating the lead anyway is allowed (someone can come back for more).
// A lead's panel asks it too, to offer merging the copies.
export async function GET(req: NextRequest) {
    try {
        const user = await requirePermission("lead:read");

        const query = duplicatesQuerySchema.safeParse(searchParamsToObject(req.nextUrl.searchParams));

        if (!query.success) {
            return validationError(query.error);
        }

        const matches = await findSimilarLeads(user.organizationId, query.data);
        const seesAll = hasPermission(user, "lead:all");
        const { emailKey } = matchKeys(query.data);

        return NextResponse.json({
            ok: true,
            data: matches.map((lead) => ({
                id: lead.id,
                name: lead.name,
                companyName: lead.companyName,
                stage: { name: lead.stage.name, color: lead.stage.color },
                // still being worked on, as opposed to converted or lost
                open: isOpen(lead.stage),
                owner: lead.assignedTo?.name ?? null,
                matchedOn: emailKey && lead.emailKey === emailKey ? "email" : "phone",
                // someone who only sees their own leads can't open a colleague's
                canOpen: seesAll || lead.assignedToId === user.id,
            })),
        });
    } catch (error) {
        return handleRouteError(error, "Find duplicate leads");
    }
}
