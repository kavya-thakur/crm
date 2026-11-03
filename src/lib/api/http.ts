import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";

// ponytail: trusts Content-Length; chunked bodies skip it, so also cap body size at the proxy (nginx client_max_body_size)
const MAX_BODY_BYTES = 100_000;

export function validationError(error: z.ZodError) {
    const { formErrors, fieldErrors } = z.flattenError(error);

    return NextResponse.json(
        {
            ok: false,
            // formErrors = problems with the body as a whole (not an object, empty update, ...)
            message: formErrors[0] ?? "Invalid request data",
            errors: fieldErrors,
        },
        { status: 400 }
    );
}

// Reads and validates a JSON body. Invalid JSON is handled like any other invalid body (400).
export async function parseBody<T extends z.ZodType>(req: NextRequest, schema: T) {
    if (Number(req.headers.get("content-length")) > MAX_BODY_BYTES) {
        return {
            success: false as const,
            response: NextResponse.json(
                { ok: false, message: "Request body too large" },
                { status: 413 }
            ),
        };
    }

    const body = await req.json().catch(() => null);
    const result = schema.safeParse(body);

    if (!result.success) {
        return { success: false as const, response: validationError(result.error) };
    }

    return { success: true as const, data: result.data as z.output<T> };
}

// One place that turns thrown errors into responses, instead of a copy in every route
export function handleRouteError(error: unknown, context: string) {
    if (error instanceof Error) {
        if (error.message === "UNAUTHORIZED") {
            return NextResponse.json(
                { ok: false, message: "Unauthorized" },
                { status: 401 }
            );
        }

        if (error.message === "FORBIDDEN") {
            return NextResponse.json(
                { ok: false, message: "You do not have permission to perform this action" },
                { status: 403 }
            );
        }

        // thrown by assertNotDemo
        if (error.message === "DEMO") {
            return NextResponse.json(
                { ok: false, message: "That's switched off in the demo workspace, so it stays the same for everyone exploring it." },
                { status: 403 }
            );
        }
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
        // The record was deleted between our check and the write (concurrent request)
        if (error.code === "P2025") {
            return NextResponse.json(
                { ok: false, message: "Resource not found" },
                { status: 404 }
            );
        }

        // Unique constraint hit by a concurrent request that passed the same pre-check
        if (error.code === "P2002") {
            return NextResponse.json(
                { ok: false, message: "This already exists" },
                { status: 409 }
            );
        }

        // A row we point to (lead, user) was deleted concurrently
        if (error.code === "P2003") {
            return NextResponse.json(
                { ok: false, message: "Data changed while saving, please retry" },
                { status: 409 }
            );
        }
    }

    console.error(`${context} error:`, error);

    return NextResponse.json(
        { ok: false, message: "Something went wrong" },
        { status: 500 }
    );
}
