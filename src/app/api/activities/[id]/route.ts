import { handleRouteError, parseBody, validationError } from "@/lib/api/http";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { activityScope } from "@/lib/auth/requirePermission";
import { activityInclude, allAgentsInOrganization } from "@/lib/activities";
import { prisma } from "@/lib/db/prisma";
import { updateScheduledActivitySchema } from "@/lib/validations/scheduledActivities";
import { idParamSchema } from "@/lib/validations/common";
import { NextRequest, NextResponse } from "next/server";
import { firstName, notify } from "@/lib/realtime/notify";

type Params = { params: Promise<{ id: string }> };

function activityNotFound() {
    return NextResponse.json(
        {
            ok: false,
            message: "Activity not found",
        },
        { status: 404 }
    );
}

export async function GET(req: NextRequest, { params }: Params) {
    try {
        const user = await getCurrentUser();

        if (!user) {
            throw new Error("UNAUTHORIZED");
        }

        const id = idParamSchema.safeParse((await params).id);

        if (!id.success) {
            return validationError(id.error);
        }

        const activity = await prisma.scheduledActivity.findFirst({
            where: {
                id: id.data,
                ...activityScope(user),
            },
            include: activityInclude,
        });

        if (!activity) {
            return activityNotFound();
        }

        return NextResponse.json({
            ok: true,
            data: activity,
        });
    } catch (error) {
        return handleRouteError(error, "Get activity");
    }
}

export async function PUT(req: NextRequest, { params }: Params) {
    try {
        const user = await getCurrentUser();

        if (!user) {
            throw new Error("UNAUTHORIZED");
        }

        const id = idParamSchema.safeParse((await params).id);

        if (!id.success) {
            return validationError(id.error);
        }

        const body = await parseBody(req, updateScheduledActivitySchema);

        if (!body.success) {
            return body.response;
        }

        const existingActivity = await prisma.scheduledActivity.findFirst({
            where: {
                id: id.data,
                ...activityScope(user),
            },
            select: { id: true, assignedToId: true, scheduledAt: true, attendees: { select: { id: true } } },
        });

        if (!existingActivity) {
            return activityNotFound();
        }

        const { assignedToId, attendeeIds, ...fields } = body.data;

        // Verify the new assignee and everyone newly tagged belong to this organization.
        if (assignedToId !== undefined && !(await allAgentsInOrganization([assignedToId], user.organizationId))) {
            return NextResponse.json({ ok: false, message: "Invalid assigned agent" }, { status: 400 });
        }

        if (attendeeIds && !(await allAgentsInOrganization(attendeeIds, user.organizationId))) {
            return NextResponse.json({ ok: false, message: "Invalid attendee" }, { status: 400 });
        }

        // the scope in the where too, so the write itself is checked; if the activity
        // is deleted in between, Prisma throws P2025 -> 404
        const updatedActivity = await prisma.scheduledActivity.update({
            where: {
                id: id.data,
                AND: [activityScope(user)],
            },
            data: {
                ...fields,
                ...(assignedToId !== undefined && { assignedToId }),
                // `set` swaps the whole tagged list for the one sent
                ...(attendeeIds && { attendees: { set: [...new Set(attendeeIds)].map((agentId) => ({ id: agentId })) } }),
                // moved to another time: its 10-minute reminder goes out again, for the new time
                ...(fields.scheduledAt !== undefined &&
                    new Date(fields.scheduledAt).getTime() !== existingActivity.scheduledAt.getTime() && { reminderSentAt: null }),
            },
            include: activityInclude,
        });

        // only the people newly on it hear about it: a new owner, or someone newly tagged
        const before = new Set([existingActivity.assignedToId, ...existingActivity.attendees.map((attendee) => attendee.id)]);
        const added = [assignedToId, ...(attendeeIds ?? [])].filter((agentId): agentId is number => agentId !== undefined && !before.has(agentId));
        await notify(added, {
            organizationId: user.organizationId,
            actorId: user.id,
            type: "ACTIVITY_INVITED",
            title: `${firstName(user.name)} added you to a ${updatedActivity.type === "OTHER" ? "calendar item" : updatedActivity.type.toLowerCase()}`,
            body: updatedActivity.title,
            link: `/activities?open=${updatedActivity.id}`,
        });

        return NextResponse.json({
            ok: true,
            data: updatedActivity,
        });
    } catch (error) {
        return handleRouteError(error, "Update activity");
    }
}

export async function DELETE(req: NextRequest, { params }: Params) {
    try {
        const user = await getCurrentUser();

        if (!user) {
            throw new Error("UNAUTHORIZED");
        }

        const id = idParamSchema.safeParse((await params).id);

        if (!id.success) {
            return validationError(id.error);
        }

        // One query that checks the activity is theirs to touch and deletes, so there's no gap for a race
        const { count } = await prisma.scheduledActivity.deleteMany({
            where: {
                id: id.data,
                ...activityScope(user),
            },
        });

        if (count === 0) {
            return activityNotFound();
        }

        return NextResponse.json({
            ok: true,
            message: "Activity deleted successfully",
        });
    } catch (error) {
        return handleRouteError(error, "Delete activity");
    }
}
