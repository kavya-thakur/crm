import { handleRouteError, parseBody, validationError } from "@/lib/api/http";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { contactScope, dealScope, leadScope, taskScope } from "@/lib/auth/requirePermission";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/generated/prisma/client";
import { addTaskToTimeline, dueDateToDb, startOfToday, taskInclude } from "@/lib/tasks";
import { createTaskSchema, listTasksQuerySchema } from "@/lib/validations/tasks";
import { searchParamsToObject } from "@/lib/validations/common";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
    try {
        const user = await getCurrentUser();

        if (!user) {
            throw new Error("UNAUTHORIZED");
        }

        const body = await parseBody(req, createTaskSchema);

        if (!body.success) {
            return body.response;
        }

        const { leadId, dealId, contactId, assignedToId, dueDate, ...fields } = body.data;

        // Verify the linked record (if any) belongs to this organization
        if (leadId !== undefined) {
            const lead = await prisma.lead.findFirst({
                where: { id: leadId, ...leadScope(user) },
                select: { id: true },
            });

            if (!lead) {
                return NextResponse.json({ ok: false, message: "Invalid lead" }, { status: 400 });
            }
        }

        if (dealId !== undefined) {
            const deal = await prisma.deal.findFirst({
                where: { id: dealId, ...dealScope(user) },
                select: { id: true },
            });

            if (!deal) {
                return NextResponse.json({ ok: false, message: "Invalid deal" }, { status: 400 });
            }
        }

        if (contactId !== undefined) {
            const contact = await prisma.contact.findFirst({
                where: { id: contactId, ...contactScope(user) },
                select: { id: true },
            });

            if (!contact) {
                return NextResponse.json({ ok: false, message: "Invalid contact" }, { status: 400 });
            }
        }

        // Verify the assigned agent belongs to this organization; omitted = the creator does it
        if (assignedToId !== undefined && assignedToId !== user.id) {
            const agent = await prisma.user.findFirst({
                where: { id: assignedToId, organizationId: user.organizationId },
                select: { id: true },
            });

            if (!agent) {
                return NextResponse.json({ ok: false, message: "Invalid assigned agent" }, { status: 400 });
            }
        }

        // The task and its timeline entry are saved together, so a task is never
        // on a record's timeline without existing (or the other way round)
        const task = await prisma.$transaction(async (tx) => {
            const created = await tx.task.create({
                data: {
                    ...fields,
                    dueDate: dueDateToDb(dueDate),
                    leadId: leadId ?? null,
                    dealId: dealId ?? null,
                    contactId: contactId ?? null,
                    assignedToId: assignedToId ?? user.id,
                    organizationId: user.organizationId,
                    createdById: user.id,
                },
                include: taskInclude,
            });

            await addTaskToTimeline(tx, created, user.id, "created");

            return created;
        });

        return NextResponse.json(
            {
                ok: true,
                message: "Task created successfully",
                data: task,
            },
            { status: 201 }
        );
    } catch (error) {
        return handleRouteError(error, "Create task");
    }
}

export async function GET(req: NextRequest) {
    try {
        const user = await getCurrentUser();

        if (!user) {
            throw new Error("UNAUTHORIZED");
        }

        const query = listTasksQuerySchema.safeParse(
            searchParamsToObject(req.nextUrl.searchParams)
        );

        if (!query.success) {
            return validationError(query.error);
        }

        const { page, limit, scope, status, assignedTo, priority, leadId, dealId, contactId } = query.data;

        // "open" is everything not done yet: to do and in progress
        const scopeFilter: Prisma.TaskWhereInput =
            scope === "open"
                ? { status: { not: "COMPLETED" } }
                : scope === "overdue"
                    ? { status: { not: "COMPLETED" }, dueDate: { lt: startOfToday() } }
                    : scope === "completed"
                        ? { status: "COMPLETED" }
                        : {};

        const where: Prisma.TaskWhereInput = {
            // whose tasks this person may see at all; everything below only narrows it
            AND: [taskScope(user)],
            ...scopeFilter,
            ...(status && { status }),
            ...(assignedTo !== undefined && {
                assignedToId: assignedTo === "me" ? user.id : assignedTo,
            }),
            ...(priority && { priority }),
            ...(leadId !== undefined && { leadId }),
            ...(dealId !== undefined && { dealId }),
            ...(contactId !== undefined && { contactId }),
        };

        // Most urgent first while there's still something to do, most recent first once
        // it's done; among tasks due the same day the higher priority comes first, and
        // id is the last tie-breaker so the order stays stable
        const stillToDo = scope === "open" || scope === "overdue" || (status !== undefined && status !== "COMPLETED");
        const sortOrder = stillToDo ? "asc" : "desc";

        const [tasks, total] = await Promise.all([
            prisma.task.findMany({
                where,
                orderBy: [{ dueDate: sortOrder }, { priority: "desc" }, { id: sortOrder }],
                skip: (page - 1) * limit,
                take: limit,
                include: taskInclude,
            }),

            prisma.task.count({ where }),
        ]);

        return NextResponse.json({
            ok: true,
            data: tasks,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        });
    } catch (error) {
        return handleRouteError(error, "Get tasks");
    }
}
