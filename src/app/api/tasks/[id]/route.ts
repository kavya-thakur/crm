import { handleRouteError, parseBody, validationError } from "@/lib/api/http";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { taskScope } from "@/lib/auth/requirePermission";
import { prisma } from "@/lib/db/prisma";
import { addTaskToTimeline, dueDateToDb, taskInclude } from "@/lib/tasks";
import { updateTaskSchema } from "@/lib/validations/tasks";
import { idParamSchema } from "@/lib/validations/common";
import { NextRequest, NextResponse } from "next/server";

type Params = { params: Promise<{ id: string }> };

function taskNotFound() {
    return NextResponse.json(
        {
            ok: false,
            message: "Task not found",
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

        const task = await prisma.task.findFirst({
            where: {
                id: id.data,
                ...taskScope(user),
            },
            include: taskInclude,
        });

        if (!task) {
            return taskNotFound();
        }

        return NextResponse.json({
            ok: true,
            data: task,
        });
    } catch (error) {
        return handleRouteError(error, "Get task");
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

        const body = await parseBody(req, updateTaskSchema);

        if (!body.success) {
            return body.response;
        }

        const existingTask = await prisma.task.findFirst({
            where: {
                id: id.data,
                ...taskScope(user),
            },
            select: { status: true },
        });

        if (!existingTask) {
            return taskNotFound();
        }

        const { assignedToId, dueDate, ...fields } = body.data;

        // Verify the new assignee belongs to this organization, if changing it.
        if (assignedToId !== undefined && assignedToId !== user.id) {
            const agent = await prisma.user.findFirst({
                where: { id: assignedToId, organizationId: user.organizationId },
                select: { id: true },
            });

            if (!agent) {
                return NextResponse.json({ ok: false, message: "Invalid assigned agent" }, { status: 400 });
            }
        }

        // the scope in the where too, so the write itself is checked; if the task
        // is deleted in between, Prisma throws P2025 -> 404
        const updatedTask = await prisma.$transaction(async (tx) => {
            const updated = await tx.task.update({
                where: {
                    id: id.data,
                    AND: [taskScope(user)],
                },
                data: {
                    ...fields,
                    ...(assignedToId !== undefined && { assignedToId }),
                    ...(dueDate !== undefined && { dueDate: dueDateToDb(dueDate) }),
                },
                include: taskInclude,
            });

            // Only the moment it gets ticked off goes on the timeline, not every later save
            if (fields.status === "COMPLETED" && existingTask.status !== "COMPLETED") {
                await addTaskToTimeline(tx, updated, user.id, "completed");
            }

            return updated;
        });

        return NextResponse.json({
            ok: true,
            data: updatedTask,
        });
    } catch (error) {
        return handleRouteError(error, "Update task");
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

        // One query that checks the task is theirs to touch and deletes, so there's no gap for a race
        const { count } = await prisma.task.deleteMany({
            where: {
                id: id.data,
                ...taskScope(user),
            },
        });

        if (count === 0) {
            return taskNotFound();
        }

        return NextResponse.json({
            ok: true,
            message: "Task deleted successfully",
        });
    } catch (error) {
        return handleRouteError(error, "Delete task");
    }
}
