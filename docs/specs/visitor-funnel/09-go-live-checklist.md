# 09 — Go-live checklist

> The launch runbook for the `webgogol-com` pilot. Do the phases in order; each step links to the detailed section and ends with a **verify** gate. Nothing goes live with a red gate.
>
> This consolidates the implemented platform code (RFC-0188 Phases 2/3/4/7/9, RFC-0190 in full, RFC-0191's in-repo lifecycle persistence) with the console setup a human performs.

## Two launch tiers (be honest about what is automated)

Two platform deltas are **not yet implemented** (they need live Pipedrive/Stripe):

- 🔭 **delta 5** — the sync worker's P3/P4 deal moves + `upsert_subscription` outbox sync.
- 🔭 **delta 6** — the `/api/stripe-webhook` section route (signature → QStash EU).

So launch in two tiers:

| Tier | Scope | Blocked on |
| --- | --- | --- |
| **Tier 1 — now** | UChat funnel → Lagebild → Pipedrive: Person → N Deals → Organization, canonical stage, offer snapshot, consent, change requests. **Payment confirmed manually** by an operator. | nothing (all code shipped) |
| **Tier 2 — later** | Full Stripe automation: Checkout link, webhooks, subscriptions, invoices, dunning, P3/P4 auto-moves. | deltas 5 + 6 |

> **Hard gate:** until **delta 6** ships, no Stripe event can enter the funnel — so the `payment.link.requested` / `payment.confirmed` steps in UChat must route to a **manual operator confirmation** (operator marks the deal paid, the conversation resumes at `payment_confirmed`). Build the UChat funnel with that manual branch for Tier 1; swap to the Stripe link for Tier 2.

---

## Phase 0 — accounts & deploy

- [ ] Accounts ready: **UChat**, **Pipedrive**, **Stripe** (the studio's own for the pilot — §02), **Supabase** (EU region), **Upstash** (QStash + Redis, EU).
- [ ] The platform code (branch `lagebild-system`) is merged and deployed for `webgogol-com`.
- [ ] Privacy/Datenschutz page is ready to name processors (UChat, Supabase, Upstash, Pipedrive, Stripe) — §05 §5.

## Phase 1 — Pipedrive (§01)

- [ ] Create the four pipelines (Acquisition, Onboarding & Production, Subscription & Lifecycle, Change & Support) with the stages in §01; record each stage id.
- [ ] Create the custom fields (Deal/Person/Organization) in §01, incl. `funnel_stage` (single-select == the 26 canonical stages), `site_key`, `lagebild_*`, `organization_name`.
- [ ] Configure the Acquisition lost reasons.
- **Verify:** the `funnel_stage` option list is byte-identical to `VISITOR_FUNNEL_STAGES`.

## Phase 2 — Supabase / Lagebild (§04)

- [ ] Apply the DDL in order: `funnel-phase3.sql`, `organizations.sql`, `subscriptions-invoices.sql` (all additive + idempotent).
- [ ] Register the tenant + secrets: `lagebild.tenant.add --site webgogol-com`, set the `TENANT_WEBGOGOL_COM_*` secrets, then `lagebild.tenant.enable --site webgogol-com`.
- [ ] Deploy the shared sync worker (`services/lagebild-sync-worker`).
- **Verify:** `lagebild.validate` and `lagebild.worker.dev.vars.validate` pass (no per-site workers, no leaked values).

## Phase 3 — Stripe (Tier 2; §02 + §08)

> Skip for Tier 1 (manual payment). Required for Tier 2.

- [ ] Create the Products/Prices in §02; record every price id into the env (`STRIPE_PRICE_*`).
- [ ] Set up the metadata stamping per **§08**: Checkout `client_reference_id` + `metadata`, and **`subscription_data.metadata`** (tenant/org/deal/site_key/plan/`included_changes_per_cycle`).
- [ ] Create the webhook endpoint → `/api/stripe-webhook` (🔭 delta 6) with `STRIPE_WEBHOOK_SECRET`.
- [ ] Enable Stripe Tax (DE USt) + Smart Retries (dunning).
- **Verify:** `billing.config.validate` + `billing.secrets.validate` pass (inbound `stripe` source, CRM destination, price-role ids + secrets in the env schema).

## Phase 4 — Site config (§05)

- [ ] `system.md`: add `integrations.funnel` (`version: "1.0.0"`, `enabled: true`, `sources`); switch the CRM destination from `pipedrive` → **`supabase-buffer`**; (Tier 2) add `stripe` to `inbound.sources` and `funnel.sources`.
- [ ] Set the env secrets (§05 §3): `INTEGRATION_INBOUND_SECRET`, `SUPABASE_BUFFER_*`, `UPSTASH_QSTASH_*`, and (Tier 2) `STRIPE_*`.
- [ ] Name all processors in the Datenschutz page; add the studio↔client DPA reference.
- **Verify (the go-live gate — all must pass):**
  ```sh
  site-kernel run funnel.contract.validate  --site webgogol-com
  site-kernel run funnel.stage.validate     --site webgogol-com
  site-kernel run funnel.copy.validate      --site webgogol-com
  site-kernel run funnel.lagebild.validate  --site webgogol-com
  site-kernel run funnel.org.validate       --site webgogol-com   # destination == supabase-buffer
  site-kernel run integration.config.validate --site webgogol-com
  site-kernel run integration.secrets.validate --site webgogol-com
  site-kernel run consent.activation.validate  --site webgogol-com # click-to-load
  site-kernel run legal.processors.validate    --site webgogol-com
  # Tier 2 only:
  site-kernel run billing.config.validate   --site webgogol-com
  site-kernel run billing.secrets.validate  --site webgogol-com
  ```

## Phase 5 — UChat (§03)

- [ ] Build the flows + subflows from `src/content/funnel/{de,uk}` (welcome, create-site, change-site, consent, ask-anything) — node-by-node per §03.
- [ ] Set the offer **variables** from `business/{lang}/offer.md` (never hardcode a price). Re-sync on any offer change.
- [ ] Wire the **Stage Tracker** External Request → `POST /api/integration-inbound` with `Authorization: Bearer {INTEGRATION_INBOUND_SECRET}` (store the secret in UChat's secure field store) and the normalized event body in §03. Set `organization.name` from the qualification step (RFC-0190).
- [ ] Configure the AI free-question KB (curated) + the operator-handoff triggers (§03 §7).
- [ ] **Tier 1:** the payment step routes to a _manual operator confirmation_ branch (no Stripe link yet). **Tier 2:** the payment step shows the Stripe Checkout URL.
- [ ] Confirm the click-to-load launcher loads UChat only after DSGVO acknowledgement (RFC-0175/0177).

## Phase 6 — smoke tests (definition of done)

Walk these and confirm the Lagebild rows + the Pipedrive board:

- [ ] **Create-site journey** end to end: welcome → DSGVO → intent → qualification (incl. "for which company?") → offer (prices from `offer.md`) → payment (manual T1 / Stripe T2) → B2B start consent → legal data → materials → done. Verify **resume-at-stage**, **free-question-and-return**, **no No-match/No-reply dead-end**, full **de/uk** parity.
- [ ] Lagebild has: `buffer_contacts` (Person), `buffer_organizations` (target company), `buffer_deals` with `funnel_stage` + `offer_snapshot`, append-only `buffer_funnel_events`, and a `buffer_consent_events` row for the B2B consent.
- [ ] Pipedrive shows **Person → N Deals → Organization** with the precise `funnel_stage`.
- [ ] **Change request**: included (decrements the balance) and paid (T2: `changePrice` invoice).
- [ ] **Tier 2 only**: a renewal (`invoice.paid` cycle → balance reset to `includedChangesPerCycle`=1), and a failed payment (`invoice.payment_failed` → P3 At-risk).
- [ ] **No Make.com** anywhere (the conversation, the config, the destinations). `funnel.contract.validate` stays green.

## Phase 7 — multi-site order check (RFC-0190)

- [ ] Have one Person order a second site **for a different company**; confirm a second Deal linked to a second Organization under the same Person — the "real picture" managers asked for.

## Rollback / abort

- The launcher is click-to-load: nothing third-party loads before consent, so disabling is safe.
- To pause a site: `lagebild.tenant.disable --site webgogol-com` (keeps history).
- To pull the funnel: remove `integrations.funnel` from `system.md` (the validators return to no-op pass) and unpublish the UChat flow. No data is lost (Lagebild is the durable record).

## Open items before Tier 2

- 🔭 Ship **delta 6** (`/api/stripe-webhook`) — without it, Stripe events never reach the funnel.
- 🔭 Ship **delta 5** (worker P3/P4 moves + `upsert_subscription` sync) — without it, lifecycle state lands in Lagebild but the Pipedrive P3/P4 boards are moved by the operator, not automatically.
- Confirm the per-tenant Stripe model for client sites (each client connects their own Stripe — §02, RFC-0191).
