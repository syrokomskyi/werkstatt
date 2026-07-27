# 08 — Stripe metadata contract (unblocks `/api/stripe-webhook`)

> The one hard problem the lifecycle layer (RFC-0191) could not be built without: a Stripe webhook like `invoice.paid` or `customer.subscription.updated` does **not** natively carry the Lagebild Organization, Deal, or the invoice's purpose. This file fixes that by standardizing the **metadata we attach to Stripe objects** and the **resolution rules** the webhook route + buffer adapter + sync worker follow. Implement to this contract and the remaining RFC-0191 code (route + lifecycle persistence) is deterministic — no guessing.

Status: 🟡 the metadata is set by the billing client (we control it); 🔭 the route + lifecycle persistence are the remaining RFC-0191 code, listed at the end as precise deltas.

## Principle

Stripe is the billing authority but it does not know our ids. So we **stamp our ids onto the durable Stripe objects** (Customer, Subscription, one-off Invoice) at creation time, and every derived webhook event resolves back to Lagebild by reading that metadata — with a buffer-lookup fallback. Cycle invoices inherit context from their Subscription; one-off invoices carry their own. Amounts are always Stripe's (cents); we never recompute.

## Canonical metadata keys

All our ids use a `lagebild_` prefix to avoid collision with Stripe-native or third-party metadata. Values are strings.

| Key | Meaning |
| --- | --- |
| `lagebild_tenant_id` | the Lagebild tenant UUID (also known from the per-site webhook route) |
| `lagebild_organization_id` | `buffer_organizations.id` (the billed company, RFC-0190) |
| `lagebild_deal_id` | `buffer_deals.id` — the relevant deal (acquisition / subscription / change) |
| `site_key` | stable id linking the P1–P4 deals of one site (§01) |
| `locale` | `de` \| `uk` |
| `plan` | `digital_foundation_monthly` \| `digital_foundation_yearly` |
| `invoice_kind` | `setup` \| `cycle` \| `change` \| `adhoc` (one-off invoices only; cycle is inferred) |

## Which Stripe object carries which keys

Set these when the **billing client** creates each object (`@gogol/integration-adapter-stripe`).

### Checkout Session (initial purchase → `payment.confirmed`)

```jsonc
{
  "mode": "subscription",
  "client_reference_id": "<buffer_deals.id of the P1 acquisition deal>",
  "metadata": {                       // on the Session (for checkout.session.completed)
    "lagebild_tenant_id": "...",
    "lagebild_organization_id": "...",
    "lagebild_deal_id": "...",        // = client_reference_id
    "site_key": "...",
    "locale": "de"
  },
  "subscription_data": {
    "metadata": {                     // ← Stripe COPIES this onto the created Subscription
      "lagebild_tenant_id": "...",
      "lagebild_organization_id": "...",
      "lagebild_deal_id": "...",      // the P3 subscription deal (or the originating site deal)
      "site_key": "...",
      "plan": "digital_foundation_monthly"
    }
  }
}
```

> Critical: subscription context must go in **`subscription_data.metadata`**, not just the session `metadata` — Stripe applies `subscription_data.metadata` to the Subscription so every later `customer.subscription.*` and cycle `invoice.*` event can resolve it.

### Customer (one per Organization)

```jsonc
"metadata": { "lagebild_tenant_id": "...", "lagebild_organization_id": "...", "site_key": "..." }
```

Also persist `stripe_customer_id` on `buffer_organizations` (RFC-0190 field) — the **fallback** resolution path.

### Subscription

Carries the `subscription_data.metadata` above (tenant, org, deal, site_key, plan). The worker keeps `buffer_subscriptions.stripe_subscription_id` ⇄ this object.

### One-off Invoice (change / ad-hoc)

```jsonc
"metadata": {
  "lagebild_tenant_id": "...",
  "lagebild_organization_id": "...",
  "lagebild_deal_id": "<the P4 change/ad-hoc deal>",
  "site_key": "...",
  "invoice_kind": "change"            // or "adhoc"
}
```

Cycle invoices are created by Stripe from the subscription — they have **no** explicit `invoice_kind`; it is inferred (next section).

## `invoice_kind` classification (deterministic precedence)

For any `invoice.*` event, classify in this order:

