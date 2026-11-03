# Automations

Rules that do the routine work on every new lead, set up in Settings → **Automations**
(permission `automations:manage`):

```
WHEN  a new lead is added (by hand, a web form or an integration)
IF    Source is Google Ads  AND  Campaign contains "diwali"          ← all must match; none = every lead
THEN  assign to Priya / Rohan (taking turns)
      send the "First reply" email
      add a task "Call {{lead.firstName}}", due today, high priority  ← in this order
```

## How it runs

It's an **event + queue** setup, like an Express app that emits an event and a background
worker that listens for it. The code that saves a lead doesn't know any rules exist.

```
POST /api/leads  or  captureLead() (web forms, integrations)
   │  lead saved
   │  startAutomations({ trigger: "lead.created", organizationId, leadId, viaFormId })
   │     only if the workspace has an enabled rule for it; never throws (the lead is already saved)
   ▼
BullMQ "automations" queue  →  worker  →  runAutomations(event)        src/lib/automations/engine.ts
   for each enabled rule, top to bottom:
     1. read the lead fresh (an earlier rule may have changed its owner)
     2. every condition matches?          no → next rule (nothing logged)
     3. claim the run: AutomationRun (ruleId, "lead.created:812") is unique
                                          already there → this rule already ran for this lead → skip
     4. run the actions in order; each returns a line for the log
     5. save the run: DONE "Assigned to Priya · Emailed rahul@… · Task …"
                   or FAILED "Assigned to Priya · Stopped: its email template was deleted"
   then tell open pages (leads, tasks, emails, automations) to refresh
```

## The problems it handles

| Problem | How |
|---|---|
| A retried job doing things twice (two emails) | step 3: one run per rule per lead, enforced by a unique key in Postgres |
| Rules setting each other off forever | actions never start automations, so a rule can't trigger a rule |
| Two leads at once getting the same person | "taking turns" counts in the database (`turn: { increment: 1 }`), like web form rotation |
| A web form's "Reply to …" task staying with the old owner | the assign action moves the lead's open tasks from the old owner to the new one |
| Lead without an email | the email action is skipped and says so; the rule still counts as done |
| A deleted template, or people who left | the action stops with a clear reason in the run log; the actions before it stay done |
| Redis down when a lead is saved | the lead still saves; the missed automation is logged on the server |
| A 5,000-row CSV import | imports don't start automations (no surprise 5,000 emails) |
| Demo workspace | its emails are never really sent (same rule as everywhere) |
| Saving a rule that points at another workspace's people or templates | rejected on save (`checkReferences`) |
| A rule saved in an older shape | read back through the same Zod schema; fails with "open the rule and save it again" |

## Conditions and actions

Stored as JSON on `AutomationRule`, checked by `automationRuleSchema`
(`src/lib/validations/automations.ts`). Adding a new action type later needs no migration.

- **Conditions** look at: `source`, `via` (the web form or integration it came through, or
  `manual`), `campaign`, `owner`, or a lead custom field (`cf:<key>`), with `is`, `is not`,
  `contains`, `is empty`, `is filled in`. Everything is compared as text, ignoring case.
- **Actions:** `assign` (one person, or several taking turns, with a bell notification),
  `email` (a template, filled in and sent from the lead's owner through the emails queue),
  `task` (for the lead's owner, title with placeholders, due in N days, a priority).

Timeline entries and tasks made by a rule go under the name of whoever made the rule
(or the workspace's first member if they've left), and say which automation did it.

## Files

| File | What it does |
|---|---|
| `src/lib/automations/engine.ts` | `startAutomations`, `runAutomations`, conditions, the three actions |
| `src/lib/automations/checkRule.ts` | a rule's people and templates must be the workspace's own |
| `src/lib/validations/automations.ts` | the rule's shape (trigger, conditions, actions) |
| `src/app/api/automations/` | list, create, save, on/off, delete, and each rule's run log |
| `src/app/(dashboard)/settings/automations/` | the list (with plain-sentence rules) and the When/If/Then builder |

## Next

More triggers (lead stage changed, deal won/lost), "move stage" and "notify" actions, and
"wait 2 days, then…" steps (BullMQ delayed jobs), which turn rules into follow-up sequences.
