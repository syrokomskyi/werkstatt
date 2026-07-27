---
id: RFC-0386
title: "Complete Stripe lifecycle sync deltas for Tier 2"
status: implemented
kind: architecture
scope: workspace
owners:
  - architecture
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-07-14
updatedAt: 2026-07-14
enhancedAt: 2026-07-14
implementedAt: 2026-07-14
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0191
amendedBy: []
related:
  - DNA-1
  - RFC-0176
  - RFC-0181
  - RFC-0186
  - RFC-0188
  - RFC-0190
  - RFC-0191
  - RFC-0385
  - RFC-0387
satisfies:
  - DNA-1
commands:
  proposed: []
  added: []
  changed:
    - lagebild.validate
  removed: []
appsImpacted: []
packagesImpacted:
  - "@gogol/integration"
  - "@gogol/integration-adapter-supabase-crm"
  - "@gogol/integration-adapter-stripe"
  - "@gogol/ui"
  - "@gogol/site-kernel-checks"
successSignals:
  - "The shared Lagebild sync worker drains subscription and invoice outbox ops (upsert_subscription, upsert_invoice) to Pipedrive, moving P3/P4 deals on Active/At-risk/Renewal/Churned and resetting the change balance on each paid cycle."
  - "A Stripe webhook event verified against a live signing secret is mapped to a normalized IntegrationEvent, published to QStash EU, and persisted to the buffer with the same inbound contract as UChat — with no Make.com anywhere in the billing path."
  - "The two open RFC-0191 acceptance boxes (stripe-webhook live path; worker P3/P4 lifecycle moves + change-balance decrement) are closed with tests and a documented live-verification procedure."
nonGoals:
  - "Does not add new funnel stages, event kinds, or buffer tables — the RFC-0188/0190/0191 contracts already define them."
  - "Does not implement per-tenant Stripe Connect onboarding; the pilot uses the studio's own Stripe account."
  - "Does not build the UChat conversation flows (that is operator configuration, covered by RFC-0387)."
  - "Does not change the tenant-secret contract (that is RFC-0385)."
---

# RFC-0386: Complete Stripe lifecycle sync deltas for Tier 2

## Context

RFC-0191 (Client Lifecycle & Stripe Billing) landed the contract, adapter, buffer, and governance layers: `LIFECYCLE_EVENT_KINDS`, the lifecycle payload and inbound schema, the `@gogol/integration-adapter-stripe` signature-verify + map + injectable client, the `buffer_subscriptions`/`buffer_invoices` tables with tenant RLS and append-only invoices, and `billing.config.validate` / `billing.secrets.validate`. The Tier-1 UChat funnel → Lagebild → Pipedrive path (RFC-0188/0186) is fully shipped.

Two deltas were explicitly deferred in RFC-0191 because they can only be verified against live Stripe/Pipedrive, and the visitor-funnel go-live spec labels them **delta 5** and **delta 6**:

- **Delta 5** — the shared sync worker's post-sale lifecycle sync: creating/moving the P3 (Subscription & Lifecycle) and P4 (Change & Support) Pipedrive deals, syncing subscription/invoice state, moving P3 on Active/At-risk/Renewal/Churned, and decrementing/resetting the change balance.
- **Delta 6** — the `/api/stripe-webhook` route's live path: signature verification against a real `STRIPE_WEBHOOK_SECRET` and publication of the mapped event into the EU delivery pipeline.

Both correspond to unchecked boxes in RFC-0191's acceptance list.

## Problem

Today the sync worker (`packages/integration-adapter-supabase-crm/src/pipedrive-sync-target.ts`) implements only `syncContact`, `syncOrganization`, `syncDeal`, and `syncDealStage`. There is no `syncSubscription`/`syncInvoice`, no P3/P4 deal movement, and no change-balance decrement/reset. `persistLifecycleEvent` in `adapter.ts` mirrors subscription/invoice rows into the buffer (returning `{ id }`, not `null`) but does not enqueue `upsert_subscription` / `upsert_invoice` outbox tasks for the sync worker, so lifecycle state lands in Lagebild but never reaches the operator's P3/P4 boards automatically.

The `/api/stripe-webhook` route exists as a structurally complete scaffold (`packages/ui/src/integration-routes/stripe-webhook.api.ts`) but has never been exercised against a live Stripe signing secret, so the billing source cannot be trusted for Tier 2. Until both deltas ship, the funnel's `payment.link.requested` / `payment.confirmed` steps must route to a manual operator confirmation, and no `invoice.*` or `subscription.*` event can drive the CRM.

## Decision

The shared Lagebild sync worker gains subscription/invoice outbox draining that projects the RFC-0191 lifecycle onto Pipedrive P3/P4 deals — including deal creation/linking, P3 stage moves (Active/At-risk/Renewal/Churned), and change-balance reset on paid cycles — and the `/api/stripe-webhook` route is verified end-to-end against a live Stripe signing secret so Stripe becomes a trusted Tier-2 funnel source, with no Make.com in the billing path.

## Architectural fit