1. **`invoice.metadata.invoice_kind`** if present → use it (`change` | `adhoc` | `setup`).
2. Else if **`invoice.subscription` is set** → `cycle` (a recurring subscription invoice).
3. Else inspect **line-item price ids** against the price-role registry (below):
   - contains the base plan price (`STRIPE_PRICE_BASE_MONTHLY`/`_YEARLY`) → `cycle`;
   - only the setup price (`STRIPE_PRICE_SETUP`) → `setup`;
   - contains the change price (`STRIPE_PRICE_CHANGE`) → `change`;
   - otherwise → `adhoc`.

### Price-role registry

A small server-side map (env-configured, same place as the price ids in §02/§05) lets the classifier and the worker reason about a `price.id` without hardcoding:

```
STRIPE_PRICE_BASE_MONTHLY=price_...   # role: cycle (plan=monthly)
STRIPE_PRICE_BASE_YEARLY=price_...    # role: cycle (plan=yearly)
STRIPE_PRICE_SETUP=price_...          # role: setup
STRIPE_PRICE_CHANGE=price_...         # role: change
STRIPE_PRICE_MOD_*=price_...          # role: module (recurring; affects MRR, not a separate invoice_kind)
STRIPE_PRICE_HOURLY=price_...         # role: adhoc
```

Module price ids change the subscription's MRR (via `customer.subscription.updated`) but do not introduce a new `invoice_kind` — their charges ride the `cycle` invoice.

## Resolution algorithm (route → buffer)

Given a verified lifecycle event, resolve in this order (first hit wins):

1. **tenant** — from the per-site webhook route context (the route is per-tenant); cross-check `metadata.lagebild_tenant_id`.
2. **organization** — `metadata.lagebild_organization_id`; else lookup `buffer_organizations` by `stripe_customer_id` (the fallback — requires `findOrganizationByStripeCustomer`, listed in the deltas).
3. **deal** — `metadata.lagebild_deal_id`; else the org's subscription deal (P3) for subscription/cycle events, or fail-soft (record the invoice against the org with `deal_id` null) for an unattributable one-off.
4. **invoice_kind** — the precedence above.

For **cycle invoices**, read the metadata from the **Subscription** (`invoice.subscription` → fetch subscription → its metadata) since the invoice itself has none. The billing client may also copy the subscription metadata onto each invoice for convenience, but the route must not rely on that.

## Event → action table

| Stripe event | invoice_kind | Buffer writes | Pipedrive (sync worker) |
| --- | --- | --- | --- |
| `checkout.session.completed` | — | funnel `payment.confirmed` (existing path) | P1 → Won; create linked P2 + P3 |
| `customer.subscription.created` | — | `upsertSubscription` (status=active, plan, mrr, period, init `included_changes_balance`) | create P3 _Active_ (set MRR) |
| `customer.subscription.updated` | — | `upsertSubscription` (status, mrr, period) | P3 _Active_/_At risk_/_Upsell_ by status & MRR delta |
| `customer.subscription.deleted` | — | `upsertSubscription` status=canceled | P3 _Churned_ |
| `invoice.paid` (subscription) | cycle | `appendInvoice` kind=cycle, paid; **reset** `included_changes_balance` to per-cycle allowance; clear dunning | P3 _Active_ |
| `invoice.paid` (one-off) | change/adhoc | `appendInvoice`; for `change` advance the P4 deal | P4 _In progress_ |
| `invoice.paid` (setup line) | setup | `appendInvoice` kind=setup | — |
| `invoice.payment_failed` | inferred | `appendInvoice` status=open; (kept) | P3 _At risk / Dunning_; notify operator |
| `charge.refunded` | — | `appendInvoice` (negative) or mark; operator review | operator note on the deal |

> **Change balance**: an _included_ change decrements `buffer_subscriptions.included_changes_balance` via `adjustChangeBalance(-1)` at the funnel `change.requested` step (no Stripe event); a `cycle` `invoice.paid` **resets** it to the per-cycle allowance.

## `/api/stripe-webhook` route contract

Section-owned route (emitted by `api.routes.generate`), per site:

1. Read the **raw request body bytes** (do not `JSON.parse` before verifying).
2. `verifyStripeSignature(rawBody, req.headers["stripe-signature"], STRIPE_WEBHOOK_SECRET)` — fail-closed → `400`.
3. `stripeEventToIntegrationEvent(JSON.parse(rawBody))` → normalized `IntegrationEvent` (`source: "stripe"`, `eventId = <stripe event id>`); `null` (unmapped type) → `200` ack, no-op.
4. Publish to **Upstash QStash EU** (`buildQstashPublish`) → the site's `/api/integration-route` → the `crm:supabase-buffer` destination (same EU-resident path as UChat; RFC-0181).
5. Return `200` immediately after enqueue (Stripe wants a fast ack); QStash handles retries.

