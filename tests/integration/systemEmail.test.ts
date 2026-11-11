import { afterEach, describe, expect, it, vi } from "vitest";

import { sendSystemEmail } from "@/lib/emails/system";

const email = { to: "someone@example.com", subject: "Hi", text: "Hello", html: "<p>Hello</p>" };

// Flash's own emails: through Brevo's API when its key is set (production), otherwise SMTP (locally)
describe("system email", () => {
    afterEach(() => {
        vi.unstubAllEnvs();
        vi.unstubAllGlobals();
    });

    it("sends through Brevo when BREVO_API_KEY is set, from SMTP_USER", async () => {
        vi.stubEnv("BREVO_API_KEY", "xkeysib-test");
        vi.stubEnv("SMTP_USER", "flash@example.com");
        vi.stubEnv("SMTP_HOST", "");
        const fetch = vi.fn(async () => new Response(JSON.stringify({ messageId: "1" }), { status: 201 }));
        vi.stubGlobal("fetch", fetch);

        expect(await sendSystemEmail(email)).toBe(true);
        const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
        expect(url).toBe("https://api.brevo.com/v3/smtp/email");
        expect((init.headers as Record<string, string>)["api-key"]).toBe("xkeysib-test");
        expect(JSON.parse(init.body as string)).toMatchObject({ sender: { email: "flash@example.com" }, to: [{ email: email.to }], subject: "Hi", htmlContent: "<p>Hello</p>" });
    });

    it("says why when Brevo refuses, and that nothing is set up without a sender", async () => {
        vi.stubEnv("BREVO_API_KEY", "xkeysib-test");
        vi.stubEnv("SMTP_USER", "flash@example.com");
        vi.stubGlobal("fetch", vi.fn(async () => new Response('{"message":"unrecognised IP address"}', { status: 401 })));
        await expect(sendSystemEmail(email)).rejects.toThrow(/401.*unrecognised IP/);

        vi.stubEnv("SMTP_USER", "");
        vi.stubEnv("SMTP_FROM", "");
        expect(await sendSystemEmail(email)).toBe(false);
    });
});
