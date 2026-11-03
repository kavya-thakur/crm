import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { NextRequest } from "next/server";

import { prisma } from "@/lib/db/prisma";
import { createOrgWithUser, createLeadStage, cleanupOrg } from "../helpers";

vi.mock("@/lib/auth/getCurrentUser", () => ({ getCurrentUser: vi.fn() }));
// the queue just records what it was given; the tests run the worker's sendEmail themselves
const queued: { emailId: number }[] = [];
vi.mock("@/lib/jobs/queues", () => ({ emailsQueue: () => ({ add: async (_name: string, data: { emailId: number }) => queued.push(data) }) }));
// no real mail server: sendMail records each email
const sent: Record<string, unknown>[] = [];
// whether a workspace is the public demo, switched on by the demo test
vi.mock("@/lib/demo/workspace", async (importOriginal) => ({ ...(await importOriginal<object>()), isDemoWorkspace: vi.fn(() => false) }));
vi.mock("nodemailer", () => ({ default: { createTransport: () => ({ sendMail: async (mail: Record<string, unknown>) => sent.push(mail) }) } }));

import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { GET as listEmails, POST as sendEmailRoute } from "@/app/api/emails/route";
import { GET as listTemplates, POST as createTemplate } from "@/app/api/email-templates/route";
import { GET as openPixel } from "@/app/api/public/emails/[token]/open/route";
import { sendEmail } from "@/lib/emails/send";
import { fillTemplate } from "@/lib/emails/templates";
import { isDemoWorkspace } from "@/lib/demo/workspace";

