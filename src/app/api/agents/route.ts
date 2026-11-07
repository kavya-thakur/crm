import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/generated/prisma/client";
import { findManageableRole, requirePermission } from "@/lib/auth/requirePermission";
import { hashPassword } from "@/lib/auth/password";
import { createAgentSchema } from "@/lib/validations/agents";
import { handleRouteError, parseBody } from "@/lib/api/http";
import { assertNotDemo } from "@/lib/demo/workspace";

// Never select passwordHash into a response
const agentSelect = {
    id: true,
    name: true,
    email: true,
    createdAt: true,
    updatedAt: true,
    role: { select: { id: true, name: true } },
    // Members shows the owner, and who the owner lets "Log in as" teammates
    isOwner: true,
    canLogInAs: true,
} satisfies Prisma.UserSelect;

export async function POST(req: NextRequest) {
    try {
        const user = await requirePermission("user:create");
        // the demo workspace stays the same for every visitor
        assertNotDemo(user);

        const body = await parseBody(req, createAgentSchema);

        if (!body.success) {
            return body.response;
        }

        const { name, email, password, roleId } = body.data;

        const existingUser = await prisma.user.findUnique({
            where: { email },
            select: { id: true },
        });

        if (existingUser) {
            return NextResponse.json(
                { ok: false, message: "An account with this email already exists" },
                { status: 409 }
            );
        }

        // Assigning a role grants its permissions, so it can't be stronger than yours
        const role = await findManageableRole(user, roleId);

        if (!role) {
            return NextResponse.json(
                { ok: false, message: "Role not found in your organization" },
                { status: 404 }
            );
        }

        // If the same email is registered in between, the unique index throws P2002 -> 409
        const agent = await prisma.user.create({
            data: {
                organizationId: user.organizationId,
                roleId: role.id,
                name,
                email,
                passwordHash: await hashPassword(password),
            },
            select: agentSelect,
        });

        return NextResponse.json(
            {
                ok: true,
                message: "Agent created successfully",
                data: agent,
            },
            { status: 201 }
        );
    } catch (error) {
        return handleRouteError(error, "Create agent");
    }
}

export async function GET() {
    try {
        const user = await requirePermission("user:read");

        // ponytail: no pagination/search, fine for org-sized lists (assignment dropdowns); add like /api/leads when orgs get big
        const agents = await prisma.user.findMany({
            where: { organizationId: user.organizationId },
            select: agentSelect,
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        });

        return NextResponse.json({
            ok: true,
            data: agents,
        });
    } catch (error) {
        return handleRouteError(error, "Get agents");
    }
}
