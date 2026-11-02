import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { verifyPassword } from "@/lib/auth/password";
import { createToken } from "@/lib/auth/jwt";
import { loginSchema } from "@/lib/validations/auth";
import { tooManyAttempts, visitorOf } from "@/lib/api/rateLimit";
import { z } from "zod";

export async function POST(req: NextRequest) {
    try {
        const body = await req.json().catch(() => null);

        const parsed = loginSchema.safeParse(body);

        if (!parsed.success) {
            return NextResponse.json(
                {
                    ok: false,
                    message: "Invalid request data",
                    errors: z.flattenError(parsed.error).fieldErrors,
                },
                { status: 400 }
            );
        }

        const { email, password } = parsed.data;

        // password guessing: 10 tries per 15 minutes from one place for one account. Per place
        // and account together, so nobody can lock a real user out from somewhere else.
        if (await tooManyAttempts(`login:${visitorOf(req.headers)}:${email.toLowerCase()}`, 10, 15 * 60 * 1000)) {
            return NextResponse.json(
                { ok: false, message: "Too many sign-in attempts. Please wait 15 minutes and try again." },
                { status: 429 }
            );
        }

        const user = await prisma.user.findUnique({
            where: {
                email,
            },
        });

        if (!user) {
            return NextResponse.json(
                {
                    ok: false,
                    message: "Invalid email or password",
                },
                { status: 401 }
            );
        }

        const isPasswordValid = await verifyPassword(
            password,
            user.passwordHash
        );

        if (!isPasswordValid) {
            return NextResponse.json(
                {
                    ok: false,
                    message: "Invalid email or password",
                },
                { status: 401 }
            );
        }
        const token = await createToken({ userId: user.id, organizationId: user.organizationId })
        const response = NextResponse.json({
            ok: true,
            message: "Login successful",
            data: {
                user: {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    organizationId: user.organizationId,
                },
            },
        });

        response.cookies.set("access_token", token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            maxAge: 60 * 60 * 24,
            path: "/"
        })

        return response
    } catch (error) {
        console.error("Login error:", error);

        return NextResponse.json(
            {
                ok: false,
                message: "Something went wrong",
            },
            { status: 500 }
        );
    }
}