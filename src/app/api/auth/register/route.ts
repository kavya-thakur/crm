import { createToken, SESSION_SECONDS, sessionCookie } from "@/lib/auth/jwt";
import { hashPassword } from "@/lib/auth/password";
import { prisma } from "@/lib/db/prisma";
import { registerSchema } from "@/lib/validations/auth";
import { createPipeline, DEFAULT_PIPELINE_NAME, DEFAULT_PIPELINE_STAGES } from "@/lib/deals/stages";
import { DEFAULT_LEAD_STAGES } from "@/lib/leads/stages";
import { DEFAULT_LEAD_SOURCES } from "@/lib/leads/sources";
import { Prisma } from "@/generated/prisma/client";
import { randomUUID } from "node:crypto";
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

        const { email, password } = parsed.data;

        const passwordHash = await hashPassword(password);

        const result = await prisma.$transaction(async (tx) => {


            // named in /onboarding, right after this. The slug is only an internal id, so two
            // companies can share a name
            const organization = await tx.organization.create({
                data: {
                    name: "",
                    slug: `ws-${randomUUID()}`,
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
            // the deals board needs a pipeline and its stages before the first deal can be created
            await createPipeline(tx, { organizationId: organization.id, name: DEFAULT_PIPELINE_NAME, order: 0 }, DEFAULT_PIPELINE_STAGES);
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
                    name: "",
                    email,
                    passwordHash,
                    // whoever creates the workspace owns it
                    isOwner: true,
                    needsOnboarding: true,
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

        response.cookies.set("access_token", token, sessionCookie(SESSION_SECONDS))
        return response

    } catch (error) {
        // P2002 = unique constraint violation: User.email (the slug is random)
        if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === "P2002"
        ) {
            return NextResponse.json(
                { ok: false, message: "Email is already registered" },
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