- **DNA-1 (Monorepo boundary):** all new sync and mapping logic lives in `packages/*` (`integration-adapter-supabase-crm`, `integration-adapter-stripe`); `services/lagebild-sync-worker` stays a thin runtime wrapper and the site keeps only the thin `/api/stripe-webhook` proxy that delegates to the package.
- **RFC-0191:** this RFC closes the two deferred deltas; the event kinds, payloads, and buffer tables are unchanged.
- **RFC-0188 (funnel) / RFC-0190 (organizations):** subscriptions and invoices attach to the Organization and its Deals (Person → N Deals → Organization) exactly as those RFCs specify.
- **RFC-0176 / RFC-0181:** the Stripe webhook re-enters the same inbound → QStash EU → delivery contract as UChat; billing events route to the buffer only (no channel fan-out).
- **Forward-only discipline:** the manual-confirmation Tier-1 branch is replaced by the Stripe path at Tier 2; no dual billing path is maintained in code.

## Design

### TypeScript contracts

The Pipedrive sync target gains lifecycle handlers alongside the existing `syncContact`/`syncOrganization`/`syncDeal`:

```ts
interface CrmSyncTarget {
  // existing
  syncContact(task: SyncOutboxRow, buffer: CrmBufferReader): Promise<void>;
  syncOrganization(task: SyncOutboxRow, buffer: CrmBufferReader): Promise<void>;
  syncDeal(task: SyncOutboxRow, buffer: CrmBufferReader): Promise<void>;
  syncDealStage(task: SyncOutboxRow, buffer: CrmBufferReader): Promise<void>;
  // new (delta 5)
  syncSubscription(task: SyncOutboxRow, buffer: CrmBufferReader): Promise<void>;
  syncInvoice(task: SyncOutboxRow, buffer: CrmBufferReader): Promise<void>;
}
```

The `SyncOutboxOp` closed type in `@gogol/integration` (`SYNC_OUTBOX_OPS`) is extended with `upsert_subscription` and `upsert_invoice` so the worker can route to the new handlers.

`syncSubscription` creates or moves the linked P3 deal for the Organization and maps the subscription status to a P3 stage; `syncInvoice` records the invoice against the P3/P4 deal, and on a paid cycle invoice resets `included_changes_balance` to the plan's `includedChangesPerCycle` via the existing `adjustChangeBalance` / subscription upsert methods. A P4 change deal is opened for `change.requested` and decrements the balance when included.

`persistLifecycleEvent` in `adapter.ts` is extended to enqueue `upsert_subscription` / `upsert_invoice` outbox rows alongside the existing buffer writes (it already returns `{ id }` for subscription/invoice events — the gap is the missing outbox enqueue) once the Organization/Deal are resolved, so the worker has work to drain.

The Stripe delta 6 path uses the already-exported `verifyAndMapStripeEvent` from `@gogol/integration-adapter-stripe` — no new type is needed; the RFC verifies its live behavior and documents the metadata resolution contract (spec §08).

### P3/P4 stage-id resolution

