import { afterEach, describe, expect, it, vi, type Mock } from "vitest";
import { NextRequest } from "next/server";

import { prisma } from "@/lib/db/prisma";
import { verifyPassword } from "@/lib/auth/password";
import { createOrgWithUser, cleanupOrg } from "../helpers";

// the app's mailbox: catch what would be sent
vi.mock("@/lib/emails/system", async (original) => ({ ...(await original<object>()), sendSystemEmail: vi.fn(async () => true) }));

import { sendSystemEmail } from "@/lib/emails/system";
import { POST as forgot } from "@/app/api/auth/forgot-password/route";
import { POST as reset } from "@/app/api/auth/reset-password/route";

const post = (body: object) => new NextRequest("http://localhost:3000/api", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
// the link in the email that was "sent"
const sentLinkToken = () => {
    const [{ text }] = (sendSystemEmail as Mock).mock.calls.at(-1)!;
    return (text as string).match(/token=([\w-]+)/)![1];
};

describe("forgot password", () => {
    let organizationId = 0;
    afterEach(async () => {
        (sendSystemEmail as Mock).mockClear();
        if (organizationId) await cleanupOrg(organizationId);
        organizationId = 0;
    });

    async function someone() {
        const { organization, user } = await createOrgWithUser([]);
        organizationId = organization.id;
        return user;
    }

    it("emails a link that sets a new password once, and answers the same for an unknown email", async () => {
        const user = await someone();

        const unknown = await (await forgot(post({ email: "nobody-here@example.com" }))).json();
        const known = await (await forgot(post({ email: user.email.toUpperCase() }))).json();
        expect(unknown).toEqual(known);
        expect(sendSystemEmail).toHaveBeenCalledTimes(1);

        const token = sentLinkToken();
        // only a hash is stored, never the link's secret
        expect(await prisma.passwordReset.count({ where: { tokenHash: token } })).toBe(0);

        expect((await reset(post({ token, password: "short" }))).status).toBe(400);
        expect((await reset(post({ token, password: "a-new-password" }))).status).toBe(200);
        const changed = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
        expect(await verifyPassword("a-new-password", changed.passwordHash)).toBe(true);

        // used: it doesn't work twice
        expect((await reset(post({ token, password: "another-password" }))).status).toBe(400);
    });

    it("lets only the newest link work, and only for an hour", async () => {
        const user = await someone();
        await forgot(post({ email: user.email }));
        const first = sentLinkToken();
        await forgot(post({ email: user.email }));
        const second = sentLinkToken();

        expect((await reset(post({ token: first, password: "a-new-password" }))).status).toBe(400);

        await prisma.passwordReset.updateMany({ where: { userId: user.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
        expect((await reset(post({ token: second, password: "a-new-password" }))).status).toBe(400);
    });
});
