import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { findManageableRole } from "@/lib/auth/requirePermission";
import { startLogInAs } from "@/lib/auth/logInAs";
import { handleRouteError, parseBody, validationError } from "@/lib/api/http";
import { idParamSchema } from "@/lib/validations/common";
import { assertNotDemo } from "@/lib/demo/workspace";
import { firstName, notify } from "@/lib/realtime/notify";

type Params = { params: Promise<{ id: string }> };

const refuse = (message: string, status = 403) => NextResponse.json({ ok: false, message }, { status });

async function signedIn() {
    const user = await getCurrentUser();
    if (!user) throw new Error("UNAUTHORIZED");
    // the demo workspace is one account shared by every visitor
    assertNotDemo(user);
    return user;
}

async function teammate(organizationId: number, params: Params["params"]) {
    const id = idParamSchema.safeParse((await params).id);
    if (!id.success) return { error: validationError(id.error) };
    const person = await prisma.user.findFirst({ where: { id: id.data, organizationId }, select: { id: true, name: true, roleId: true, isOwner: true } });
    return person ? { person } : { error: refuse("Member not found", 404) };
}

/**
 * "Log in as": opens a teammate's account without their password, for an hour. Only the
 * workspace owner, and the people they allowed, can. Your own session is kept aside (another
 * cookie) for "Back to my account", and the teammate is told it happened.
 */
export async function POST(_req: NextRequest, { params }: Params) {
    try {
        const user = await signedIn();
        if (!user.isOwner && !user.canLogInAs) return refuse("Only the workspace owner, and the people they allow, can log in as teammates");
        if (user.actingAsId) return refuse("Go back to your own account first", 400);

        const found = await teammate(user.organizationId, params);
        if (!found.person) return found.error;
        const { person } = found;
        if (person.id === user.id) return refuse("That's you", 400);

        // the owner can open anyone's account; anyone else, only accounts that can't do more than theirs
        if (!user.isOwner) {
            if (person.isOwner) return refuse("Only the owner can open the owner's account");
            try {
                await findManageableRole(user, person.roleId);
            } catch {
                return refuse(`${person.name} can do things you can't, so you can't log in as them`);
            }
        }

        await startLogInAs(user.id, { id: person.id, organizationId: user.organizationId });

        await notify([person.id], {
            organizationId: user.organizationId,
            actorId: user.id,
            type: "LOGGED_IN_AS",
            title: `${firstName(user.name)} logged in to your account`,
            body: "From Settings → Members, to see what you see. Anything changed meanwhile shows as changed by you.",
        });

        return NextResponse.json({ ok: true, message: `You're logged in as ${person.name}` });
    } catch (error) {
        return handleRouteError(error, "Log in as");
    }
}

const allowSchema = z.object({ allowed: z.boolean() });

// The owner gives someone the right to log in as teammates, or takes it back
export async function PUT(req: NextRequest, { params }: Params) {
    try {
        const user = await signedIn();
        if (!user.isOwner || user.actingAsId) return refuse("Only the workspace owner can decide this");

        const body = await parseBody(req, allowSchema);
        if (!body.success) return body.response;

        const found = await teammate(user.organizationId, params);
        if (!found.person) return found.error;
        if (found.person.isOwner) return refuse("The owner can always do this", 400);

        await prisma.user.update({ where: { id: found.person.id }, data: { canLogInAs: body.data.allowed } });
        return NextResponse.json({
            ok: true,
            message: body.data.allowed ? `${found.person.name} can now log in as teammates` : `${found.person.name} can no longer log in as teammates`,
        });
    } catch (error) {
        return handleRouteError(error, "Allow log in as");
    }
}
