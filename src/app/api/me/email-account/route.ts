import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { handleRouteError, parseBody } from "@/lib/api/http";
import { tooManyAttempts } from "@/lib/api/rateLimit";
import { assertNotDemo } from "@/lib/demo/workspace";
import { checkMailbox, encryptSecret } from "@/lib/emails/account";
import { emailAccountSchema } from "@/lib/validations/emails";

// Never the password, not even encrypted
const accountSelect = { email: true, host: true, port: true, createdAt: true } as const;

// The mailbox your emails go out through, or null if you haven't connected one
export async function GET() {
    try {
        const user = await getCurrentUser();
        if (!user) throw new Error("UNAUTHORIZED");

        const account = await prisma.emailAccount.findUnique({ where: { userId: user.id }, select: accountSelect });
        return NextResponse.json({ ok: true, data: account });
    } catch (error) {
        return handleRouteError(error, "Get email account");
    }
}

// Connects (or replaces) your mailbox. It logs in first and only saves a login that works,
// so a typo shows up here, not as a failed email later.
export async function PUT(req: NextRequest) {
    try {
        const user = await getCurrentUser();
        if (!user) throw new Error("UNAUTHORIZED");
        // the demo workspace is shared by every visitor
        assertNotDemo(user);

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
            where: { userId: user.id },
            create: { ...data, userId: user.id },
            update: data,
            select: accountSelect,
        });

        return NextResponse.json({ ok: true, message: "Email connected", data: account });
    } catch (error) {
        return handleRouteError(error, "Connect email account");
    }
}

// Disconnects it: nothing more is sent from it (emails already queued fail with a reason)
export async function DELETE() {
    try {
        const user = await getCurrentUser();
        if (!user) throw new Error("UNAUTHORIZED");
        assertNotDemo(user);

        await prisma.emailAccount.deleteMany({ where: { userId: user.id } });
        return NextResponse.json({ ok: true, message: "Email disconnected" });
    } catch (error) {
        return handleRouteError(error, "Disconnect email account");
    }
}
