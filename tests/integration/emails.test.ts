import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { NextRequest } from "next/server";

import { prisma } from "@/lib/db/prisma";
import { createOrgWithUser, createLeadStage, cleanupOrg } from "../helpers";

vi.mock("@/lib/auth/getCurrentUser", () => ({ getCurrentUser: vi.fn() }));
// the queue just records what it was given; the tests run the worker's sendEmail themselves
const queued: { emailId: number }[] = [];
vi.mock("@/lib/jobs/queues", () => ({ emailsQueue: () => ({ add: async (_name: string, data: { emailId: number }) => queued.push(data) }) }));
// no real mail server: sendMail records each email (with the login it went through), and
// `smtpError` makes the next login or send fail the way a real server would
const sent: Record<string, unknown>[] = [];
const smtp: { error: (Error & { code?: string }) | null } = { error: null };
// whether a workspace is the public demo, switched on by the demo test
vi.mock("@/lib/demo/workspace", async (importOriginal) => ({ ...(await importOriginal<object>()), isDemoWorkspace: vi.fn(() => false) }));
vi.mock("nodemailer", () => ({
    default: {
        createTransport: (options: { auth: { user: string; pass: string } }) => ({
            verify: async () => {
                if (smtp.error) throw smtp.error;
                return true;
            },
            sendMail: async (mail: Record<string, unknown>) => {
                if (smtp.error) throw smtp.error;
                sent.push({ ...mail, login: options.auth });
            },
        }),
    },
}));

import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { GET as listEmails, POST as sendEmailRoute } from "@/app/api/emails/route";
import { DELETE as disconnect, GET as getAccount, PUT as connect } from "@/app/api/workspace/email-account/route";
import { POST as logWhatsapp } from "@/app/api/whatsapp/route";
import { encryptSecret } from "@/lib/emails/account";
import { GET as listTemplates, POST as createTemplate } from "@/app/api/email-templates/route";
import { GET as openPixel } from "@/app/api/public/emails/[token]/open/route";
import { sendEmail } from "@/lib/emails/send";
import { fillTemplate } from "@/lib/emails/templates";
import { isDemoWorkspace } from "@/lib/demo/workspace";

