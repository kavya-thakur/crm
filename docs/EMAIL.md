# Email and WhatsApp from the CRM

Send an email to a lead, a contact or a deal's customer from its **Emails** tab, start from a template,
and see whether it went out and whether it was opened. Or open a WhatsApp chat with the message
already typed. Everything here is free.

## One team email, connected by an admin

In **Settings → Workspace → Team email**, an admin (`workspace:manage`) connects one mailbox for the
whole workspace, like `sales@yourcompany.com`: its address and an **app password** (Gmail: turn on
2-Step Verification, then make one at myaccount.google.com/apppasswords). Gmail is the default;
Outlook, Zoho, Hostinger or any other provider works by changing the server (port 465 or 587).

- **Everyone sends from it**, with nothing to set up, and with their own name on each email:
  `"Priya Sharma (Acme)" <sales@acme.com>`. Replies come back to that shared inbox. Automations too.
- **Agents can't connect a mailbox**: there's no personal one (decided 2026-11-09; the earlier
  per-person mailboxes were removed, and a workspace owner's own became the team's). One mailbox per
  workspace: `EmailAccount.organizationId` is unique. Route: `/api/workspace/email-account`
  (anyone may see the address; connecting or disconnecting needs `workspace:manage`).
- **Checked before it's saved.** Connecting logs in to the mailbox first (`verify()`), so a wrong
  password shows up right there, not as a failed email later. Limited to 10 tries an hour.
- **Kept encrypted.** The app password has to be read back to send, so it's encrypted with
  AES-256-GCM (`src/lib/emails/account.ts`), not hashed. The key comes from `JWT_SECRET`, so there's
  nothing extra to configure (changing `JWT_SECRET` means the team's email is connected again). It's never
  sent back to the browser, not even encrypted.
- **Only mail servers.** The server must be a host name (no IP, no localhost) on port 465 or 587.
- **Nothing connected?** The Emails tab says an admin connects the team's email in Settings →
  Workspace, and `POST /api/emails` refuses. An automation's email step is
  skipped with "No email sent: no email is connected" in its run log.
- **Revoked later?** If the provider refuses the password, the email fails at once (no pointless
  retries) with "An admin reconnects it in Settings → Workspace", and the sender is notified.

Why not "Sign in with Google"? Sending through Gmail's API needs Google's app verification, and
until then only 100 named test users can sign in. An app password needs no approval.

`APP_URL` (the deployed site's address) is the only setting: it turns on open tracking.

## How an email travels

```
Emails tab ── POST /api/emails ──► sender has a mailbox? no → 400 "Connect your email…"
                                    │ yes
                                    ▼
                         Email row (QUEUED) + timeline "Emailed rahul@…: Subject"
                                    │  emailsQueue().add({ emailId })        (answers at once)
                                    ▼
             worker ── sendEmail(id) ── the sender's mailbox (decrypted login) ── Nodemailer ── SMTP
                                    │
             SENT (sentAt) ◄────────┴───────► password refused: FAILED at once
                                    │         other errors: retried, then FAILED; sender notified
                broadcastChange("emails") → every open Emails tab refreshes (Sending → Sent)
```

- **Why a queue:** SMTP can take seconds or fail for a moment. The person sending doesn't wait,
  and BullMQ retries (10s, 20s, 40s) before giving up.
- **Text, not HTML:** what's typed is escaped and line breaks become `<br>`, so nobody can
  inject HTML into an email.
- **Demo workspace:** needs no mailbox and never sends. Its emails are marked `SKIPPED`
  ("Demo, not delivered"), so visitors can't use the public demo to email strangers.
- **Limit:** 100 emails per person per day (Redis rate limit, `email:<userId>`), well inside
  Gmail's own 500.
- **Who can email:** anyone who can see the lead, deal or contact (`findVisibleRecord`).
- Replies aren't read back into Flash (that would need IMAP); they're in the sender's own inbox.

## Open tracking

Each email ends with a 1×1 image at `/api/public/emails/<trackingToken>/open`. When the
customer's mail app shows the email, it loads the image: the first load sets `openedAt`,
pushes "Rahul opened your email" to the sender's bell, and the tab shows **Opened**.
The token is random (not the id), so opens can't be faked. It says "Opened", not "Read":
Gmail and Apple Mail sometimes load images by themselves.

## Templates

Settings → Email templates (permission `email-templates:manage`; everyone can *use* them).
Placeholders such as `{{lead.firstName}}`, `{{lead.company}}`, `{{deal.title}}`, `{{deal.amount}}`,
`{{me.name}}` and `{{workspace.name}}` are filled in **in the browser** when a template is picked
(`fillTemplate` in `src/lib/emails/templates.ts`), so the sender sees and can edit the exact
text. An empty workspace is offered three starter templates.

## WhatsApp

A green WhatsApp button sits next to the phone number on every lead, deal and contact. It opens a
`wa.me` link, the chat in the WhatsApp app or WhatsApp Web, either empty or with one of the
templates' text already typed and filled in for that person. The person presses send themselves.

- **No API, no cost, nothing to set up.** (WhatsApp's Business API needs Meta approval and charges
  per conversation.)
- **On the timeline:** "Opened WhatsApp with the "First reply" message" (`POST /api/whatsapp`).
  WhatsApp doesn't tell anyone whether it was sent, so the entry says "opened", not "sent".
- **Numbers:** `whatsappNumber()` keeps the digits and adds the country code: a 10-digit number is
  taken as Indian (+91); numbers from other countries need their `+` code saved.

## Files

| File | What it does |
|---|---|
| `src/lib/emails/account.ts` | encrypting the app password, the SMTP connection for a mailbox, the login check |
| `src/lib/emails/send.ts` | `canSendEmail()`, `queueEmail()`, `sendEmail()` (run by the worker), `failEmail()`, the HTML + tracking image |
| `src/lib/emails/templates.ts` | the placeholders, `fillTemplate()`, the starter templates |
| `src/app/api/me/email-account/route.ts` | see, connect (log in, then save) and disconnect your mailbox |
| `src/app/api/emails/route.ts` | list a record's emails; send one (save, timeline, queue) |
| `src/app/api/email-templates/` | templates CRUD; also says which mailbox you send from |
| `src/app/api/public/emails/[token]/open/route.ts` | the open-tracking image |
| `src/app/api/whatsapp/route.ts` | notes an opened WhatsApp chat on the timeline |
| `src/lib/whatsapp.ts` | phone number → `wa.me` link |
| `src/app/(dashboard)/settings/profile/ProfileView.tsx` | the Sending email section |
| `src/app/(dashboard)/shared/emails.tsx` | the Emails tab: composer and sent emails |
| `src/app/(dashboard)/shared/whatsapp.tsx` | the WhatsApp button and its template menu |
| `src/app/(dashboard)/settings/email-templates/` | the templates page |
