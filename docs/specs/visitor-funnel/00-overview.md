# 00 — Architecture overview

## The one-paragraph picture

A Visitor opens `webgogol-com`, clicks the first-party launcher, and a UChat conversation loads (click-to-load, after DSGVO acknowledgement — RFC-0175/0177). UChat renders the sales funnel: language, qualification, the live offer, payment, the B2B start consent, and material collection — and lets the Visitor ask anything at any time. At each meaningful step UChat POSTs a **normalized event** to the site's `/api/integration-inbound`, which publishes it (EU-resident, QStash) back to the site's delivery route, where the **Supabase buffer (Lagebild)** records the canonical stage, captured fields, offer snapshot, and consent evidence. A shared **sync worker** drains the buffer to **Pipedrive** so managers see the real operational picture. **Stripe** confirms payments and runs the ongoing subscription; its webhooks re-enter the same inbound route as funnel events. The platform owns the state machine; every vendor is a source or a destination.

## Roles & single source of truth

Every fact has exactly one home. Copies elsewhere are projections, never authorities.

| Fact | Source of truth | Projected into |
| --- | --- | --- |
| Allowed stages, events, transitions | `@gogol/integration/funnel.ts` | UChat stage field, Pipedrive stage |
| Current funnel stage of a deal | Lagebild `buffer_deals.funnel_stage` | UChat custom field, Pipedrive stage |
| Prices / guarantees / modules | `business/{lang}/offer.md` | UChat variables, the offer snapshot |
| Conversation copy / quick replies | `funnel/{lang}` content (🔭 RFC-0188 Ph7) | UChat message nodes |
| Payment / subscription state | Stripe | Lagebild buffer, Pipedrive |
| Legal consent evidence | Lagebild `buffer_consent_events` (append-only) | — (never re-derived) |
| Operational sales/delivery view | Pipedrive (projection) | — (managers read here) |

If the Visitor ever sees a price, it came from `offer.md` → UChat variable. If a manager ever sees a stage, it came from `funnel_stage` → Pipedrive. Nothing is typed twice.

## End-to-end data flow

```
Visitor ─▶ first-party launcher (RFC-0175, click-to-load, DSGVO gate)
        ─▶ UChat conversation (renders funnel; AI for free questions; operator handoff)
              │  every meaningful step:
              ▼
        POST /api/integration-inbound      (auth: INTEGRATION_INBOUND_SECRET)
              │  normalized IntegrationEvent { eventId, kind, source:"uchat", payload:FunnelEvent }
              ▼
        Upstash QStash EU  ──▶  /api/integration-route  (EU-resident, retries, dedup)
              │  gogol-adapter destination = crm:supabase-buffer
              ▼
        Lagebild (Supabase): buffer_contacts, buffer_organizations🔭, buffer_deals,
              buffer_stage_transitions, buffer_funnel_events, buffer_consent_events,
              sync_outbox
              │
              ▼  shared sync worker drains sync_outbox per tenant
        Pipedrive: Person → N Deals → Organization, across operational pipelines

Stripe webhooks (checkout/invoice/subscription) ─▶ /api/integration-inbound ─▶ … ─▶ Lagebild
```

The Stripe webhook path is the **same** inbound contract as UChat — Stripe is just another typed source. There is **no Make.com anywhere** in this diagram, in any mode (RFC-0188).

## What is implemented vs what to build

| Capability | Status | Note |
| --- | --- | --- |
| Stage/event/transition contracts | ✅ Built | RFC-0188 Phase 2 (`funnel.ts`) |
| `funnel.{contract,stage,copy,lagebild}.validate` | ✅ Built | RFC-0188 Phase 2 |
| Buffer: canonical stage bridge, offer snapshot, append-only funnel/consent rows | ✅ Built | RFC-0188 Phase 3 |
| Buffer DDL for the above | ✅ Built | `services/lagebild-sync-worker/supabase/funnel-phase3.sql` |
| Inbound route, QStash EU delivery, Pipedrive sync worker | ✅ Built | RFC-0176/0181/0186 |
| UChat funnel flows (this guide) | 🟡 Configure | RFC-0188 Phase 4/6 wires the adapter; flows are built in UChat |
| `funnel/{lang}` conversation copy domain | 🔭 RFC-0188 Ph7 | provisions UChat copy from platform content |
| `chat-adapter-uchat` API client + webhook receiver | 🔭 RFC-0188 Ph4 | emits FunnelEvents; provisions copy/offer |
| Organizations: Person → N Deals → Org | 🔭 RFC-0190 | `buffer_organizations` + `deal.organization_id` |
| Stripe Billing: subscriptions, invoices, dunning; lifecycle pipelines | 🔭 RFC-0191 | new event kinds + buffer tables + Stripe adapter |

You can build the UChat flows and the Pipedrive/Stripe consoles **now** following this guide; the 🔭 items are where the conversation will eventually persist richer state. Where a step depends on a 🔭 item, the relevant section says so and gives the interim behavior.

## Pilot decisions (locked for this guide)

- **Pipedrive:** operational multi-pipeline lifecycle (not a single sales board) — §01.
- **Client model:** Person (orderer) → many Deals, each Deal → one Organization — §01, RFC-0190.
- **Legal:** B2B-only at launch — DSGVO acknowledgement + start-before-completion consent. B2C/Widerruf is deferred (the consent row already supports both).
- **Payments:** Stripe only, full Billing from day one — §02, RFC-0191.
- **UChat knowledge base:** curated manually inside UChat — §03 §Free questions.
- **Operator handoff:** explicit request / low AI confidence; payment & billing issues; out-of-offer custom scope — §03 §Handoff, §07.
- **Tenancy:** this guide is the single-bot pilot; multi-tenant UChat replication is a later RFC.

## Setup order checklist

Do these in order; each section is self-contained but later steps assume earlier ones.

1. ☐ **Stripe** (§02): create products/prices, the webhook endpoint, copy the price ids.
2. ☐ **Pipedrive** (§01): create the four pipelines, custom fields, and lost reasons; note the stage ids.
3. ☐ **Lagebild / Supabase** (§04): apply `funnel-phase3.sql`, set tenant secrets, deploy the sync worker.
4. ☐ **Site config** (§05): set `integrations.funnel`, switch the CRM destination to `supabase-buffer`, add env secrets, run the validators.
5. ☐ **UChat** (§03): build the canonical flow + subflows, wire the inbound POSTs, set the offer variables, configure the AI + operator handoff.
6. ☐ **Event mapping** (§06): verify each UChat step posts the right stage and that it lands in Lagebild and Pipedrive.
7. ☐ **Dry run** (§07): walk a full create-site journey + a change request; confirm resume, no dead-ends, de/uk parity, and the Pipedrive picture.

> Validation gates: after step 4, `funnel.contract.validate`, `funnel.stage.validate`, `funnel.copy.validate`, `funnel.lagebild.validate`, and `integration.config.validate` must pass for `webgogol-com` (see §05). Do not go live with any of them red.
