import { handleRouteError, parseBody, validationError } from "@/lib/api/http";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { activityScope, contactScope, dealScope, leadScope } from "@/lib/auth/requirePermission";
import { activityInclude, allAgentsInOrganization } from "@/lib/work/activities";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/generated/prisma/client";
import { createScheduledActivitySchema, listScheduledActivitiesQuerySchema } from "@/lib/validations/scheduledActivities";
import { searchParamsToObject } from "@/lib/validations/common";
import { NextRequest, NextResponse } from "next/server";
import { firstName, notify } from "@/lib/realtime/notify";

// ponytail: a month of a whole team's calls and meetings, at most; page the range if a team books more
const RANGE_MAX = 1000;

export async function POST(req: NextRequest) {
    try {
        const user = await getCurrentUser()
        if (!user) {
            throw new Error("UNAUTHORIZED")
        }

        const body = await parseBody(req, createScheduledActivitySchema)
        if (!body.success) {
            return body.response;
        }

        const { leadId, dealId, contactId, assignedToId, attendeeIds = [], ...fields } = body.data

        // Verify the linked record (if any) belongs to this organization
        const [lead, deal, contact] = await Promise.all([
            leadId != null
                ? prisma.lead.findFirst({ where: { id: leadId, ...leadScope(user) }, select: { id: true } })
                : null,
            dealId != null
                ? prisma.deal.findFirst({ where: { id: dealId, ...dealScope(user) }, select: { id: true } })
                : null,
            contactId != null
                ? prisma.contact.findFirst({ where: { id: contactId, ...contactScope(user) }, select: { id: true } })
                : null,
        ])

        if (leadId != null && !lead) {
            return NextResponse.json({ ok: false, message: "Invalid lead" }, { status: 400 });
        }
        if (dealId != null && !deal) {
            return NextResponse.json({ ok: false, message: "Invalid deal" }, { status: 400 });
        }
        if (contactId != null && !contact) {
            return NextResponse.json({ ok: false, message: "Invalid contact" }, { status: 400 });
        }

        // Verify the assigned agent and everyone tagged belong to this organization;
        // omitted assignee = assign to the creator
        if (assignedToId !== undefined && !(await allAgentsInOrganization([assignedToId], user.organizationId))) {
            return NextResponse.json({ ok: false, message: "Invalid assigned agent" }, { status: 400 });
        }

        if (!(await allAgentsInOrganization(attendeeIds, user.organizationId))) {
            return NextResponse.json({ ok: false, message: "Invalid attendee" }, { status: 400 });
        }

        const activity = await prisma.scheduledActivity.create({
            data: {
                ...fields,
                leadId: leadId ?? null,
                dealId: dealId ?? null,
                contactId: contactId ?? null,
                assignedToId: assignedToId ?? user.id,
                attendees: { connect: [...new Set(attendeeIds)].map((id) => ({ id })) },
                organizationId: user.organizationId,
                createdById: user.id,
            },
            include: activityInclude,
        })

        // whoever it's for, and everyone tagged on it, hear about it (not the person booking it)
        await notify([activity.assignedToId, ...attendeeIds], {
            organizationId: user.organizationId,
            actorId: user.id,
            type: "ACTIVITY_INVITED",
            title: `${firstName(user.name)} added you to a ${activity.type === "OTHER" ? "calendar item" : activity.type.toLowerCase()}`,
            body: activity.title,
            link: `/activities?open=${activity.id}`,
        });

        return NextResponse.json(
            {
                ok: true,
                message: "Activity created successfully",
                data: activity,
            },
            { status: 201 }
        );

    } catch (error) {
        return handleRouteError(error, "Creating activity")
    }
}

export async function GET(req: NextRequest) {
    try {
        const user = await getCurrentUser()
        if (!user) {
            throw new Error("UNAUTHORIZED")
        }

        const query = listScheduledActivitiesQuerySchema.safeParse(
            searchParamsToObject(req.nextUrl.searchParams)
        );

        if (!query.success) {
            return validationError(query.error);
        }

        const { page, limit, scope, status, assignedTo, leadId, dealId, contactId, from, to } = query.data;

        const now = new Date();

        // "upcoming"/"overdue" split SCHEDULED activities by whether their time has
        // passed; completed/cancelled are their own final states; "all" ignores both
        const scopeFilter: Prisma.ScheduledActivityWhereInput =
            scope === "upcoming"
                ? { status: "SCHEDULED", scheduledAt: { gte: now } }
                : scope === "overdue"
                    ? { status: "SCHEDULED", scheduledAt: { lt: now } }
                    : scope === "completed"
                        ? { status: "COMPLETED" }
                        : scope === "cancelled"
                            ? { status: "CANCELLED" }
                            : {};

        const where: Prisma.ScheduledActivityWhereInput = {
            // whose activities this person may see at all; everything below only narrows it
            AND: [activityScope(user), ...(from ? [{ scheduledAt: { gte: from } }] : []), ...(to ? [{ scheduledAt: { lt: to } }] : [])],
            ...scopeFilter,
            ...(status && { status }),
            // an agent's schedule is what's assigned to them plus what they're tagged on
            ...(assignedTo !== undefined && {
                OR: [
                    { assignedToId: assignedTo === "me" ? user.id : assignedTo },
                    { attendees: { some: { id: assignedTo === "me" ? user.id : assignedTo } } },
                ],
            }),
            ...(leadId !== undefined && { leadId }),
            ...(dealId !== undefined && { dealId }),
            ...(contactId !== undefined && { contactId }),
        };

        // Soonest due first while still scheduled, most recently resolved first once
        // completed/cancelled — id as tie-breaker so same-minute activities stay stable
        const sortOrder = scope === "upcoming" || scope === "overdue" || status === "SCHEDULED" ? "asc" : "desc";

        const [activities, total] = await Promise.all([
            prisma.scheduledActivity.findMany({
                where,
                orderBy: [{ scheduledAt: sortOrder }, { id: sortOrder }],
                // a date range comes whole (a calendar shows every day of it), pages otherwise
                skip: to ? 0 : (page - 1) * limit,
                take: to ? RANGE_MAX : limit,
                include: activityInclude,
            }),

            prisma.scheduledActivity.count({ where }),
        ]);

        return NextResponse.json({
            ok: true,
            data: activities,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        });
    } catch (error) {
        return handleRouteError(error, "Get activities")
    }
}