# Lead integrations (webhooks)

Other tools send leads straight into Flash: **Google Ads** lead forms, **IndiaMART**,
**Facebook / Instagram Lead Ads, Typeform, Google Sheets...** through Zapier, Make or Pabbly,
or a developer's own code. Settings → **Lead integrations** gives each one a private link;
whatever is POSTed there becomes a lead exactly like a web form submission: tagged with the
integration's source, given to its owner (or the next person in its rotation), with a
"Reply to …" task, and never a second open lead for the same person.

## How it's built

An integration is a `LeadForm` with `kind = "WEBHOOK"`, so it reuses everything forms have
(source, owner, round-robin, `captureLead()`). What's new:

```
Google Ads / Zapier / IndiaMART
   │ POST /api/public/leads/<key>          (the long random key is the secret)
   ▼
route: size check → find integration → rate limit (120/min per link)
   │ toSubmission(body)                    src/lib/leads/webhookPayload.ts
   │   Google's user_column_data list, IndiaMART's RESPONSE, or plain JSON,
   │   field names matched like the CSV import ("Mobile No.", full_name, phone_number),
   │   first_name + last_name, your lead custom fields by name, the rest kept as details
   ▼
captureLead()  (same as web forms)  → lead + contact + reply task, or the existing open lead
   │
   ├─ LeadFormDelivery row: CREATED / UPDATED / REJECTED + message + what was sent (newest 50)
   └─ answer: 200 { ok, created, leadId }  or  400 { ok: false, message: "Phone is missing" }
```

- **Tagged from the first lead:** creating an integration picks the lead source with the same
  name ("Google Ads"), or adds one to the end of the source list. A new web form starts tagged
  "Website". Either can be changed on its card.
- **Only the phone is required.** With no name (an IVR call), the number stands in as the
  lead's name until someone edits it; everything else is optional.
- **Any lead custom field** can be filled by sending its name or key ("Budget": "5-10L").
- **Rejections are visible:** the integration's page lists what arrived and why anything was
  rejected, with the raw data, so "my leads aren't showing up" is a one-look fix.
- **New link:** makes a fresh key; the old address stops working at once (`PATCH { newKey: true }`).
- **Send a test lead** posts a made-up lead to the real link from the browser.
- A bare `GET` on the link answers 200, for tools that check an address before saving it. A `GET`
  with a query string is a delivery (Exotel's Passthru reports calls as `?CallFrom=...&CallSid=...`).

## Payloads it understands

Plain JSON (Zapier, Make, Pabbly, your code):
```json
{ "name": "Rahul Mehta", "phone": "+91 98765 43210", "email": "rahul@acme.com",
  "company": "Acme", "message": "Need a demo", "utm_campaign": "diwali-sale", "Budget": "5-10L" }
```

Google Ads lead form webhook (campaign saved as `utm_campaign`, source `google / cpc`):
```json
{ "campaign_id": 123456, "google_key": "...", "user_column_data": [
    { "column_id": "FULL_NAME", "string_value": "Meera Iyer" },
    { "column_id": "PHONE_NUMBER", "string_value": "+91 99887 76655" } ] }
```

IndiaMART push: `{ "RESPONSE": { "SENDER_NAME", "SENDER_MOBILE", "SENDER_EMAIL", "SENDER_COMPANY", "QUERY_MESSAGE" } }`.

IVR / cloud calling (Exotel, Knowlarity, MyOperator, Tata Smartflo...): paste the link into the
provider's call webhook. The caller's number is read from `CallFrom`, `From`, `caller_number`,
`caller_id`, `customer_number` and the like (never `To` / `CallTo`, the business's own line);
everything else (call id, recording link, duration, key pressed) goes on the lead's timeline.
A repeat caller with an open lead gets a timeline note, not a second lead.
```json
{ "CallSid": "abc123", "CallFrom": "09876543210", "CallTo": "08047112233", "RecordingUrl": "https://..." }
```

## On a free host

- Nothing extra to run: it's an ordinary API route, no queue, no extra service.
- The link shown in Settings is built from the address the page is open on, so it's right on
  any domain without configuration.
- **Free servers that sleep** (Render's free web service sleeps after ~15 idle minutes): a
  sleeping server can take most of a minute to wake, and Google Ads or Zapier may give up
  first. Point a free uptime monitor (UptimeRobot, cron-job.org) at **`/api/health`** every
  5–10 minutes to keep it awake. `/api/health` is also the host's health check. It deliberately
  doesn't touch the database: pinging one every few minutes keeps a free Neon database awake
  around the clock and uses up its monthly hours, and a database outage would make the host
  take the whole site (landing page too) offline.

## Files

| File | What it does |
|---|---|
| `src/app/api/public/leads/[key]/route.ts` | the webhook: read, capture, log, answer |
| `src/lib/leads/webhookPayload.ts` | turns any of the payloads above into a form submission |
| `src/lib/leads/capture.ts` | shared with web forms; integrations accept any lead custom field |
| `src/app/api/lead-forms/[id]/deliveries/route.ts` | the "Recently received" list |
| `src/app/(dashboard)/settings/integrations/` | the settings page (routing, link, guides, test, log) |
| `src/app/api/health/route.ts` | health check / keep-awake ping |
