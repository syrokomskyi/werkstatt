# 02 — Stripe Billing setup

> The offer **is** a subscription (70 €/mo or 700 €/yr) plus a one-time setup (200 €), optional recurring growth modules, per-change fees, and ad-hoc invoices. So Stripe runs in full **Billing** mode from day one — not just a one-off Checkout. Prices are the projection of `business/{lang}/offer.md`; if a number here disagrees with `offer.md`, `offer.md` wins and you re-create the price.
>
> 🟡 The Stripe console setup is manual. 🔭 The **Stripe → funnel** adapter (signature verification + event mapping) is **RFC-0191** platform code — do not parse Stripe webhooks in a Pipedrive automation or Make.com.

## Customer model

- **One Stripe Customer per Organization** (the billed company). A Person who orders sites for three companies produces three Customers — clean per-company books, which is what managers need.
- When the orderer pays for someone else's company, set that Customer's **billing email** to the orderer but keep the Customer = the target Organization. The site is still attributed to the right company; the payer is just the billing contact.
- Persist `stripe_customer_id` on the Lagebild Organization (🔭 RFC-0190) and mirror it to the Pipedrive Organization + Deal.

## Products & Prices

Create these Products, each with the Prices shown. Record every Price id — you will paste them into the UChat offer variables (§03) and the Stripe adapter config (§05).

| Product | Price | Type | Amount | Price id var |
| --- | --- | --- | --- | --- |
| Digitales Fundament | Monthly | recurring / month | **70 €** | `STRIPE_PRICE_BASE_MONTHLY` |
| Digitales Fundament | Yearly | recurring / year | **700 €** | `STRIPE_PRICE_BASE_YEARLY` |
| Setup | Onboarding setup | one-time | **200 €** | `STRIPE_PRICE_SETUP` |
| Module · Visibility | Monthly | recurring / month | **29 €** | `STRIPE_PRICE_MOD_VISIBILITY` |
| Module · Booking | Monthly | recurring / month | **29 €** | `STRIPE_PRICE_MOD_BOOKING` |
| Module · Trust | Monthly | recurring / month | **19 €** | `STRIPE_PRICE_MOD_TRUST` |
| Module · Multilingual | Setup per language | one-time | **129 €** | `STRIPE_PRICE_MOD_MULTILANG_SETUP` |
| Module · Multilingual | Monthly per language | recurring / month | **29 €** | `STRIPE_PRICE_MOD_MULTILANG_MONTHLY` |
| Module · Automation | Monthly (tiered) | recurring / month | **59–199 €** | `STRIPE_PRICE_MOD_AUTOMATION_*` |
| Change | Paid change | one-time | **15 €** | `STRIPE_PRICE_CHANGE` |
| Hourly | Ad-hoc work | one-time (qty = hours) | **90 €** | `STRIPE_PRICE_HOURLY` |

Notes:

- **Automation** is a range (59–199 €). Create one Price per tier (e.g. `…_S` 59, `…_M` 119, `…_L` 199), or use a manually-priced invoice item for custom automation scope.
- **Setup** is one-time but billed _with_ the first subscription invoice — add it as a one-off invoice item on the first subscription cycle, or as a separate line in the initial Checkout.
- Currency is **EUR**. Tax: configure Stripe Tax for DE (USt) so invoices are compliant.
- Set the subscription **billing cycle anchor to day 1** (`billingDay: 1` in `offer.md`).

## The purchase: first payment

The funnel's `payment.link.requested` produces a Stripe **Checkout Session** (mode: `subscription`) that includes:

- the chosen base Price (`STRIPE_PRICE_BASE_MONTHLY` or `_YEARLY`),
- the `STRIPE_PRICE_SETUP` one-off line,
- any selected module Prices,
- `client_reference_id` = the Lagebild `deal_id` (so the confirmation maps back),
- `metadata`: `{ site_key, lagebild_deal_id, locale, organization_id }`.

UChat shows the Checkout URL (it does not collect card data). On success Stripe fires `checkout.session.completed`.

> **Metadata contract:** the exact ids we stamp on the Checkout Session / Customer / Subscription / Invoice — and how a webhook resolves back to the Lagebild Organization, Deal, and `invoice_kind` — are specified in [08-stripe-metadata-contract.md](08-stripe-metadata-contract.md). That contract is the prerequisite for the `/api/stripe-webhook` route + lifecycle persistence.

## Webhook → funnel events

Point a Stripe webhook endpoint at the site's Stripe route (🔭 RFC-0191: `/api/stripe-webhook`). It verifies `STRIPE_WEBHOOK_SECRET`, maps the Stripe event to a normalized `IntegrationEvent` (`source: "stripe"`), and hands it to the same EU delivery pipeline as UChat.

| Stripe event | Funnel/lifecycle event | Effect |
| --- | --- | --- |
| `checkout.session.completed` | `payment.confirmed` | P1 → Won; create P2 Onboarding + P3 Subscription (worker); record `stripe_customer_id`/`subscription_id` |
| `invoice.paid` (cycle) | `invoice.paid` 🔭 | P3 → Active; renewal confirmed; reset dunning |
| `invoice.payment_failed` | `invoice.payment_failed` 🔭 | P3 → At risk / Dunning |
| `customer.subscription.updated` | `subscription.updated` 🔭 | module add/remove, plan change; update MRR |
| `customer.subscription.deleted` | `subscription.canceled` 🔭 | P3 → Churned |
| Paid-change invoice `invoice.paid` | `payment.confirmed` (change) | P4 → In progress |

> The `payment.confirmed` mapping is enough for the **pilot create-site journey** today (it reuses the existing inbound contract). The `invoice.*`/`subscription.*` rows are the lifecycle layer in **RFC-0191** — they need new event kinds + buffer tables.

## Subscriptions, modules, and changes over time

- **Add a module** mid-cycle: add the module Price as a subscription item (Stripe prorates). `customer.subscription.updated` → P3 _Upsell_ logged, MRR updated.
- **Included change**: decrement `included_changes_balance` (no charge). No Stripe event.
- **Paid change**: create a one-off invoice with `STRIPE_PRICE_CHANGE`; on `invoice.paid`, P4 → In progress.
- **Ad-hoc / custom scope** (not in the offer): manager creates a Stripe invoice with `STRIPE_PRICE_HOURLY` (qty = hours) or a custom line; on `invoice.paid`, the linked P4 deal advances. This is the operator-handoff outcome from §03/§07.

## Dunning (failed payments)

- Enable **Smart Retries** + Stripe dunning emails (3 retries over ~2 weeks).
- `invoice.payment_failed` → P3 _At risk_; operator is notified (handoff trigger "payment/billing issues").
- Final failure → `customer.subscription.deleted` → P3 _Churned_ (Lost reason `price` or `dissatisfied`). The site's downgrade/suspension policy is an operator decision (§07).

## Secrets (server-only, never in content or client config)

Set via the site's env (see §05) and the Stripe console:

```
STRIPE_SECRET_KEY            # server API key (sk_live_… / sk_test_…)
STRIPE_WEBHOOK_SECRET        # endpoint signing secret (whsec_…)
STRIPE_PRICE_BASE_MONTHLY    # price id
STRIPE_PRICE_BASE_YEARLY
STRIPE_PRICE_SETUP
STRIPE_PRICE_MOD_VISIBILITY  # …and the rest of the module/change/hourly price ids
```

Never put a Stripe secret in UChat, markdown, or the Supabase tenant registry (RFC-0188 non-goals). Price ids are not secret but live with the adapter config, not in chat copy.
