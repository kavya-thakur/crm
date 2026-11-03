# Email from the CRM

Send an email to a lead (or a deal's customer) from its **Emails** tab, start from a template,
and see whether it went out and whether it was opened. Everything here is free: it sends
through any SMTP server, and a Gmail account made for Flash is enough (500 a day).

## Setting it up

Add to `.env` (see `.env.example`), then restart `npm run dev`:

```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_USER=flash.crm.mail@gmail.com
SMTP_PASS=<16-character app password from myaccount.google.com/apppasswords>
APP_URL=https://your-deployed-site   # only for open tracking; a mail app can't reach localhost
```

Without them nothing breaks: emails are saved and show **Not sent** with the reason
("Email isn't set up yet: add SMTP_HOST, ... to .env"), and the sender gets a notification.
Moving to Brevo or Resend later (with your own domain) is only a change of these values.

## How an email travels

```
Emails tab ── POST /api/emails ──► Email row (QUEUED) + timeline "Emailed rahul@…: Subject"
                                    │  emailsQueue().add({ emailId })        (answers at once)
                                    ▼
                       worker (src/lib/jobs/worker.ts) ── sendEmail(id) ── Nodemailer ── SMTP
                                    │
             SENT (sentAt) ◄────────┴───────► failed 4 times: FAILED + error, sender notified
                                    │
                broadcastChange("emails") → every open Emails tab refreshes (Sending → Sent)
```

- **From / Reply-To:** every email leaves from the one SMTP address as "Priya via Acme", with
  Reply-To set to the sender's own email, so the customer's reply goes to their inbox.
  Replies aren't read back into Flash (that needs a domain and inbound mail).
- **Why a queue:** SMTP can take seconds or fail for a moment. The person sending doesn't wait,
  and BullMQ retries (10s, 20s, 40s) before giving up.
- **Text, not HTML:** what's typed is escaped and line breaks become `<br>`, so nobody can
  inject HTML into an email.
- **Demo workspace:** never sends. Its emails are marked `SKIPPED` ("Demo, not delivered"),
  so visitors can't use the public demo to email strangers.
- **Limit:** 100 emails per person per day (Redis rate limit, `email:<userId>`).
- **Who can email:** anyone who can see the lead or deal (same scope as the rest of the API).

## Open tracking

Each email ends with a 1×1 image at `/api/public/emails/<trackingToken>/open`. When the
customer's mail app shows the email, it loads the image: the first load sets `openedAt`,
pushes "Rahul opened your email" to the sender's bell, and the tab shows **Opened**.
The token is random (not the id), so opens can't be faked. It says "Opened", not "Read":
Gmail and Apple Mail sometimes load images by themselves.

## Templates

Settings → Email templates (permission `email-templates:manage`; everyone can *use* them).
Placeholders such as `{{lead.firstName}}`, `{{lead.company}}`, `{{deal.title}}`, `{{me.name}}`
and `{{workspace.name}}` are filled in **in the browser** when a template is picked
(`fillTemplate` in `src/lib/emails/templates.ts`), so the sender sees and can edit the exact
text. An empty workspace is offered three starter templates.

## Files

| File | What it does |
|---|---|
| `src/lib/emails/send.ts` | SMTP setup, `sendEmail()` (run by the worker), `failEmail()`, the HTML + tracking image |
| `src/lib/emails/templates.ts` | the placeholders, `fillTemplate()`, the starter templates |
| `src/app/api/emails/route.ts` | list a record's emails; send one (save, timeline, queue) |
| `src/app/api/email-templates/` | templates CRUD |
| `src/app/api/public/emails/[token]/open/route.ts` | the open-tracking image |
| `src/app/(dashboard)/shared/emails.tsx` | the Emails tab: composer and sent emails |
| `src/app/(dashboard)/settings/email-templates/` | the templates page |
