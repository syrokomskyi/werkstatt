# Visitor Sales Funnel — operator & integrator guide

> A human-followable specification for wiring **`apps/webgogol-com` ↔ UChat ↔ Lagebild (Supabase) ↔ Pipedrive ↔ Stripe** into one coherent visitor sales funnel and client lifecycle. This is the pilot configuration; replication to other client sites is a later concern (see [00-overview.md](00-overview.md) §Scope).

This folder is the **руководство** referenced by RFC-0188. It tells a human exactly what to create and where, so the same visitor conversation, stage machine, CRM picture, and billing work end to end. The platform code (state machine, buffer contracts, validators) lives in `packages/*`; this guide is the operational counterpart for the parts that live in vendor consoles (UChat flows, Pipedrive pipelines, Stripe products).

## Who owns what (one-line map)

| Concern | Owner | Where |
| --- | --- | --- |
| Stage / event / transition graph | **Platform** | `@gogol/integration` (`funnel.ts`) |
| Canonical visitor/deal state | **Lagebild** (Supabase buffer) | `integration-adapter-supabase-crm` |
| The conversation (render + ask) | **UChat** | UChat console (this guide) |
| Prices, guarantees, copy | **Platform content** | `business/{lang}/offer.md`, `funnel/{lang}` |
| Payments & subscriptions | **Stripe** | Stripe console (this guide) |
| Operational sales/delivery picture | **Pipedrive** | Pipedrive console (this guide) |

**Rule of the system:** UChat renders and _requests_ transitions; it never owns the graph, prices, consent of record, or CRM writes. Stripe and Pipedrive are a source and a destination. The single source of truth for each fact has exactly one home above.

## Read in this order

1. **[00-overview.md](00-overview.md)** — architecture, data flow, single-source-of-truth, what is implemented vs to-build, the end-to-end setup checklist.
2. **[01-pipedrive.md](01-pipedrive.md)** — the operational pipeline architecture (Acquisition → Onboarding → Subscription → Change/Support), Person→N Deals→Organization, custom fields, automations.
3. **[02-stripe.md](02-stripe.md)** — Stripe Billing: products/prices, the customer model, webhooks into the funnel, dunning.
4. **[03-uchat-flows.md](03-uchat-flows.md)** — the canonical UChat flow + subflows, node-by-node, with `de`/`uk` copy, consent capture, payment, free-question AI + operator handoff, and the exact event each step POSTs.
5. **[04-lagebild.md](04-lagebild.md)** — Supabase buffer setup: tables, RLS, secrets, the sync worker.
6. **[05-site-config.md](05-site-config.md)** — `apps/webgogol-com` config: `system.md`, the `funnel/{lang}` content domain, env secrets, validators to run.
7. **[06-event-contract.md](06-event-contract.md)** — the normalized event payload reference and the **canonical stage ↔ UChat node ↔ Pipedrive stage** mapping table.
8. **[07-operator-runbook.md](07-operator-runbook.md)** — day-to-day operator actions: handoff, ad-hoc invoices, reading the Pipedrive board, change requests.
9. **[08-stripe-metadata-contract.md](08-stripe-metadata-contract.md)** — the precise Stripe metadata + resolution contract that unblocks `/api/stripe-webhook` and the lifecycle persistence (RFC-0191): which ids we stamp on Customer/Subscription/Invoice, how a webhook resolves to Org/Deal, `invoice_kind` classification, and the exact code deltas to implement.
10. **[09-go-live-checklist.md](09-go-live-checklist.md)** — the sequenced launch runbook (Pipedrive → Lagebild → Stripe → site config → UChat → smoke tests), with the validation gates, the Tier-1 (now) vs Tier-2 (after the two live-service deltas) split, and rollback.

## Status legend used throughout

- ✅ **Built** — code exists in the repo today (RFC-0188 Phases 2–3).
- 🟡 **Configure** — no code change; you set this up in a vendor console following this guide.
- 🔭 **Planned (RFC)** — needs platform code that is proposed but not yet accepted; the governing RFC is named inline. Do not hand-build a vendor workaround for these — they must land as governed platform code first.

## State chart (RFC-0219)

[`state-chart.generated.md`](state-chart.generated.md) — a GENERATED, edge-labelled, drift-guarded state chart of the entire deal lifecycle: Layer 1 = visitor funnel (26 stages, all transitions with their triggering events), Layer 2 = subscription lifecycle (active/past_due/paused/canceled). **Do not edit by hand.** Run `build:check funnel.statechart.generate` to regenerate; `funnel.statechart.validate` (in `packages-check`) will fail the build if the committed chart diverges from the code maps.

> **Agents:** read the state chart before modifying any transition logic. It is the explicit, machine-verified navigation graph for the deal lifecycle. See also [`FUNNEL_TRANSITION_TRIGGERS`](../../../../packages/share/src/integration/funnel.ts) and [`SUBSCRIPTION_TRANSITION_TRIGGERS`](../../../../packages/share/src/integration/lifecycle.ts).

## Related RFCs

- **RFC-0188** — Visitor Sales Funnel state machine (the funnel this guide configures).
- **RFC-0190** — Organizations & multi-site client graph (Person → N Deals → Organization). 🔭
- **RFC-0191** — Client Lifecycle & Stripe Billing (subscriptions, invoices, dunning, lifecycle pipelines). 🔭
- **RFC-0186** — Lagebild buffer + shared sync worker. RFC-0175/0176/0177/0181 — chat port, destination hub, consent/storage policy, EU delivery.
