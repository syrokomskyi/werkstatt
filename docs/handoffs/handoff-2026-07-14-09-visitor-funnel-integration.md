---
handoffId: HANDOFF-2026-07-14-01
date: 2026-07-14
createdAt: 2026-07-14T09:37:00+02:00
sessionModel: cascade
topic: Visitor funnel integration — RFC series, implementation, and go-live runbook
---

# Handoff: Visitor Funnel Integration

## Context

This session created and partially implemented a three-RFC series to fix integration drifts, complete Stripe lifecycle sync, and activate the `webgogol-com` visitor sales funnel. RFC-0385 (tenant-secret fix) and RFC-0386 (Stripe lifecycle deltas) are now implemented and reviewed. RFC-0387 (activation runbook) remains a draft awaiting human architecture review.

## Session brief

### Phase 1 — Analysis and decomposition

The session began with a comprehensive analysis of the integration ecosystem: API routes, adapter contracts, secret wiring, RFC acceptance criteria, spec documentation, and the Werkstatt/Sternsystem site model. The analysis identified:

- A **critical bug**: the Supabase buffer adapter reads `secrets.SUPABASE_BUFFER_TENANT_ID` while the delivery route injects `TENANT_ID`, making every buffer write fail with "missing credentials".
- **Two deferred Stripe deltas** (RFC-0191 open checkboxes): worker lifecycle sync (delta 5) and live webhook verification (delta 6).
- **Missing activation**: `webgogol-com` has no `integrations.funnel` block, still routes CRM directly to `pipedrive`, and no external systems are provisioned.
- **Stale documentation**: `docs/specs/visitor-funnel/*` references the retired `apps/` layout and `lagebild-system` branch.

The task was decomposed into 3 RFCs in dependency order: 0385 → 0386 → 0387. The operator confirmed the decomposition.

### Phase 2 — RFC creation

All three RFCs were created manually from the `rfc-0000-template.md` template (the `rfc.create` CLI command hung on pnpm dependency checks with a Y/N prompt). All three passed `rfc.validate` with zero violations after adding reciprocal `amendedBy` references in RFC-0186/0188/0191. The series was committed as `c25a2c4e9`.

### Phase 3 — RFC-0385 implementation

The operator advanced RFC-0385 through the full pipeline: audit (`cf7af0e3f`) → enhance (`b7700570c`) → accept (`272676de5`) → plan (`c98bc6184`) → implement (`3de41c02f`, `3b3c22fdb`) → review approved (`a816ed12f`). The implementation renamed `TENANT_ID` to `SUPABASE_BUFFER_TENANT_ID` across the adapter, delivery route, section manifests, and env-example generator. A pre-existing build:check error in 3 packages was also fixed (`42607fb75`).

### Phase 4 — RFC-0386 implementation

The operator advanced RFC-0386 through: audit (`a21f43056`) → enhance (`a0d155ac2`) → accept (`b87c84b40`) → plan (`e09417f90`) → implement in 9 steps (`8eed544a2` through `c2b5a9b38`) → review approved (`d01ef3f76`). The implementation added `syncSubscription`/`syncInvoice` to the CrmSyncTarget, extended `SyncOutboxOp` with `upsert_subscription`/`upsert_invoice`, added P3/P4 stage maps to the tenant registry, enqueued outbox rows from `persistLifecycleEvent`, and added unit + PBT tests. One acceptance criterion (live Stripe webhook verification) was explicitly deferred to the RFC-0387 runbook.

### Phase 5 — Handoff

The operator requested a handoff document capturing the session and the current ecosystem state, noting the `fo-handoff` skill was updated to save to `docs/handoffs/`.

## Completed

- **RFC-0385** — implemented and reviewed (approved). Commits: `3de41c02f`, `3b3c22fdb`, `a816ed12f`.
- **RFC-0386** — implemented and reviewed (approved). Commits: `8eed544a2` through `c2b5a9b38`, `d01ef3f76`.
- **RFC-0387** — draft created and validated. Commit: `c25a2c4e9`. Status: `draft`, no reviewer assigned yet.
- **amendedBy back-references** added to RFC-0186, RFC-0188, RFC-0191.
- **Pre-existing build:check fix** in 3 packages. Commit: `42607fb75`.
- **`@gogol/integration` extraction**: integration hub refactored out of `@gogol/share` into a dedicated package; all consumers migrated. Commits: `bebc24390`, `06d33e449`.

## Remaining