function post(body: object) {
    return new NextRequest("http://localhost/api/emails", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

const put = (body: object) => new NextRequest("http://localhost", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

// the team's mailbox, as if an admin had filled in Settings > Workspace
const connectMailbox = (organizationId: number, email = "sales@acme.example") =>
    prisma.emailAccount.create({ data: { organizationId, email, host: "smtp.gmail.com", port: 465, passwordEncrypted: encryptSecret("app-password") } });

describe("emails from the CRM", () => {
    const organizationIds: number[] = [];

    beforeEach(() => {
        queued.length = 0;
        sent.length = 0;
        smtp.error = null;
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
            data: { organizationId: organization.id, name: "Rahul Mehta", email: "rahul@acme.example", phone: "98765 43210", stageId: stage.id, assignedToId: user.id },
        });
        await connectMailbox(user.organizationId);
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

    it("emails a contact too, logged on the contact's timeline", async () => {
        const { organization, user } = await setUp(["contact:read", "contact:all"]);
        const contact = await prisma.contact.create({ data: { organizationId: organization.id, name: "Asha Rao", email: "asha@rao.example", phone: "+91 90000 11111", assignedToId: user.id } });

        const res = await sendEmailRoute(post({ contactId: contact.id, to: "asha@rao.example", subject: "Catching up", body: "Hi Asha" }));
        expect(res.status).toBe(201);

        const timeline = await prisma.contactTimeline.findMany({ where: { contactId: contact.id } });
        expect(timeline.map((entry) => entry.message)).toEqual(["Emailed asha@rao.example: Catching up"]);
        const list = await (await listEmails(new NextRequest(`http://localhost/api/emails?contactId=${contact.id}`))).json();
        expect(list.data.map((item: { subject: string }) => item.subject)).toEqual(["Catching up"]);
    });

    it("won't email a lead you can't see, or say what it's about twice", async () => {
        const { organization, lead } = await setUp(["lead:read"]);
        // without lead:all an agent sees only their own leads
        const other = await prisma.lead.update({ where: { id: lead.id }, data: { assignedToId: null } });

        expect((await sendEmailRoute(post({ leadId: other.id, to: "a@b.example", subject: "Hi", body: "Hi" }))).status).toBe(404);
        expect((await sendEmailRoute(post({ to: "a@b.example", subject: "Hi", body: "Hi" }))).status).toBe(400);
        expect(await prisma.email.count({ where: { organizationId: organization.id } })).toBe(0);
    });

    it("won't send until the team's email is connected, and fails plainly if it's disconnected", async () => {
        const { user, lead } = await setUp();
        await prisma.emailAccount.deleteMany({ where: { organizationId: user.organizationId } });

        const refused = await sendEmailRoute(post({ leadId: lead.id, to: "rahul@acme.example", subject: "Hello", body: "Hi" }));
        expect(refused.status).toBe(400);
        expect((await refused.json()).message).toContain("No email is connected yet");

        // queued while connected, then disconnected before the worker got to it
        await connectMailbox(user.organizationId);
        await sendEmailRoute(post({ leadId: lead.id, to: "rahul@acme.example", subject: "Hello", body: "Hi" }));
        await prisma.emailAccount.deleteMany({ where: { organizationId: user.organizationId } });
        await sendEmail(queued[0].emailId);

        const email = await prisma.email.findUniqueOrThrow({ where: { id: queued[0].emailId } });
        expect(email).toMatchObject({ status: "FAILED" });
        expect(email.error).toContain("No email is connected yet");
        expect(sent).toHaveLength(0);
    });

    it("gives up at once, with a reason, when the mailbox refuses the password", async () => {
        const { lead } = await setUp();
        await sendEmailRoute(post({ leadId: lead.id, to: "rahul@acme.example", subject: "Hello", body: "Hi" }));
        smtp.error = Object.assign(new Error("Invalid login: 535"), { code: "EAUTH" });

        // no throw: a retry wouldn't help
        await sendEmail(queued[0].emailId);

        const email = await prisma.email.findUniqueOrThrow({ where: { id: queued[0].emailId } });
        expect(email.status).toBe("FAILED");
        expect(email.error).toContain("reconnects it in Settings → Workspace");

        // a network blip is thrown, so the queue tries again
        await sendEmailRoute(post({ leadId: lead.id, to: "rahul@acme.example", subject: "Again", body: "Hi" }));
        smtp.error = Object.assign(new Error("timeout"), { code: "ETIMEDOUT" });
        await expect(sendEmail(queued[1].emailId)).rejects.toThrow("timeout");
    });

    it("connects the team's mailbox only after logging in to it, and never hands the password back", async () => {
        const { user } = await setUp(["lead:read", "lead:all", "workspace:manage"]);
        await prisma.emailAccount.deleteMany({ where: { organizationId: user.organizationId } });
        const account = { email: "priya.sales@gmail.com", password: "abcd efgh ijkl mnop", host: "smtp.gmail.com", port: 465 };

        // a wrong password: refused, nothing saved
        smtp.error = Object.assign(new Error("Invalid login"), { code: "EAUTH" });
        const wrong = await connect(put(account));
        expect(wrong.status).toBe(400);
        expect((await wrong.json()).message).toContain("app password");
        expect(await prisma.emailAccount.count({ where: { organizationId: user.organizationId } })).toBe(0);

        // an IP address or an odd port never gets as far as a login
        smtp.error = null;
        expect((await connect(put({ ...account, host: "127.0.0.1" }))).status).toBe(400);
        expect((await connect(put({ ...account, port: 22 }))).status).toBe(400);

        const res = await connect(put(account));
        expect(res.status).toBe(200);
        const saved = await prisma.emailAccount.findUniqueOrThrow({ where: { organizationId: user.organizationId } });
        // encrypted, and Gmail's spaces taken out
        expect(saved.passwordEncrypted).not.toContain("abcd");
        const shown = (await (await getAccount()).json()).data;
        expect(shown).toMatchObject({ email: "priya.sales@gmail.com", host: "smtp.gmail.com", port: 465 });
        expect(JSON.stringify(shown)).not.toContain("password");

        // and the emails go through it, with the real password
        const lead = await prisma.lead.findFirstOrThrow({ where: { assignedToId: user.id } });
        await sendEmailRoute(post({ leadId: lead.id, to: "rahul@acme.example", subject: "Hello", body: "Hi" }));
        await sendEmail(queued[0].emailId);
        expect(sent[0].login).toEqual({ user: "priya.sales@gmail.com", pass: "abcdefghijklmnop" });

        await disconnect();
        expect(await prisma.emailAccount.count({ where: { organizationId: user.organizationId } })).toBe(0);
    });

    it("notes a WhatsApp chat on the timeline of a lead you can see", async () => {
        const { lead } = await setUp(["lead:read"]);

        expect((await logWhatsapp(post({ leadId: lead.id, template: "First reply" }))).status).toBe(201);
        const timeline = await prisma.leadTimeline.findMany({ where: { leadId: lead.id } });
        expect(timeline.map((entry) => [entry.type, entry.message])).toEqual([["WHATSAPP", 'Opened WhatsApp with the "First reply" message']]);

        // someone else's lead: not found
        await prisma.lead.update({ where: { id: lead.id }, data: { assignedToId: null } });
        expect((await logWhatsapp(post({ leadId: lead.id }))).status).toBe(404);
    });

    it("sends from the team's address with the sender's name on it, and tracks the first open", async () => {
        const { user, lead, organization } = await setUp();
        vi.stubEnv("APP_URL", "https://flash.example");
        await sendEmailRoute(post({ leadId: lead.id, to: "rahul@acme.example", subject: "Hello", body: "Hi <b>Rahul</b>\nThanks" }));

        await sendEmail(queued[0].emailId);

        expect(sent[0]).toMatchObject({ to: "rahul@acme.example", from: { name: `${user.name} (${organization.name})`, address: "sales@acme.example" } });
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

    it("lets only admins connect the team's email", async () => {
        const { user } = await setUp();
        await prisma.emailAccount.deleteMany({ where: { organizationId: user.organizationId } });
        const account = { email: "sales@acme.example", password: "app-password", host: "smtp.gmail.com", port: 465 };

        // an agent (no workspace:manage) can see which address it is, but not change it
        expect((await connect(put(account))).status).toBe(403);
        expect((await disconnect()).status).toBe(403);
        expect((await getAccount()).status).toBe(200);
        expect(await prisma.emailAccount.count({ where: { organizationId: user.organizationId } })).toBe(0);
    });

    it("never really sends from the demo workspace", async () => {
        const { user, lead } = await setUp();
        // a demo visitor has no mailbox, and can still "send"
        await prisma.emailAccount.deleteMany({ where: { organizationId: user.organizationId } });
        (isDemoWorkspace as Mock).mockReturnValue(true);
        await sendEmailRoute(post({ leadId: lead.id, to: "rahul@acme.example", subject: "Hello", body: "Hi" }));

        await sendEmail(queued[0].emailId);

        expect(sent).toHaveLength(0);
        expect((await prisma.email.findUniqueOrThrow({ where: { id: queued[0].emailId } })).status).toBe("SKIPPED");
        (isDemoWorkspace as Mock).mockReturnValue(false);
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
