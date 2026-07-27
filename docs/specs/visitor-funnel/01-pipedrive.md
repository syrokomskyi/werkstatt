# 01 — Pipedrive operational architecture

> Goal: **operational superiority**, not a generic sales board. The relationship does not end at payment — the Client keeps working with the studio (support, subscription, new modules, site changes, invoices). Pipedrive must show that whole lifecycle truthfully so managers can run delivery and retention, not just close a sale.
>
> Most of this is 🟡 **Configure** (you build it in the Pipedrive console). The _creation of linked deals on payment_ and the _stage sync_ are 🔭 **RFC-0191 / RFC-0190** platform code — do not hand-script them in Pipedrive automations or Make.com.

## The client graph: Person → N Deals → Organization

```
Person  "Anna (orderer / Client)"
  ├─ Deal  "Bakery site"      ─ Organization "Bäckerei Müller GmbH"
  ├─ Deal  "Yoga studio site" ─ Organization "Yoga Anna e.U."
  └─ Deal  "Friend's cafe"    ─ Organization "Café Sonne"
```

- **Person** = the human in the chat (the _orderer/Client_). One Person, identified by email/phone, can order many sites — for their own companies and for others.
- **Organization** = the company a given site is _for_. It may differ from the orderer (Anna orders a site for a friend's café). One Person ↔ many Organizations.
- **Deal** = one unit of work for one site. A Person has many Deals; each Deal links to exactly one Organization (the target company) **and** to the orderer Person.

This is the model managers asked for: one Person, the real set of sites they drive, each attributed to the right company. 🔭 The buffer side (`buffer_organizations` + `deal.organization_id`) is **RFC-0190**; until it lands, encode the Organization name in the Deal title and the `organization_name` custom field so the picture is still legible.

## Why four pipelines (one question each)

A single board cannot answer "who's buying?", "what are we building?", "who's at risk of churn?", and "what work is queued?" at once. Split by operational question:

| Pipeline | Answers | Deal lifespan |
| --- | --- | --- |
| **P1 · Acquisition** | Who is about to buy a site? | Until paid (Won) |
| **P2 · Onboarding & Production** | Which paid sites are being built (delivery SLA)? | Until launched (Won) |
| **P3 · Subscription & Lifecycle** | Who is an active client; who is at risk / renewing? | Long-lived (the MRR anchor) |
| **P4 · Change & Support** | What client work is queued and is it billable? | Per request |

One ordered site therefore produces **linked deals** across pipelines, all sharing a `site_key` and the same Organization + orderer Person. This is deliberate: each board stays clean and each answers one question. The platform (🔭 RFC-0191 sync worker), **not** a Pipedrive GUI automation, creates the P2/P3 deals when P1 is Won — so the orchestration stays in governed code.

### P1 · Acquisition (pre-payment sales)

| # | Stage | Enter when | Canonical funnel stage(s) |
| --- | --- | --- | --- |
| 1 | New conversation | session started, privacy acknowledged | `new_session`, `privacy_acknowledged`, `intent_selected`, `organization_selected` |
| 2 | Qualified | priority/company/service/region captured | `qualification_*` |
| 3 | Offer presented | offer shown from `offer.md` | `offer_presented` |
| 4 | Payment pending | Stripe payment link issued | `payment_pending` |
| ✓ | **Won** | Stripe `payment.confirmed` | `payment_confirmed` |

Lost reasons (configure these exactly): `price`, `timing`, `chose-other-provider`, `no-response`, `not-qualified`, `out-of-scope`. The free-question side conversation never moves this deal; abandonment after N days of inactivity → Lost `no-response` (🔭 worker).

### P2 · Onboarding & Production (created on payment)

| # | Stage | Enter when | Canonical funnel stage(s) |
| --- | --- | --- | --- |
| 1 | Start consent | B2B start-before-completion consent recorded | `start_approved` (`b2b_start_consent_pending`) |
| 2 | Legal data | Impressum/legal data collected | `legal_data_requested` |
| 3 | Materials | texts/images/access collected | `materials_requested` |
| 4 | In production | studio building | `production_ready` |
| ✓ | **Won (Launched)** | site live | (operator marks) |

The "start now vs in 14 days" choice (`start_deferred`) is a **flag/field** on this deal, not a stage — a deferred start sits at _Start consent_ with a `start_after` date, so the delivery SLA clock is honest.

### P3 · Subscription & Lifecycle (created on payment, long-lived)

This is the retention board — the deal that _is_ the recurring relationship. Use Pipedrive **recurring revenue / subscription** on this deal for MRR.

| # | Stage | Meaning |
| --- | --- | --- |
| 1 | Active | subscription healthy, invoices paid |
| 2 | Health-check due | periodic success touch (configurable cadence) |
| 3 | Upsell open | a growth module / cross-sell opportunity is live |
| 4 | Renewal | yearly renewal window (for yearly plans) |
| 5 | At risk / Dunning | a Stripe invoice failed; recovery in progress |
| ✗ | Churned | subscription canceled (Lost reasons: `price`, `closed-business`, `dissatisfied`, `switched`) |

State here is **driven by Stripe** (🔭 RFC-0191): `invoice.paid` → Active, `invoice.payment_failed` → At risk/Dunning, `customer.subscription.deleted` → Churned. Managers act; they do not hand-move stages that Stripe owns.

### P4 · Change & Support (per request)

| # | Stage | Enter when | Canonical funnel stage(s) |
| --- | --- | --- | --- |
| 1 | Requested | Client asks for a change | `change_balance_checked` |
| 2 | Included | covered by the plan's change allowance | (balance ≥ 1) |
| 2' | Payment pending | allowance exhausted → `changePrice` invoice | `change_payment_pending` |
| 3 | In progress | studio working (description captured) | `change_description_requested` |
| ✓ | **Delivered** | change shipped | (operator marks) |

The **included-changes balance** is a number custom field on the P3 Subscription deal (authoritative count); a P4 deal decrements it when Included, or bills `changePrice` when exhausted. Ad-hoc work that is _not_ in the offer (custom scope) is also a P4 deal with a manually issued Stripe invoice (see §07) — the operator handoff path feeds this.

## Custom fields (create once, reused by the sync worker)

**On Deal:**

| Field | Type | Purpose |
| --- | --- | --- |
| `funnel_stage` | single-select (the 26 canonical stages) | precise stage mirror (RFC-0188) |
| `site_key` | text | links the P1–P4 deals of one site |
| `lagebild_deal_id` | text | back-link to `buffer_deals.id` |
| `organization_name` | text | target company (interim until RFC-0190 Org link) |
| `offer_plan` | single-select (`monthly`,`yearly`) | chosen plan |
| `offer_snapshot` | large text | frozen deal-time prices (audit) |
| `locale` | single-select (`de`,`uk`) | conversation language |
| `stripe_customer_id` | text | Stripe Customer |
| `stripe_subscription_id` | text | Stripe Subscription (P3) |
| `included_changes_balance` | numeric | remaining included changes (P3) |
| `consent_ref` | text | `buffer_consent_events.id` (legal audit) |

**On Person:** `lagebild_contact_id` (text), `preferred_locale` (single-select). **On Organization:** `lagebild_organization_id` (text), `industry` (text), `region` (text).

> Keep the `funnel_stage` option list **byte-identical** to `VISITOR_FUNNEL_STAGES`. The generic pipeline `stage_id` is derived from it via the platform bridge (`FUNNEL_STAGE_TO_BUFFER_STAGE` → worker `STAGE_MAP`). Do not edit stage ids by hand.

## Native Pipedrive automations (allowed) vs platform code (required)

- ✅ **Allowed** (Pipedrive-native, no Make.com): manager reminders, "deal idle N days" nudges, Slack/email notifications to the team, activity creation on stage change.
- 🔭 **Platform-owned** (RFC-0190/0191 sync worker, never a GUI automation): creating the linked P2/P3 deals on payment, writing `funnel_stage`/`stripe_*`/`offer_snapshot`, decrementing the change balance, moving P3 on Stripe events. These touch canonical state and must run in code that Compass/RFC can see.

## Migration from the legacy Pipedrive funnel

The legacy single pipeline (`pipeline 8`, the invoice-paid webhook router on stages `51/58`) is **retired** (RFC-0188). There is no backward compatibility: rebuild the four pipelines above cleanly, recreate the custom fields, and let the sync worker repopulate from Lagebild. Do **not** reuse legacy stage ids or the webhook router as a dispatcher.