- **RFC-0387** needs human architecture review → acceptance → implementation. It is the activation runbook with step-by-step integrator instructions (Phases 0–8) and the spec-realignment policy.
- **Live Stripe webhook verification** (RFC-0386 deferred criterion): the `/api/stripe-webhook` route must be exercised against a live Stripe test-mode signing secret during the RFC-0387 go-live.
- **External system provisioning** (all human/operator steps): Supabase EU project + DDL, Upstash QStash + Redis EU, Pipedrive pipelines/fields/stages, UChat flow assembly, Stripe products/prices/webhook.
- **Lagebild worker deployment**: `lagebild.tenant.add`, `lagebild.tenant.enable`, `lagebild.worker.deploy` for `webgogol-com`.
- **Site activation mission**: `mission.open` → edit `system.md` (enable `integrations.funnel`, switch CRM to `supabase-buffer`) → validators → `release.publish` → `leitstand.propagate` alt → main.
- **Spec realignment**: `docs/specs/visitor-funnel/{00,05,09,README}.md` must be updated to reference `systems/`/mission paths instead of `apps/webgogol-com`.
- **Pipeline promotion** (RFC-0188 Phase 9): add the four `funnel.*` validators to `APPS_CHECK_AUTHOR_PIPELINE` after pilot stability.

## Current state

### Branch and working tree

- **Branch**: `ecosystem-evolution` (diverged from `origin/ecosystem-evolution` at `50548cce9`).
- **Working tree**: clean (no uncommitted changes).
- **HEAD**: `32b4aeb1f` (fo-handoff skill update).

### RFC status

| RFC | Title | Status | Implemented | Reviewed |
| --- | --- | --- | --- | --- |
| RFC-0385 | Fix Lagebild buffer tenant-secret key drift | implemented | 2026-07-14 | approved |
| RFC-0386 | Complete Stripe lifecycle sync deltas for Tier 2 | implemented | 2026-07-14 | approved |
| RFC-0387 | Activate webgogol-com integration and go-live runbook | draft | — | — |

### Current state of the ecosystem (Текущее состояние экосистемы)

#### Platform code — fully implemented

- **Chat port (RFC-0175)**: click-to-load launcher, UChat adapter (`widgetId: ndslwdpu82roynku`), null adapter. Vendor script injects only after visitor click. `@gogol/chat` + `@gogol/chat-adapter-uchat`.
- **Inbound → delivery hub (RFC-0176/0179/0181)**: `IntegrationEvent` normalization, `/api/integration-inbound` route, Upstash QStash EU delivery, Redis dedup, `/api/integration-route` fan-out callback. Routes live in `@gogol/ui/integration-routes/`.
- **Lagebild buffer (RFC-0186/0190)**: Supabase tables (contacts, organizations, deals, stage_transitions, funnel_events, consent_events, subscriptions, invoices, sync_outbox), tenant RLS, shared sync worker (`services/lagebild-sync-worker`), tenant registry + CLI (`lagebild.tenant.*`). `@gogol/integration-adapter-supabase-crm`.
- **Funnel state machine (RFC-0188/0219)**: 26 canonical stages, 15 event kinds, transition graph, generated state chart. `@gogol/integration/src/funnel.ts`. Validators: `funnel.contract.validate`, `funnel.stage.validate`, `funnel.copy.validate`, `funnel.lagebild.validate`, `funnel.org.validate`.
- **Stripe contour (RFC-0191, completed by RFC-0386)**: signature verification, Stripe→event mapping, injectable billing client, `/api/stripe-webhook` route, lifecycle event kinds, `buffer_subscriptions`/`buffer_invoices`, `billing.config.validate` / `billing.secrets.validate`. `@gogol/integration-adapter-stripe`. Worker now drains `upsert_subscription`/`upsert_invoice` outbox ops with P3/P4 stage moves and change-balance reset.
- **Integration hub extraction**: `@gogol/integration` package extracted from `@gogol/share` — `IntegrationEvent`, `IntegrationSecrets`, `DestinationAdapter`, `SyncOutboxOp`, `CrmBufferReader/Writer`, all buffer types. No backward-compat barrels remain.
- **Funnel content**: `systems/webgogol-com/src/content/funnel/{de,uk}/` — welcome, create-site, change-site, consent, ask-anything. Datenschutz names all processors (UChat/Supabase/Upstash/Pipedrive/Stripe) in both locales.
- **Operator spec**: `docs/specs/visitor-funnel/00-09` including go-live checklist (`09-go-live-checklist.md`). Spec still references `apps/` layout — realignment is part of RFC-0387.
- **Werkstatt pilot**: `webgogol-com` extracted to Sternsystem, release `webgogol-com-r000001` published, channels alt/main configured in `systems/registry.yaml`.

#### What is NOT done (blocking go-live)

- **No `integrations.funnel` block** in `system.md` — all funnel validators are no-op.
- **CRM destination still direct `pipedrive`**, not `supabase-buffer` — events bypass Lagebild.
- **No external systems provisioned**: Supabase project not created, DDL not applied, Upstash not configured, Pipedrive pipelines/fields not set up, UChat flows not built, Stripe not configured.
- **Lagebild worker not deployed, tenant not registered** — the one open RFC-0186 criterion.
- **Site secrets not set** in `.werkstatt/secrets/webgogol-com/`.
- **Spec documentation stale**: references `apps/webgogol-com` and `lagebild-system` branch.
- **`funnel.*` validators not in standard pipeline** (RFC-0188 Phase 9).

