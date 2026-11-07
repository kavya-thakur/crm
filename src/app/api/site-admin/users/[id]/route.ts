import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db/prisma";
import { handleRouteError, parseBody, validationError } from "@/lib/api/http";
import { idParamSchema } from "@/lib/validations/common";
import { isRootAdmin, isSiteAdmin, requireSiteAdmin } from "@/lib/auth/siteAdmin";
import { startLogInAs } from "@/lib/auth/logInAs";

type Params = { params: Promise<{ id: string }> };

const refuse = (message: string, status = 403) => NextResponse.json({ ok: false, message }, { status });

async function findPerson(params: Params["params"]) {
    const id = idParamSchema.safeParse((await params).id);
    if (!id.success) return { error: validationError(id.error) };
    const person = await prisma.user.findUnique({ where: { id: id.data }, select: { id: true, name: true, email: true, organizationId: true, isSiteAdmin: true } });
    return person ? { person } : { error: refuse("User not found", 404) };
}

/**
 * "Log in as" anyone on the website, in any workspace, for an hour (the same orange bar and "Back
 * to my account" as a workspace owner's). For support, so the person isn't notified. Only a root
 * admin can open another site admin's account.
 */
export async function POST(_req: NextRequest, { params }: Params) {
    try {
        const admin = await requireSiteAdmin();

        const found = await findPerson(params);
        if (!found.person) return found.error;
        const { person } = found;
        if (person.id === admin.id) return refuse("That's you", 400);
        if (isSiteAdmin(person) && !isRootAdmin(admin)) return refuse("Only a root admin can open another site admin's account");

        await startLogInAs(admin.id, person);
        return NextResponse.json({ ok: true, message: `You're logged in as ${person.name}` });
    } catch (error) {
        return handleRouteError(error, "Site admin log in as");
    }
}

const siteAdminSchema = z.object({ siteAdmin: z.boolean() });

// A root admin makes someone a site admin, or stops them being one (roots themselves are set by email)
export async function PUT(req: NextRequest, { params }: Params) {
    try {
        const admin = await requireSiteAdmin();
        if (!isRootAdmin(admin)) return refuse("Only a root admin (in SITE_ADMIN_EMAILS) can decide who else is a site admin");

        const body = await parseBody(req, siteAdminSchema);
        if (!body.success) return body.response;

        const found = await findPerson(params);
        if (!found.person) return found.error;
        if (isRootAdmin(found.person)) return refuse("A root admin is set by email in the server's settings", 400);

        await prisma.user.update({ where: { id: found.person.id }, data: { isSiteAdmin: body.data.siteAdmin } });
        return NextResponse.json({
            ok: true,
            message: body.data.siteAdmin ? `${found.person.name} is now a site admin` : `${found.person.name} is no longer a site admin`,
        });
    } catch (error) {
        return handleRouteError(error, "Set site admin");
    }
}
