import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/generated/prisma/client";

// What every activity response carries: who it's for, who's tagged, and the record it's about
export const activityInclude = {
    assignedTo: { select: { id: true, name: true, email: true } },
    attendees: { select: { id: true, name: true, email: true } },
    lead: { select: { id: true, name: true } },
    deal: { select: { id: true, title: true } },
    contact: { select: { id: true, name: true } },
} satisfies Prisma.ScheduledActivityInclude;

// True when every one of these ids is an agent of this organization (an empty list is fine)
export async function allAgentsInOrganization(agentIds: number[], organizationId: number) {
    const unique = [...new Set(agentIds)];

    if (unique.length === 0) {
        return true;
    }

    const found = await prisma.user.count({
        where: { id: { in: unique }, organizationId },
    });

    return found === unique.length;
}
