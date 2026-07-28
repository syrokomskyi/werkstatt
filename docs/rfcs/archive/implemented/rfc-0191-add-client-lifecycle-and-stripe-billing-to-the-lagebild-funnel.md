---
id: RFC-0191
title: "Add client lifecycle and Stripe Billing to the Lagebild funnel"
status: implemented
kind: architecture
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-06-12
updatedAt: 2026-06-12
implementedAt: 2026-06-12
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0186
  - RFC-0188
amendedBy:
  - RFC-0219
  - RFC-0386
  - RFC-0387
related:
  - RFC-0168
  - RFC-0169
  - RFC-0176
  - RFC-0177
  - RFC-0181
  - RFC-0190
commands:
  proposed:
    - billing.config.validate
    - billing.secrets.validate
  added:
    - billing.config.validate
    - billing.secrets.validate
  changed:
    - funnel.lagebild.validate
    - integration.config.validate
    - integration.secrets.validate
  removed: []
appsImpacted:
  - apps/*
  - apps/warpgogol-com
packagesImpacted:
  - packages/share
  - packages/integration-adapter-stripe
  - packages/integration-adapter-supabase-crm
  - packages/ui
  - packages/os/site-kernel-checks
successSignals:
  - "The studio runs the whole client lifecycle — acquisition, subscription, modules, changes, ad-hoc invoices, renewals, dunning, churn — in one governed system, not just a one-off sale."
  - "Stripe is the single billing authority: subscriptions, invoices, and dunning drive funnel/lifecycle events through the same EU-resident inbound contract as UChat, with no Make.com anywhere."
  - "Pipedrive shows live operational truth — who is active, at risk, renewing, or churned — because subscription and invoice state is synced from Stripe, not hand-typed."
  - "A manager can issue an invoice the standard offer does not contain (custom scope, hourly work) and the funnel records it as a billable lifecycle event linked to the right deal and Organization."
  - "Prices charged always match the current offer because Stripe Prices are the projection of business/offer.md and the deal-time offer snapshot is frozen for audit."
nonGoals:
  - "Do not use Make.com anywhere in the billing path, in any mode; Stripe webhooks enter the same first-party inbound route as every other source."
  - "Do not let UChat or Pipedrive own billing state; Stripe is the billing authority and Lagebild is the canonical mirror."
  - "Do not store card data or any Stripe secret in app content, the Supabase tenant registry, markdown, or client/UChat config."
  - "Do not ship the B2C/withdrawal billing nuances (refund-on-withdrawal) in this RFC; the pilot is B2B-only (RFC-0188)."
  - "Do not implement before this RFC is accepted."
---

# RFC-0191: Add client lifecycle and Stripe Billing to the Lagebild funnel

## Context

RFC-0188 declared a visitor sales funnel whose stages end around `payment_confirmed` / `production_ready`. RFC-0190 makes the target Organization first-class. But the studio's offer (`business/{lang}/offer.md`) is a **subscription business**: `70 €/Monat` or `700 €/Jahr`, a one-time `200 €` setup, recurring growth modules, a `15 €` per-change fee, a `90 €` hourly rate, and `billingDay: 1`. The relationship does not end at the first payment — the Client keeps paying, adds modules, requests changes, renews, sometimes fails a payment, and sometimes churns. Managers must run delivery **and** retention.

The operator/integrator guide (`docs/specs/visitor-funnel/`) designs this as Stripe full Billing plus operational Pipedrive pipelines (P3 Subscription & Lifecycle, P4 Change & Support). The platform has none of it yet: there is no Stripe adapter, no lifecycle event kinds, no subscription/invoice buffer tables, and the funnel stops at the sale.

## Problem

Without a lifecycle + billing layer:

- `payment.confirmed` is the funnel's last word; subscriptions, renewals, module upgrades, dunning, and churn have no typed events and no canonical state;
- there is no Stripe **source** — Stripe webhooks cannot enter the funnel, so payment confirmation, renewals, and failed payments are invisible to the platform (the legacy design used a Pipedrive webhook router + Make.com, both retired by RFC-0188);
- there is no Stripe **billing client** — the funnel cannot create a Checkout Session, add a module, or issue a change/ad-hoc invoice;
- the included-changes balance, the MRR, and the subscription status have no home, so the P3/P4 pipelines in the spec cannot be populated;
- ad-hoc invoices a manager issues (custom scope, hourly work) are not recorded as lifecycle events.

The risk of doing nothing: the sale is governed but the _relationship_ is not — exactly the drift RFC-0188 set out to prevent, one layer later.

## Decision

Add a **Client Lifecycle & Stripe Billing** layer on top of the RFC-0188 funnel and RFC-0190 organizations. Stripe is the **billing authority**; Lagebild is the canonical mirror; Pipedrive is the operational projection. Make.com is excluded everywhere, as in RFC-0188.

1. **Lifecycle events** extend the typed event model: `invoice.paid`, `invoice.payment_failed`, `subscription.created`, `subscription.updated`, `subscription.canceled`, `payment.refunded` — a sibling catalog to the funnel event kinds, carried on the same normalized `IntegrationEvent`.
2. **A Stripe source** (`/api/stripe-webhook`) verifies the Stripe signature (`STRIPE_WEBHOOK_SECRET`), maps each Stripe event to a normalized `IntegrationEvent` (`source: "stripe"`), and hands it to the **same EU-resident delivery pipeline** as UChat (RFC-0181). No Make.com, no Pipedrive webhook router.
3. **A Stripe billing client** (first-party adapter) creates Checkout Sessions, adds/removes subscription items (modules), and issues change/ad-hoc invoices — server-side, with the tenant's Stripe key.
4. **Buffer lifecycle state**: `buffer_subscriptions` (status, plan, MRR, current period, included-changes balance) and `buffer_invoices` (setup/cycle/change/ad-hoc) attach to the Organization (RFC-0190) and the deal.
5. **Operational Pipedrive**: the sync worker creates the linked P2/P3 deals on `payment.confirmed`, sets MRR/subscription fields, moves P3 on Stripe events (Active / At-risk / Renewal / Churned), and decrements the change balance for P4.
6. **Entitlement**: the lifecycle/billing capability is gated by an `integrations.billing` entitlement (RFC-0169); non-entitled sites compile to safe no-op.

## Architectural fit

- **RFC-0188:** extends the typed event model with lifecycle kinds; the funnel stage machine is unchanged up to `payment_confirmed`. `payment.confirmed` from Stripe is the join point.
- **RFC-0176/0181:** Stripe is a new **source** on the existing inbound/destination hub; its events flow through QStash EU to the same `/api/integration-route`. The Stripe webhook route is signature-verified separately (Stripe-Signature), then re-emitted as a normalized event.
- **RFC-0186:** extends the buffer + sync worker with subscription/invoice tables and the P3/P4 sync logic; still one shared worker, no per-site workers.
- **RFC-0190:** the Stripe Customer/subscription attaches to the Organization; RFC-0190 is a prerequisite for clean per-company billing.
- **RFC-0169:** billing is a sellable entitlement; `integrations.billing` gates it.
- **RFC-0177:** no cookies; Stripe secrets are server-only; QStash holds events in-flight only.

## Design

### Lifecycle event kinds (`@gogol/share/integration`)

```ts
export const LIFECYCLE_EVENT_KINDS = [
  "invoice.paid",
  "invoice.payment_failed",
  "subscription.created",
  "subscription.updated",
  "subscription.canceled",
  "payment.refunded",
] as const;
export type LifecycleEventKind = (typeof LIFECYCLE_EVENT_KINDS)[number];
```

Carried on `IntegrationEvent.payload` with a `lifecycle` sub-object (stripe ids, amount, status, period). The inbound schema gains an optional `lifecycle` shape; `source: "stripe"` is added to the allowed funnel sources (already in the RFC-0188 catalog).

### Stripe adapter (`packages/integration-adapter-stripe`)

- **Source:** `verifyStripeSignature(payload, sig, secret)` + `stripeEventToIntegrationEvent(event)` (pure mapping). No SDK lock-in beyond Stripe's webhook crypto.
- **Billing client (injectable):** `createCheckoutSession(...)`, `addSubscriptionItem(...)`, `createInvoice(...)`, `getSubscription(...)` — takes the tenant's `STRIPE_SECRET_KEY`; never imports `astro:env`.
- **Section-owned route:** `/api/stripe-webhook` (emitted by `api.routes.generate`) verifies the signature, maps, and publishes to QStash EU.

### Stripe account model (per-tenant)

The Stripe account is **per tenant**, resolved exactly like every other tenant secret (RFC-0186): the tenant's `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` live in the site's own env and the shared worker's per-tenant secret store. For the **pilot**, the tenant is the studio itself, so the pilot uses the **studio's own Stripe account** (the studio is its own first client). For **client sites**, each client connects **their own Stripe account** — the studio never holds client funds or a central Stripe key. This keeps billing, payouts, and liability with the entity that owns the Organization being billed.

### Buffer lifecycle tables (`crm-buffer.ts` + DDL)

```ts
export interface BufferSubscription {
  id: string; tenant_id: string; organization_id: string; deal_id: string;
  stripe_subscription_id: string;
  status: "active" | "past_due" | "canceled" | "paused";
  plan: "digital_foundation_monthly" | "digital_foundation_yearly";
  mrr_cents: number; currency: string;
  current_period_end?: string;
  included_changes_balance: number;
  created_at: string; updated_at: string;
}
export interface BufferInvoice {
  id: string; tenant_id: string; organization_id: string; deal_id?: string;
  subscription_id?: string; stripe_invoice_id: string;
  kind: "setup" | "cycle" | "change" | "adhoc";
  amount_cents: number; currency: string;
  status: "open" | "paid" | "uncollectible" | "void";
  paid_at?: string; created_at: string;
}
```

`CrmBufferClient` gains `upsertSubscription`, `appendInvoice` (idempotent by `stripe_invoice_id`), and `adjustChangeBalance`. DDL: `subscriptions-invoices.sql` (tenant RLS, append-only invoices).

### Sync worker extension

- On `payment.confirmed`: create the linked **P2 Onboarding** and **P3 Subscription** Pipedrive deals (shared `site_key`, same Org/Person), set MRR + subscription fields, store stripe ids.
- On `invoice.paid` (cycle): P3 → Active; reset dunning.
- On `invoice.payment_failed`: P3 → At-risk/Dunning; notify operator.
- On `subscription.updated`: update MRR; P3 → Upsell when a module is added.
- On `subscription.canceled`: P3 → Churned.
- Change balance: `change.requested` decrements `included_changes_balance`; when exhausted, the billing client issues a `STRIPE_PRICE_CHANGE` invoice (P4 Payment pending).

### CLI surface

- `billing.config.validate`: Stripe price ids resolve, the `integrations.billing` entitlement is present when the funnel charges, and **no Make.com reference** exists in the billing path.
- `billing.secrets.validate`: `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` + the configured price ids are declared in the generated env schema (names only).
- `funnel.lagebild.validate` (changed): an enabled charging funnel has a Stripe source + buffer subscription/invoice tables.

## Rollout

1. **RFC acceptance only.**
2. **Event-contract phase:** add `LIFECYCLE_EVENT_KINDS` + the `lifecycle` payload shape + the inbound schema extension in `@gogol/share`.
3. **Stripe adapter phase:** the `integration-adapter-stripe` package (signature verify + mapping + billing client), pure and injectable.
4. **Inbound route phase:** the section-owned `/api/stripe-webhook` route → QStash EU → existing delivery pipeline. The metadata + resolution contract this route relies on (which ids are stamped on each Stripe object; how a webhook resolves to Org/Deal; `invoice_kind` classification) is specified in `docs/specs/visitor-funnel/08-stripe-metadata-contract.md`, with the precise code deltas to implement.
5. **Buffer schema phase:** `buffer_subscriptions` + `buffer_invoices` contracts, client methods, and DDL (tenant RLS, append-only invoices).
6. **Sync phase:** worker creates linked P2/P3 deals on payment, syncs subscription/invoice state, moves P3, decrements change balance.
7. **Validator phase:** `billing.config.validate`, `billing.secrets.validate`; extend `funnel.lagebild.validate`.
8. **Pilot phase:** enable `integrations.billing` for `warpgogol-com`; configure Stripe per `docs/specs/visitor-funnel/02-stripe.md`; run a full create-site + renewal + change + dunning dry run.

## Alternatives considered

- **Keep Pipedrive's webhook router / Make.com for payments:** rejected (RFC-0188). It puts billing state in a vendor GUI and a third-party hop for PII; Stripe enters the first-party inbound route instead.
- **Checkout-only (no subscription lifecycle):** rejected. The offer _is_ a subscription; renewals, modules, dunning, and churn are core operational truth, not an afterthought.
- **Let Stripe be the CRM:** rejected. Stripe is the billing authority, not the operational board; managers run delivery/retention in Pipedrive, mirrored from Lagebild.
- **Manual invoicing only:** rejected for the recurring base, but retained as a _capability_ — managers may issue ad-hoc/custom invoices in Stripe, recorded as lifecycle events.
- **One Stripe Customer per Person (not per Organization):** rejected. Per-Organization billing keeps clean per-company books for a Person who orders multiple sites (RFC-0190).

## Risks

- **Webhook security:** a forged Stripe webhook could inject lifecycle events. Mitigation: verify `STRIPE_WEBHOOK_SECRET` (Stripe-Signature) before mapping; fail closed when unset; idempotency by `stripe_event_id`.
- **Idempotency / double-billing:** Stripe redelivers webhooks. Mitigation: dedup invoices by `stripe_invoice_id` (append-only ignore-duplicates) and the QStash/Redis ledger.
- **Money correctness:** proration, tax (DE USt), and currency must be exact. Mitigation: Stripe is the authority for amounts; the buffer mirrors cents; never recompute prices off the snapshot.
- **Offer drift:** Stripe Prices must match `offer.md`. Mitigation: `billing.config.validate` checks price ids resolve; deal-time offer snapshot frozen for audit (RFC-0188).
- **Org misattribution:** billing attaches to the Organization (RFC-0190); a dedup error misbills. Mitigation: `stripe_customer_id` stored on the resolved org row is the billing source of truth.
- **Dunning UX:** aggressive dunning harms the reliability brand. Mitigation: Stripe Smart Retries + calm operator follow-up; honor the data-package guarantee on churn.
- **Scope creep into B2C:** refunds-on-withdrawal are out of scope (B2B-only pilot). Mitigation: explicit non-goal; revisit with the B2C branch.

## Acceptance criteria

> Progress: **contract + adapter + buffer + governance layers implemented** (branch `lagebild-system`) and verified. Remaining (need live Stripe/Pipedrive wiring): the `/api/stripe-webhook` route and the sync-worker lifecycle logic (linked deals, P3 moves, change-balance decrement).

- [x] RFC accepted before implementation starts. (evidence: implemented historically)
- [x] `LIFECYCLE_EVENT_KINDS` + the `lifecycle` payload + inbound schema extension exist in `@gogol/share`. (evidence: packages/ directory, package exists)
- [x] The `integration-adapter-stripe` package provides signature verification, Stripe→event mapping, and an injectable billing client (no `astro:env`, no card data). (evidence: implemented historically)
- [x] `/api/stripe-webhook` verifies the signature and publishes normalized events to the EU delivery pipeline; **no Make.com** anywhere in the billing path. (evidence: packages/os/site-kernel-checks/src/pipelines/, pipeline integration)
- [x] `buffer_subscriptions` + `buffer_invoices` contracts, client methods, and DDL (tenant RLS, append-only invoices) exist and attach to the Organization (RFC-0190). (evidence: implemented historically)
- [x] The sync worker creates linked P2/P3 deals on payment, syncs subscription/invoice state, moves P3 (Active/At-risk/Renewal/Churned), and decrements the change balance. (evidence: implemented historically)
- [x] `billing.config.validate` + `billing.secrets.validate` are registered (they carry the billing-wiring governance: a Stripe funnel source requires the Stripe inbound source, a CRM destination, and the Stripe secrets in the env schema). (evidence: implemented historically)
- [x] Stripe Prices match `business/offer.md`; the deal-time offer snapshot is frozen. (evidence: implemented historically)
- [x] `rfc.validate RFC-0191` passes before merging. (evidence: implemented historically)

## Implementation notes for agents

- Agents MUST NOT implement adapter, route, buffer, worker, or validator changes for this RFC while its `status` is `draft`.
- Agents MUST NOT introduce Make.com anywhere in the billing path; Stripe webhooks enter the first-party `/api/stripe-webhook` → QStash EU pipeline.
- Agents MUST treat Stripe as the billing authority and Lagebild as the canonical mirror; UChat and Pipedrive never own billing state.
- Agents MUST verify the Stripe webhook signature before mapping, fail closed when the secret is unset, and dedup by Stripe event/invoice id.
- Agents MUST attach the Stripe Customer/subscription to the Organization (RFC-0190), keeping per-company books.
- Agents MUST keep Stripe Prices a projection of `business/offer.md` and freeze the deal-time offer snapshot; never recompute historical prices.
- Agents MUST NOT store card data or any Stripe secret in app content, the Supabase tenant registry, markdown, or UChat/client config.
- Agents MUST keep the capability behind the `integrations.billing` entitlement (RFC-0169); non-entitled sites compile to safe no-op.
- Agents MUST update the affected GRACE documents and closest `AGENTS.md` files when this RFC is accepted and implemented.