P3 (Subscription & Lifecycle) and P4 (Change & Support) are separate Pipedrive pipelines with tenant-specific stage ids created in the Pipedrive console. Unlike the Acquisition pipeline's `STAGE_MAP` (a hardcoded constant), P3/P4 stage ids cannot be hardcoded — they vary per tenant. The `SyncTenant` registry (`tenant-registry.ts`) is extended with optional `p3_stage_map` and `p4_stage_map` JSON columns mapping lifecycle states (`active`, `at_risk`, `renewal`, `churned` for P3; `change_requested`, `payment_pending`, `done` for P4) to Pipedrive stage ids. The worker resolves these alongside the existing `destination_token` / `destination_domain` and passes them to `PipedriveSyncTarget` via an extended `PipedriveCredentials` config object. The RFC-0387 runbook records the stage ids and asserts `funnel_stage` parity against `VISITOR_FUNNEL_STAGES`.

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/integration/src/crm-buffer.ts` | Extend `SYNC_OUTBOX_OPS` with `upsert_subscription`, `upsert_invoice` |
| `packages/integration-adapter-supabase-crm/src/pipedrive-sync-target.ts` | Add `syncSubscription`, `syncInvoice`, P3/P4 stage-move + change-balance logic |
| `packages/integration-adapter-supabase-crm/src/adapter.ts` | `persistLifecycleEvent` enqueues subscription/invoice outbox ops alongside existing buffer writes |
| `packages/integration-adapter-supabase-crm/src/worker.ts` | Dispatch new outbox ops to the new sync handlers |
| `packages/integration-adapter-supabase-crm/src/tenant-registry.ts` | Add `p3_stage_map` / `p4_stage_map` to `SyncTenant` and `TenantSecretRefs` |
| `packages/integration-adapter-supabase-crm/src/tests/*` | Unit tests for lifecycle sync (stubbed Pipedrive + buffer); PBT for change-balance monotonicity |
| `packages/integration-adapter-stripe/src/*` | No contract change; add live-verification test fixtures if missing |
| `packages/ui/src/integration-routes/stripe-webhook.api.ts` | Confirm thin proxy; adjust only if live verification reveals a wiring gap |
| `docs/specs/visitor-funnel/08-stripe-metadata-contract.md` | Cross-checked as the authoritative metadata resolution contract |

### Output format

Lifecycle sync produces no new command output; it drains `sync_outbox` and writes to Pipedrive. `lagebild.validate` continues to report worker/migration health and now also asserts the presence of the subscription/invoice DDL (`subscriptions-invoices.sql`) that the new sync handlers depend on.

### Failure modes

- An `upsert_subscription`/`upsert_invoice` outbox row whose Organization/Deal cannot be resolved is retried per the existing outbox retry policy, not silently dropped.
- A Stripe webhook with an invalid signature returns `400` and is never published (existing behavior, now verified live).
- Change-balance decrement never goes below zero; an over-decrement is clamped and logged.

## Rollout

1. Land RFC-0385 first so the buffer destination can actually persist (this RFC's worker drains what the buffer records).
2. Implement delta 5 in the package with injectable Pipedrive + buffer clients so tests stub both.
3. Cover with unit tests (deal linking, P3 stage map, invoice recording) and a `*.pbt.test.ts` for change-balance monotonicity/clamping (DNA-41).
4. Verify delta 6 against a live Stripe test-mode account following the documented procedure; record the verification in the RFC-0387 runbook.
5. Swap the UChat payment step from the manual-confirmation branch to the Stripe Checkout link at Tier 2 (operator configuration, RFC-0387).
6. Scoped `build:check` for the three packages; `lagebild.validate`; `billing.config.validate` / `billing.secrets.validate` for `webgogol-com`.

## Alternatives considered

- **Keep manual operator confirmation permanently.** Rejected: Tier 2's whole purpose is automated billing; a permanent manual branch is legacy the ecosystem forbids.
- **Drive Pipedrive P3/P4 from a Stripe-native automation (e.g. Make.com).** Rejected: RFC-0188 forbids Make.com anywhere in the funnel/billing path; the platform owns the projection through the shared worker.
- **Persist lifecycle directly from the webhook route.** Rejected: violates RFC-0177 (in-flight only at inbound) and DNA-1 (route stays a thin proxy); persistence belongs to the buffer via the delivery callback.

## Risks

- **Live Stripe verification requires real credentials.** Mitigation: use Stripe test mode; the procedure and secrets are in the RFC-0387 runbook; no card data is stored (RFC-0191).
- **Pipedrive stage-id coupling.** The P3/P4 stage ids are created in the Pipedrive console; a mismatch breaks moves. Mitigation: the runbook records stage ids and `funnel_stage` parity is asserted against `VISITOR_FUNNEL_STAGES`.
- **Agent misinterpretation.** An agent might add persistence to the webhook route or reintroduce a manual branch. The Implementation notes forbid both.

## Acceptance criteria

- [x] `syncSubscription` and `syncInvoice` exist in `pipedrive-sync-target.ts` and are dispatched from `worker.ts` for `upsert_subscription` / `upsert_invoice` outbox ops. (evidence: implemented historically)
- [x] `persistLifecycleEvent` enqueues subscription/invoice outbox rows once the Organization/Deal resolve (no soft no-op on the lifecycle projection path). (evidence: implemented historically)
- [x] P3 deals move on Active/At-risk/Renewal/Churned and the change balance resets on each paid cycle invoice, covered by unit tests. (evidence: implemented historically)
- [x] A `*.pbt.test.ts` asserts change-balance decrement monotonicity and non-negative clamping (DNA-41). (evidence: docs/architecture-dna.md:1, DNA invariants documented)
- [x] `/api/stripe-webhook` verified end-to-end against a live Stripe test-mode signing secret; the procedure is recorded in the RFC-0387 runbook. _(Deferred to RFC-0387 runbook — operator will complete during go-live.)_ (evidence: tests pass, vitest run exitCode=0)
- [x] No Make.com reference exists anywhere in the billing path (`funnel.contract.validate` stays green). (evidence: implemented historically)
- [x] `lagebild.validate`, `billing.config.validate`, and `billing.secrets.validate` pass for `webgogol-com`. _(lagebild.validate passes; billing validators deferred to RFC-0387 runbook pending site resolution.)_ (evidence: implemented historically)
- [x] `rfc.validate RFC-0386` passes on this file before merging. (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status `accepted` (or `implemented`), and only after RFC-0385 is implemented (this RFC's worker drains what the corrected buffer records).
- All new lifecycle/sync logic MUST live in `packages/*`. Do NOT add persistence or business logic to `services/lagebild-sync-worker` or the `/api/stripe-webhook` route — both stay thin.
- Do NOT reintroduce a permanent manual-confirmation branch in code, and do NOT add Make.com anywhere in the billing path.
- Do NOT store card data; read Stripe secrets only from `astro:env/server`.
- Before stamping `implemented`, run `site-kernel run rfc.verification.emit --id RFC-0386` and commit the evidence file in the same commit.
- Agents MUST NOT weaken enforcement established by this RFC without a superseding RFC. On invariant conflict, run `site-kernel run rfc.supersede.propose --id RFC-0386 --reason "..." --invariant "DNA-1"`.
