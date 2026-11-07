import { createToken } from "@/lib/auth/jwt";
import { hashPassword } from "@/lib/auth/password";
import { prisma } from "@/lib/db/prisma";
import { registerSchema } from "@/lib/validations/auth";
import { DEFAULT_PIPELINE_STAGES } from "@/lib/deals/stages";
import { DEFAULT_LEAD_STAGES } from "@/lib/leads/stages";
import { DEFAULT_LEAD_SOURCES } from "@/lib/leads/sources";
import { Prisma } from "@/generated/prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

export async function POST(req: NextRequest) {
    try {
        // invalid JSON becomes null, which the schema rejects with a 400
        const body = await req.json().catch(() => null);

        const parsed = registerSchema.safeParse(body);

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

        const { organizationName, name, email, password } = parsed.data;

        const passwordHash = await hashPassword(password);

        const result = await prisma.$transaction(async (tx) => {


            const organization = await tx.organization.create({
                data: {
                    name: organizationName,
                    slug: organizationName.toLowerCase().replace(/\s+/g, "-"),
                },
            });
            const adminRole = await tx.role.create({
                data: {
                    organizationId: organization.id,
                    name: "Admin",
                },
            });
            const permissions = await tx.permission.findMany()
            await tx.rolePermission.createMany({
                data: permissions.map((permission) => ({
                    roleId: adminRole.id,
                    permissionId: permission.id,
                })),
            });
            // the deals board needs stages before the first deal can be created
            await tx.pipelineStage.createMany({
                data: DEFAULT_PIPELINE_STAGES.map((stage) => ({
                    ...stage,
                    organizationId: organization.id,
                })),
            });
            // same for the leads board
            await tx.leadStage.createMany({
                data: DEFAULT_LEAD_STAGES.map((stage) => ({
                    ...stage,
                    organizationId: organization.id,
                })),
            });
            // and its source picker
            await tx.leadSource.createMany({
                data: DEFAULT_LEAD_SOURCES.map((source) => ({
                    ...source,
                    organizationId: organization.id,
                })),
            });
            const user = await tx.user.create({
                data: {
                    organizationId: organization.id,
                    roleId: adminRole.id,
                    name,
                    email,
                    passwordHash,
                    // whoever creates the workspace owns it
                    isOwner: true,
                },
            });
            return { organization, user }
        })
        const token = await createToken({ userId: result.user.id, organizationId: result.organization.id })



        const response = NextResponse.json(
            {
                ok: true,
                data: {
                    user: {
                        id: result.user.id,
                        name: result.user.name,
                        email: result.user.email,
                    },
                    organization: {
                        id: result.organization.id,
                        name: result.organization.name,
                    },
                },
            },
            { status: 201 }
        );

        response.cookies.set("access_token", token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            maxAge: 60 * 60 * 24,
            path: "/"
        })
        return response

    } catch (error) {
        // P2002 = unique constraint violation (User.email or Organization.slug)
        if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === "P2002"
        ) {
            return NextResponse.json(
                {
                    ok: false,
                    message:
                        error.meta?.modelName === "User"
                            ? "Email is already registered"
                            : "Organization name is already taken",
                },
                { status: 409 }
            );
        }

        console.error("Registration error:", error);

        return Response.json(
            {
                ok: false,
                message: "Something went wrong",
            },
            { status: 500 }
        );
    }
}

