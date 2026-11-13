# Automations

Rules that do the routine work on leads and deals, set up in Settings → **Automations**
(permission `automations:manage`):

```
WHEN  a new lead is added (by hand, a web form or an integration)
IF    Source is Google Ads  AND  Campaign contains "diwali"          ← all must match; none = every time
THEN  assign to Priya / Rohan (taking turns)
      send the "First reply" email
      add a task "Call {{lead.firstName}}", due today, high priority  ← in this order

WHEN  a deal is won
IF    Amount is more than 1,00,000
THEN  notify the founder and the owner: "Deal won: {{deal.title}} ({{deal.amount}})"
      add a task "Start onboarding", due tomorrow
```

## Triggers

| Trigger | Fired by |
|---|---|
| `lead.created` | `POST /api/leads`, web forms and integrations (`captureLead`) |
| `lead.stageChanged` | a lead moving stage: board drag / panel (`PUT /api/leads/:id`), bulk move (route and background job), conversion |
| `lead.lost` | the same moves, into a lost stage |
| `deal.created` | `POST /api/deals`, converting a lead |
| `deal.stageChanged` | a deal moving stage: board drag / panel (`PUT /api/deals/:id`), bulk move (route and background job) |
| `deal.won` / `deal.lost` | the same moves, into a won / lost stage |

A move into a lost stage fires both "moves to a stage" and "is lost"; `stageEvents()` in the engine
builds the events for a move, so every route fires the same ones. Imports and merges fire nothing.

## How it runs

It's an **event + queue** setup, like an Express app that emits an event and a background
worker that listens for it. The code that saves a lead or deal doesn't know any rules exist.

```
a route saves a lead or deal (or moves it)
   │  startAutomations(...events)      { trigger, organizationId, leadId | dealId, viaFormId?, stageId? }
   │     queues only the events this workspace has an enabled rule for; never throws (the save is done)
   ▼
BullMQ "automations" queue  →  worker  →  runAutomations(event)        src/lib/automations/engine.ts
   0. load the record; a stage event whose record has since moved to another stage does nothing
   for each enabled rule for this trigger, top to bottom:
     1. read the record fresh (an earlier rule may have changed its owner)
     2. every condition matches?          no → next rule (nothing logged)
     3. claim the run: AutomationRun (ruleId, eventKey) is unique
           eventKey = "lead.created:812", or with the stage for a move: "deal.won:55:9"
                                          already there → skip (a retry, or the same win again)
     4. run the actions in order; each returns a line for the log
     5. save the run: DONE "Notified Rohan, Priya · Task "Start onboarding" for Priya, due tomorrow"
                   or FAILED "Assigned to Priya · Stopped: its email template was deleted"
   then tell open pages (leads, deals, tasks, emails, automations) to refresh
```

The engine works on a `RuleRecord`: a lead or a deal loaded into one shape (name, email, owner,
stage, condition values), so each action is written once for both.

## The problems it handles

| Problem | How |
|---|---|
| A retried job doing things twice (two emails) | step 3: one run per rule per event, enforced by a unique key in Postgres |
| A deal dragged out of Won by mistake and back | the stage is in the event key: the same win, so the "won" rules don't run again |
| A deal dropped on Won and straight back before the job runs | step 0: the record isn't in that stage any more, so the job does nothing |
| A bulk job's events read before its batch is saved | the job queues each batch's events after the batch's transaction commits |
| Rules setting each other off forever | actions never start automations: a rule that moves a deal to Won doesn't start the "won" rules |
| Two leads at once getting the same person | "taking turns" counts in the database (`turn: { increment: 1 }`), like web form rotation |
| A web form's "Reply to …" task staying with the old owner | assign moves the record's open tasks from the old owner to the new one |
| No email address (a lead without one, a deal with no lead) | the email action is skipped and says so; the rule still counts as done |
| Moving a lost lead back open when the person already has an open lead | the move is skipped and says so (one open lead per person, as everywhere) |
| A deleted template or stage, or people who left | the action stops with a clear reason in the run log; the actions before it stay done |
| Redis down when a record is saved | the save still works; the missed automation is logged on the server |
| A 5,000-row CSV import | imports don't start automations (no surprise 5,000 emails) |
| Demo workspace | its emails are never really sent (same rule as everywhere) |
| A rule pointing at another workspace's people, templates or stages | rejected on save (`checkReferences`) |
| A lead stage on a deal rule, or a move to a converted stage | rejected on save: stages must fit the trigger; leads convert by becoming a deal |
| A condition that doesn't fit the trigger (amount on a lead) | rejected on save by the schema (`fieldFits`) |
| A rule saved in an older shape | read back through the same Zod schemas; fails with "open the rule and save it again" |

## Conditions and actions

Stored as JSON on `AutomationRule`, checked by `automationRuleSchema`
(`src/lib/validations/automations.ts`). Adding a new action type needs no migration.

- **Conditions** look at:
  - leads: `source`, `via` (only for new leads: the form or integration, or `manual`), `campaign`,
    `owner`, `stage`, `lostReason`, a lead custom field (`cf:<key>`)
  - deals: `source` (its lead's), `owner`, `stage`, `pipeline`, `amount`, `lostReason`, a deal custom field
  - with `is`, `is not`, `contains`, `is more than` / `is less than` (numbers; "1,00,000" and "₹5000"
    are fine), `is empty`, `is filled in`. Text is compared ignoring case.
- **Actions** (on a lead or a deal):
  - `assign`: one person, or several taking turns, with a bell notification
  - `email`: a template, filled in and sent from the owner through the emails queue, to the lead's
    email (for a deal, its lead's)
  - `task`: for the owner, title with placeholders, due in N days, a priority
  - `notify`: a bell notification (and a pop-up for whoever is online) to chosen people and/or the
    owner, with a message that can use placeholders
  - `move`: into another stage of the same kind; doesn't start other rules

Placeholders: `{{lead.firstName}}`, `{{lead.name}}`, `{{lead.company}}`, `{{deal.title}}`,
`{{deal.amount}}`, `{{me.name}}` (the owner), `{{me.email}}`, `{{workspace.name}}`.

Timeline entries and tasks made by a rule go under the name of whoever made the rule
(or the workspace's first member if they've left), and say which automation did it.

## Files

| File | What it does |
|---|---|
| `src/lib/automations/engine.ts` | `startAutomations`, `stageEvents`, `runAutomations`, conditions, the five actions |
| `src/lib/automations/checkRule.ts` | a rule's people, templates and stages must be the workspace's own and fit the trigger |
| `src/lib/validations/automations.ts` | the rule's shape (triggers, conditions, actions), `fieldFits` |
| `src/app/api/automations/` | list, create, save, on/off, delete, and each rule's run log |
| `src/app/(dashboard)/settings/automations/` | the list (with plain-sentence rules) and the When/If/Then builder |

## Next

"Wait 2 days, then…" steps (BullMQ delayed jobs), which turn rules into follow-up sequences.
