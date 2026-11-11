import { afterEach, describe, expect, it, vi, type Mock } from "vitest";
import { NextRequest } from "next/server";

import { prisma } from "@/lib/db/prisma";
import { createOrgWithUser, createLeadStage, cleanupOrg } from "../helpers";

vi.mock("@/lib/auth/getCurrentUser", () => ({ getCurrentUser: vi.fn() }));

import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { GET as startConnect } from "@/app/api/workspace/email-account/google/route";
import { GET as callback } from "@/app/api/workspace/email-account/google/callback/route";
import { decryptSecret, encryptSecret } from "@/lib/emails/account";
import { sendEmail } from "@/lib/emails/send";

const SEND = "https://www.googleapis.com/auth/gmail.send";
// an id token as Google sends it: only its middle part (what it says) is read
const idToken = (email: string) => `x.${Buffer.from(JSON.stringify({ email, email_verified: true })).toString("base64url")}.x`;
const json = (body: object, status = 200) => new Response(JSON.stringify(body), { status });

// Google's answers, by address; every request is kept to check what was sent
function fakeGoogle(answers: Record<string, () => Response>) {
    const fetch = vi.fn(async (url: string) => answers[url]());
    vi.stubGlobal("fetch", fetch);
    return fetch;
}

const backTo = (res: Response) => new URL(res.headers.get("location")!).searchParams.get("google");

// "Connect with Google": the admin goes to Google and back, then emails go out through Gmail's API
describe("connect with Google", () => {
    let organizationId = 0;
    afterEach(async () => {
        vi.unstubAllEnvs();
        vi.unstubAllGlobals();
        if (organizationId) await cleanupOrg(organizationId);
        organizationId = 0;
    });

    async function admin(permissions = ["workspace:manage"]) {
        vi.stubEnv("GOOGLE_CLIENT_ID", "client-id");
        vi.stubEnv("GOOGLE_CLIENT_SECRET", "client-secret");
        vi.stubEnv("APP_URL", "https://flash.example");
        const { organization, user } = await createOrgWithUser(permissions);
        organizationId = organization.id;
        (getCurrentUser as Mock).mockResolvedValue(user);
        return user;
    }

    // Google sending the browser back, with this browser's state cookie (or another one)
    const returnFromGoogle = (query: string, cookieState = "abc") =>
        callback(new NextRequest(`https://flash.example/api/workspace/email-account/google/callback?${query}`, { headers: { cookie: `google_connect_state=${cookieState}` } }));

    it("sends an admin to Google with a one-time state, and anyone else back with why", async () => {
        await admin();
        const res = await startConnect(new NextRequest("https://flash.example/api/workspace/email-account/google"));
        const google = new URL(res.headers.get("location")!);
        expect(google.origin).toBe("https://accounts.google.com");
        expect(google.searchParams.get("redirect_uri")).toBe("https://flash.example/api/workspace/email-account/google/callback");
        expect(google.searchParams.get("scope")).toContain(SEND);
        expect(res.cookies.get("google_connect_state")?.value).toBe(google.searchParams.get("state"));

        await cleanupOrg(organizationId);
        await admin(["lead:read"]);
        expect(backTo(await startConnect(new NextRequest("https://flash.example/api/workspace/email-account/google")))).toMatch(/Only an admin/);
    });

    it("saves the Gmail with its refresh token encrypted, and refuses another browser's state or a missing permission", async () => {
        const user = await admin();
        fakeGoogle({ "https://oauth2.googleapis.com/token": () => json({ refresh_token: "refresh-1", id_token: idToken("Sales@Acme.example"), scope: `openid email ${SEND}` }) });

        expect(backTo(await returnFromGoogle("code=c&state=abc", "someone-else"))).toMatch(/Try connecting again/);
        expect(await prisma.emailAccount.count({ where: { organizationId } })).toBe(0);

        expect(backTo(await returnFromGoogle("code=c&state=abc"))).toBe("connected");
        const saved = await prisma.emailAccount.findUniqueOrThrow({ where: { organizationId: user.organizationId } });
        expect(saved).toMatchObject({ email: "sales@acme.example", host: null, port: null });
        expect(decryptSecret(saved.passwordEncrypted)).toBe("refresh-1");

        // "send email" unticked on Google's page: the mailbox already connected stays as it was
        fakeGoogle({ "https://oauth2.googleapis.com/token": () => json({ refresh_token: "refresh-2", id_token: idToken("other@acme.example"), scope: "openid email" }) });
        expect(backTo(await returnFromGoogle("code=c&state=abc"))).toMatch(/Send email on your behalf/);
        expect((await prisma.emailAccount.findUniqueOrThrow({ where: { organizationId } })).email).toBe("sales@acme.example");
    });

    it("sends through Gmail's API, and fails at once (no retries) when the access was taken back", async () => {
        const user = await admin();
        await prisma.emailAccount.create({ data: { organizationId, email: "sales@acme.example", passwordEncrypted: encryptSecret("refresh-1") } });
        const stage = await createLeadStage(organizationId, { name: "New", order: 0 });
        const lead = await prisma.lead.create({ data: { organizationId, name: "Rahul", email: "rahul@acme.example", phone: "98765 43210", stageId: stage.id } });
        const queue = (subject: string) =>
            prisma.email.create({ data: { organizationId, leadId: lead.id, sentById: user.id, to: "rahul@acme.example", subject, body: "Hi Rahul", trackingToken: `t-${subject}-${organizationId}` } });

        const fetch = fakeGoogle({
            "https://oauth2.googleapis.com/token": () => json({ access_token: "access-1" }),
            "https://gmail.googleapis.com/gmail/v1/users/me/messages/send": () => json({ id: "m1" }),
        });
        const first = await queue("Hello");
        await sendEmail(first.id);
        expect((await prisma.email.findUniqueOrThrow({ where: { id: first.id } })).status).toBe("SENT");
        const [, init] = fetch.mock.calls[1] as unknown as [string, RequestInit];
        expect((init.headers as Record<string, string>).authorization).toBe("Bearer access-1");
        const raw = Buffer.from(JSON.parse(init.body as string).raw, "base64url").toString();
        expect(raw).toMatch(/^To: rahul@acme\.example/m);
        expect(raw).toMatch(/^Subject: Hello/m);
        expect(raw).toMatch(/^From: .*<sales@acme\.example>/m);

        fakeGoogle({ "https://oauth2.googleapis.com/token": () => json({ error: "invalid_grant" }, 400) });
        const second = await queue("Again");
        await sendEmail(second.id);
        expect(await prisma.email.findUniqueOrThrow({ where: { id: second.id } })).toMatchObject({ status: "FAILED", error: expect.stringMatching(/Google no longer lets Flash send.*reconnects/) });
    });
});
