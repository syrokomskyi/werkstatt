# 07 — Operator runbook

> Day-to-day for the studio managers. The funnel automates the common path; this is what a human does for the rest. The studio runs **its own** webgogol-com through exactly this runbook — it is its own first client.

## What managers watch (Pipedrive)

| Board | Watch for | Action |
| --- | --- | --- |
| P1 · Acquisition | deals stuck in _Payment pending_ | nudge; offer help paying |
| P2 · Onboarding | _Materials_ idle > SLA | chase missing materials; the 12-working-day clock |
| P3 · Subscription | _At risk / Dunning_ | recover payment; talk to the client |
| P4 · Change | _Requested_ backlog | schedule delivery; same-working-day response promise |

Each Deal shows the precise `funnel_stage`, the `offer_snapshot`, the linked Organization, and the orderer Person. One Person's full set of sites is visible on the Person record.

## Operator handoff (from the chat)

The bot hands a conversation to a human when (pilot triggers):

1. **Explicit request / low AI confidence** — the visitor asks for a person, or the AI can't answer. → reply in the chat; if it's a sales nuance, keep it moving.
2. **Payment / billing issue** — failed payment, dispute, refund, plan/module change. → resolve in Stripe; the P3 deal reflects the outcome.
3. **Out-of-offer / custom scope** — custom build, individual price, complex integration. → form a tailored proposal (below).

On handoff the bot sets `operator_review` and creates a Pipedrive activity. The visitor is told a human will reply; the conversation stays open and resumes at the saved stage after.

## Issuing an ad-hoc / custom invoice

For work **not** in the standard offer (or paid changes beyond the allowance):

1. Open (or create) the client's **Stripe Customer** (= the Organization).
2. Create an invoice: `STRIPE_PRICE_HOURLY` × hours, or a custom line item with your price.
3. Send it; on `invoice.paid`, the linked **P4** deal advances to _In progress_ (🔭 RFC-0191 maps the event; until then, move the P4 deal by hand and note the invoice id).
4. Record scope in the P4 deal so the delivery is tracked.

Managers may issue invoices the offer doesn't contain — this is expected. Stripe is the billing authority; Pipedrive shows the operational state.

## Changes & the included-changes balance

- The authoritative remaining-change count is `included_changes_balance` on the **P3** Subscription deal.
- An **included** change decrements it (no charge). An **exhausted** change triggers a `changePrice` (15 €) Stripe invoice (P4 _Payment pending_).
- 🔭 RFC-0191 automates the decrement + the invoice; until then, adjust the field and issue the invoice by hand, then move the P4 deal.

## Subscription lifecycle actions

- **Add a module** the client requested in chat/handoff: add the module Price to their Stripe subscription (prorated). Log it on P3 _Upsell_.
- **Pause / deferred start** (`in 14 days`): the P2 deal sits at _Start consent_ with a `start_after` date; don't start the SLA clock until then.
- **Cancel / churn**: cancel the Stripe subscription; P3 → _Churned_ with a Lost reason. Honor the data-package guarantee (domain + content + built site in 72 h on cancellation).

## Legal & consent

- The B2B _start-before-completion_ consent is captured in the chat and stored append-only in `buffer_consent_events` (never editable). The `consent_ref` on the deal links to it.
- For consent disputes or legal questions, pull the consent row (immutable evidence) — do not rely on chat transcript alone.
- 🔭 B2C/Widerruf is out of scope for the pilot; do not sell to consumers until the B2C branch + withdrawal handling ship.

## When something looks wrong

- **Visitor stranded / dead-end:** that violates the no-dead-end rule (§03). Check the UChat fallback on the offending step; the visitor must always get back to their stage.
- **Stale price in chat:** the offer variable drifted from `offer.md`. Re-sync the UChat variables (§03) and re-run `funnel.copy.validate`.
- **Stage mismatch (chat vs Pipedrive):** check the Stage Tracker POST fired and the worker drained the outbox; the `funnel_stage` field is the precise truth, the pipeline stage is its bridge.
- **Make.com appears anywhere:** it must not. `funnel.contract.validate` fails on any reference; remove it (RFC-0188).
