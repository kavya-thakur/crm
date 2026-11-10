import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { hasPermission } from "@/lib/auth/requirePermission";
import { handleRouteError, parseBody } from "@/lib/api/http";
import { tooManyAttempts } from "@/lib/api/rateLimit";
import { assertNotDemo } from "@/lib/demo/workspace";
import { checkMailbox, encryptSecret } from "@/lib/emails/account";
import { emailAccountSchema } from "@/lib/validations/emails";

/*
 * The team's mailbox (Settings > Workspace > Team email), like sales@company.com: every email to a
 * lead goes out from it, with the sender's name on it. Only admins (workspace:manage) connect it;
 * everyone may see which address it is. It logs in first and only saves a login that works, and
 * the password is stored encrypted.
 */

// Never the password, not even encrypted
const accountSelect = { email: true, host: true, port: true, createdAt: true } as const;

async function signedIn(changing: boolean) {
    const user = await getCurrentUser();
    if (!user) throw new Error("UNAUTHORIZED");
    if (changing) {
        // the demo workspace is shared by every visitor; the team's mailbox is an admin's to set
        assertNotDemo(user);
        if (!hasPermission(user, "workspace:manage") || user.actingAsId) throw new Error("FORBIDDEN");
    }
    return user;
}

// The team's mailbox, or null if none is connected
export async function GET() {
    try {
        const user = await signedIn(false);
        const account = await prisma.emailAccount.findUnique({ where: { organizationId: user.organizationId }, select: accountSelect });
        return NextResponse.json({ ok: true, data: account });
    } catch (error) {
        return handleRouteError(error, "Get email account");
    }
}

// Connects (or replaces) it, once the login works, so a typo shows up here, not as a failed email later
export async function PUT(req: NextRequest) {
    try {
        const user = await signedIn(true);

        const body = await parseBody(req, emailAccountSchema);
        if (!body.success) return body.response;

        // each try is a login to someone's mail server
        if (await tooManyAttempts(`email-account:${user.id}`, 10, 60 * 60 * 1000)) {
            return NextResponse.json({ ok: false, message: "Too many tries. Wait an hour and try again." }, { status: 429 });
        }

        const problem = await checkMailbox(body.data);
        if (problem) return NextResponse.json({ ok: false, message: problem }, { status: 400 });

        const { password, ...login } = body.data;
        const data = { ...login, passwordEncrypted: encryptSecret(password) };
        const account = await prisma.emailAccount.upsert({
            where: { organizationId: user.organizationId },
            create: { ...data, organizationId: user.organizationId },
            update: data,
            select: accountSelect,
        });
        return NextResponse.json({ ok: true, message: "Email connected", data: account });
    } catch (error) {
        return handleRouteError(error, "Connect email account");
    }
}

// Disconnects it: nothing more is sent (emails already queued fail with a reason)
export async function DELETE() {
    try {
        const user = await signedIn(true);
        await prisma.emailAccount.deleteMany({ where: { organizationId: user.organizationId } });
        return NextResponse.json({ ok: true, message: "Email disconnected" });
    } catch (error) {
        return handleRouteError(error, "Disconnect email account");
    }
}