Secrets (server-only, via `api[].secrets`): `STRIPE_WEBHOOK_SECRET`, `STRIPE_SECRET_KEY`, `UPSTASH_QSTASH_*`. `billing.secrets.validate` enforces the first two in the env schema.

## Idempotency

- `eventId` = the Stripe event id → the QStash/Redis ledger dedups in-flight redelivery (RFC-0181).
- `buffer_invoices.stripe_invoice_id` is unique per tenant → `appendInvoice` ignore-duplicates.
- `buffer_subscriptions.stripe_subscription_id` is unique per tenant → `upsertSubscription` merges.
- Stripe **redelivers** webhooks; every write path above is idempotent by a Stripe id.

## Remaining RFC-0191 code (precise deltas to implement this contract)

1. ✅ **`integration-adapter-stripe/mapping.ts`** (commit `febb5551`) — lifecycle events extract `metadata.lagebild_organization_id` (back-compat `organization_id`), `lagebild_deal_id`, `site_key`, `invoice_kind` and the line-item price ids; `needsSubscriptionLookup` is flagged when `invoice.subscription` is set and the invoice has no `lagebild_*` metadata.
2. ✅ **`@gogol/integration/lifecycle.ts`** (commit `febb5551`) — `LifecycleEventPayload` gained `lagebildOrganizationId?`, `lagebildDealId?`, `siteKey?`, `priceIds?`, `needsSubscriptionLookup?` (invoiceKind already existed).
3. ✅ **`crm-buffer.ts` + client** (commit `febb5551`) — `findOrganizationByStripeCustomer(tenantId, stripeCustomerId)` (the fallback resolution path).
4. ✅ **`integration-adapter-supabase-crm/adapter.ts`** (done, commits `1fe288b1`, `dc4aed3c`, `06f2bfc2`) — the lifecycle branch in `persistEventToBuffer` resolves org/deal, `upsertSubscription` (balance set on create, omitted on update), `appendInvoice`, resets the change balance on a paid `cycle` invoice, decrements it when a funnel `change.requested` (at `change_description_requested`) consumes an included change, and records `payment.refunded` as a negative void ledger entry.
5. 🔭 **`sync worker`** — new ops (`upsert_subscription`, lifecycle deal moves): create linked P2/P3 deals on `payment.confirmed`, set MRR, move P3 by status, advance P4 on a paid change. **Needs live Pipedrive.**
6. 🟡 **`/api/stripe-webhook`** (scaffold done, commit `ec8ba50f`) — the section route verifies the Stripe signature (raw body), maps, and publishes to QStash EU; the delivery callback routes billing events to the buffer only. Compiles + validates; **verifiable only against live Stripe**.
7. ✅ **`billing.config.validate`** (done, commit `06f2bfc2`) — asserts the price-role registry env ids (`STRIPE_PRICE_BASE_MONTHLY/_YEARLY/_SETUP/_CHANGE`) are in the generated env schema.

> Deltas 1–4, 6 (scaffold), 7 are done — the **whole Stripe → Lagebild path compiles and validates**. Only delta 5 (the worker draining lifecycle state to the Pipedrive P3/P4 boards) needs live Pipedrive; and delta 6 needs live Stripe to exercise real signatures + delivery.

## Business decision — RESOLVED (2026-06-12)

**`includedChangesPerCycle = 1`** — one included change per billing cycle. Added to `business/{lang}/offer.md` (de + uk). The lifecycle layer initializes `buffer_subscriptions.included_changes_balance` to this value on `subscription.created`, resets it to this value on each `cycle` `invoice.paid`, and decrements it (`adjustChangeBalance(-1)`) at the funnel `change.requested` step; when it reaches 0 the P4 flow bills `changePrice`.

The value reaches the lifecycle layer by being stamped into the Stripe **Subscription metadata** (`included_changes_per_cycle`) at checkout creation — the same offer→Stripe→Lagebild flow as prices. (Carrying it into the lifecycle payload is part of the remaining subscription-upsert delta.)