#### Key files

| File | Role |
| --- | --- |
| `packages/integration-adapter-supabase-crm/src/adapter.ts` | Buffer destination adapter, `persistLifecycleEvent` |
| `packages/integration-adapter-supabase-crm/src/pipedrive-sync-target.ts` | CrmSyncTarget with syncSubscription/syncInvoice |
| `packages/integration-adapter-supabase-crm/src/worker.ts` | Sync worker dispatch |
| `packages/integration-adapter-supabase-crm/src/tenant-registry.ts` | SyncTenant with P3/P4 stage maps |
| `packages/integration/src/crm-buffer.ts` | SYNC_OUTBOX_OPS, buffer types |
| `packages/integration-adapter-stripe/src/*` | Stripe verify + map |
| `packages/ui/src/integration-routes/integration-inbound.api.ts` | Inbound route |
| `packages/ui/src/integration-routes/integration-delivery.api.ts` | Delivery callback (now injects `SUPABASE_BUFFER_TENANT_ID`) |
| `packages/ui/src/integration-routes/stripe-webhook.api.ts` | Stripe webhook route |
| `packages/ui/src/sections/chat-widget/chat-widget-section.manifest.yaml` | Chat widget section + API secrets |
| `packages/os/site-kernel-checks/src/env/env-example.ts` | Env-example generator with `LAGEBILD_BUFFER_KEYS` |
| `systems/webgogol-com/src/content/system.md` | Site config (needs funnel activation) |
| `systems/registry.yaml` | Fleet registry with alt/main channels |
| `docs/specs/visitor-funnel/` | Operator spec (needs realignment) |

## Suggested skills

- **`fo-idea-audit`** — audit RFC-0387 for ecosystem fit, DNA alignment, and pragmatism before human review.
- **`fo-idea-enhance`** — enhance RFC-0387 with audit findings if needed.
- **`fo-idea-plan`** — plan RFC-0387 implementation once accepted.
- **`fo-idea-implement`** — implement RFC-0387 (spec realignment, pipeline promotion, mission-based site activation).
- **`fo-idea-i-just-want-to-see-the-result`** — full pipeline for RFC-0387 if the operator wants end-to-end automation.

## References

- `docs/rfcs/rfc-0385-fix-lagebild-buffer-tenant-secret-key-drift.md` — implemented
- `docs/rfcs/rfc-0386-complete-stripe-lifecycle-sync-deltas-for-tier-2.md` — implemented
- `docs/rfcs/rfc-0387-activate-webgogol-com-integration-and-go-live-runbook.md` — draft
- `docs/rfcs/archive/implemented/rfc-0186-lagebild-shared-sync-worker-and-tenant-registry.md` — amendedBy 0385, 0387
- `docs/rfcs/archive/implemented/rfc-0188-declare-visitor-sales-funnel-state-machine-for-lagebild.md` — amendedBy 0387
- `docs/rfcs/archive/implemented/rfc-0191-add-client-lifecycle-and-stripe-billing-to-the-lagebild-funnel.md` — amendedBy 0386, 0387
- `docs/specs/visitor-funnel/` — operator spec (00-09)
- `docs/architecture-dna.md` — DNA-1, DNA-40, DNA-46, DNA-48, DNA-49
- Commit `c25a2c4e9` — RFC series creation
- Commit `3de41c02f` — RFC-0385 implementation
- Commit `8eed544a2`–`c2b5a9b38` — RFC-0386 implementation (9 steps)
- Commit `a816ed12f` — RFC-0385 review approved
- Commit `d01ef3f76` — RFC-0386 review approved

## Next steps

1. **Route RFC-0387 through the pipeline**: audit → enhance (if needed) → human architecture review → accept → plan → implement. Use `fo-idea-i-just-want-to-see-the-plan` or `fo-idea-implement` skills.
2. **Realign `docs/specs/visitor-funnel/`** to Werkstatt/Sternsystem topology (replace `apps/webgogol-com` with `systems/webgogol-com`, remove `lagebild-system` branch references, update status table in `00-overview.md`).
3. **Execute the RFC-0387 runbook** (human integrator steps, Phases 0–8): provision Supabase/Upstash/Pipedrive/UChat/Stripe, deploy Lagebild worker, open site activation mission, configure secrets, run validators, release, propagate alt → main, smoke test.
4. **Verify the deferred RFC-0386 criterion**: exercise `/api/stripe-webhook` against a live Stripe test-mode signing secret during go-live.
5. **Add `funnel.*` validators to `APPS_CHECK_AUTHOR_PIPELINE`** in `@gogol/site-kernel-checks` after pilot stability (RFC-0188 Phase 9).
6. **Enable Tier 2** in a follow-up mission after RFC-0386 live verification: add `stripe` to `inbound.sources` + `funnel.sources`, set `STRIPE_*` secrets.