function post(body: object) {
    return new NextRequest("http://localhost/api/emails", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

const SMTP = { SMTP_HOST: "smtp.example.com", SMTP_USER: "flash@example.com", SMTP_PASS: "secret" };

describe("emails from the CRM", () => {
    const organizationIds: number[] = [];

    beforeEach(() => {
        queued.length = 0;
        sent.length = 0;
    });

    afterEach(async () => {
        vi.unstubAllEnvs();
        for (const organizationId of organizationIds.splice(0)) await cleanupOrg(organizationId);
    });

    async function setUp(permissions = ["lead:read", "lead:all"]) {
        const { organization, user } = await createOrgWithUser(permissions);
        organizationIds.push(organization.id);
        (getCurrentUser as Mock).mockResolvedValue(user);
        const stage = await createLeadStage(organization.id, { name: "New", order: 0 });
        const lead = await prisma.lead.create({
            data: { organizationId: organization.id, name: "Rahul Mehta", email: "rahul@acme.example", stageId: stage.id, assignedToId: user.id },
        });
        return { organization, user, lead };
    }

    it("queues the email, logs it on the lead's timeline and lists it", async () => {
        const { lead } = await setUp();

        const res = await sendEmailRoute(post({ leadId: lead.id, to: "rahul@acme.example", subject: "Hello", body: "Hi Rahul" }));
        expect(res.status).toBe(201);

        const email = await prisma.email.findFirstOrThrow({ where: { leadId: lead.id } });
        expect(email).toMatchObject({ status: "QUEUED", to: "rahul@acme.example", subject: "Hello" });
        expect(queued).toEqual([{ emailId: email.id }]);

        const timeline = await prisma.leadTimeline.findMany({ where: { leadId: lead.id } });
        expect(timeline.map((entry) => entry.message)).toEqual(["Emailed rahul@acme.example: Hello"]);

        const list = await (await listEmails(new NextRequest(`http://localhost/api/emails?leadId=${lead.id}`))).json();
        expect(list.data.map((item: { subject: string }) => item.subject)).toEqual(["Hello"]);
    });

    it("won't email a lead you can't see, or say what it's about twice", async () => {
        const { organization, lead } = await setUp(["lead:read"]);
        // without lead:all an agent sees only their own leads
        const other = await prisma.lead.update({ where: { id: lead.id }, data: { assignedToId: null } });

        expect((await sendEmailRoute(post({ leadId: other.id, to: "a@b.example", subject: "Hi", body: "Hi" }))).status).toBe(404);
        expect((await sendEmailRoute(post({ to: "a@b.example", subject: "Hi", body: "Hi" }))).status).toBe(400);
        expect(await prisma.email.count({ where: { organizationId: organization.id } })).toBe(0);
    });

    it("fails with a plain reason until .env has the mail server", async () => {
        const { lead } = await setUp();
        vi.stubEnv("SMTP_HOST", "");
        await sendEmailRoute(post({ leadId: lead.id, to: "rahul@acme.example", subject: "Hello", body: "Hi" }));

        await sendEmail(queued[0].emailId);

        const email = await prisma.email.findUniqueOrThrow({ where: { id: queued[0].emailId } });
        expect(email.status).toBe("FAILED");
        expect(email.error).toContain("SMTP_HOST");
        expect(sent).toHaveLength(0);
    });

    it("sends from the workspace's address with replies to the sender, and tracks the first open", async () => {
        const { user, lead } = await setUp();
        for (const [name, value] of Object.entries({ ...SMTP, APP_URL: "https://flash.example" })) vi.stubEnv(name, value);
        await sendEmailRoute(post({ leadId: lead.id, to: "rahul@acme.example", subject: "Hello", body: "Hi <b>Rahul</b>\nThanks" }));

        await sendEmail(queued[0].emailId);

        expect(sent[0]).toMatchObject({ to: "rahul@acme.example", replyTo: { address: user.email }, from: { address: "flash@example.com" } });
        // what they typed is shown as text, never as HTML
        expect(sent[0].html).toContain("Hi &#60;b&#62;Rahul&#60;/b&#62;<br>Thanks");
        const email = await prisma.email.findUniqueOrThrow({ where: { id: queued[0].emailId } });
        expect(email.status).toBe("SENT");
        expect(sent[0].html).toContain(`https://flash.example/api/public/emails/${email.trackingToken}/open`);

        // opened twice: marked once
        const params = { params: Promise.resolve({ token: email.trackingToken }) };
        const pixel = await openPixel(new NextRequest("http://localhost"), params);
        expect(pixel.headers.get("content-type")).toBe("image/gif");
        await openPixel(new NextRequest("http://localhost"), { params: Promise.resolve({ token: email.trackingToken }) });
        expect((await prisma.email.findUniqueOrThrow({ where: { id: email.id } })).openedAt).not.toBeNull();
        // the sender hears about it once
        expect(await prisma.notification.count({ where: { userId: user.id, type: "EMAIL_OPENED" } })).toBe(1);

        // a made-up token still gets the image, and changes nothing
        expect((await openPixel(new NextRequest("http://localhost"), { params: Promise.resolve({ token: "nope" }) })).status).toBe(200);
    });

    it("never really sends from the demo workspace", async () => {
        const { lead } = await setUp();
        for (const [name, value] of Object.entries(SMTP)) vi.stubEnv(name, value);
        (isDemoWorkspace as Mock).mockReturnValueOnce(true);
        await sendEmailRoute(post({ leadId: lead.id, to: "rahul@acme.example", subject: "Hello", body: "Hi" }));

        await sendEmail(queued[0].emailId);

        expect(sent).toHaveLength(0);
        expect((await prisma.email.findUniqueOrThrow({ where: { id: queued[0].emailId } })).status).toBe("SKIPPED");
    });

    it("lets everyone use templates but only managers write them, and fills in placeholders", async () => {
        await setUp();
        const template = { name: "Follow-up", subject: "Hi {{lead.firstName}}", body: "From {{me.name}}" };
        expect((await createTemplate(new NextRequest("http://localhost", { method: "POST", body: JSON.stringify(template) }))).status).toBe(403);

        await setUp(["email-templates:manage"]);
        expect((await createTemplate(new NextRequest("http://localhost", { method: "POST", body: JSON.stringify(template) }))).status).toBe(201);
        const { data } = await (await listTemplates()).json();
        expect(data).toHaveLength(1);

        expect(fillTemplate("Hi {{ lead.firstName }}, {{lead.company}}!", { "lead.firstName": "Rahul", "lead.company": null })).toBe("Hi Rahul, !");
    });
});
