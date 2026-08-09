---
rfcId: RFC-0386
planId: PLAN-RFC-0386-01
status: draft
owner: architecture
createdAt: 2026-07-14
updatedAt:
scope:
  apps: []
  packages:
    - "@gogol/integration"
    - "@gogol/integration-adapter-supabase-crm"
    - "@gogol/integration-adapter-stripe"
    - "@gogol/ui"
    - "@gogol/site-kernel-checks"
  services:
    - services/lagebild-sync-worker
  docs:
    - docs/specs/visitor-funnel/08-stripe-metadata-contract.md
---

# Implementation Plan: RFC-0386

## 1. Objectives

- [ ] Objective 1 — Extend `SyncOutboxOp` with `upsert_subscription` / `upsert_invoice` and add `syncSubscription` / `syncInvoice` to `CrmSyncTarget` — maps to acceptance criterion 1
- [ ] Objective 2 — Extend `persistLifecycleEvent` to enqueue outbox rows for subscription/invoice events — maps to acceptance criterion 2
- [ ] Objective 3 — Implement P3 deal stage moves (Active/At-risk/Renewal/Churned) and change-balance reset on paid cycles — maps to acceptance criterion 3
- [ ] Objective 4 — Add PBT test for change-balance monotonicity and non-negative clamping (DNA-41) — maps to acceptance criterion 4
- [ ] Objective 5 — Verify `/api/stripe-webhook` end-to-end against live Stripe test-mode and document the procedure in RFC-0387 runbook — maps to acceptance criterion 5
- [ ] Objective 6 — Confirm no Make.com in billing path and all validators pass — maps to acceptance criteria 6–8

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/integration/src/crm-buffer.ts` — extend `SYNC_OUTBOX_OPS` with `upsert_subscription`, `upsert_invoice`
- `packages/integration-adapter-supabase-crm/src/pipedrive-sync-target.ts` — add `syncSubscription`, `syncInvoice`, P3/P4 stage-move + change-balance logic; extend `CrmSyncTarget` interface; extend `PipedriveCredentials` with `p3StageMap` / `p4StageMap`
- `packages/integration-adapter-supabase-crm/src/adapter.ts` — `persistLifecycleEvent` enqueues `upsert_subscription` / `upsert_invoice` outbox rows alongside existing buffer writes
- `packages/integration-adapter-supabase-crm/src/worker.ts` — dispatch `upsert_subscription` / `upsert_invoice` ops to new sync handlers; pass P3/P4 stage maps to `createSyncTarget`
- `packages/integration-adapter-supabase-crm/src/tenant-registry.ts` — add `p3_stage_map` / `p4_stage_map` to `SyncTenant` and resolution in `resolveTenantSecrets`
- `packages/integration-adapter-supabase-crm/src/tests/lifecycle-sync.test.ts` — new unit tests for lifecycle sync
- `packages/integration-adapter-supabase-crm/src/tests/change-balance.pbt.test.ts` — new PBT test
- `packages/integration-adapter-stripe/src/*` — no contract change; add live-verification test fixtures if missing
- `packages/ui/src/integration-routes/stripe-webhook.api.ts` — confirm thin proxy; adjust only if live verification reveals a wiring gap
- `packages/os/site-kernel-checks/src/lagebild.ts` — `lagebild.validate` asserts presence of `subscriptions-invoices.sql` DDL

### 2.2 Configuration and data

- `services/lagebild-sync-worker/supabase/subscriptions-invoices.sql` — existing DDL, verified by `lagebild.validate`
- `SyncTenant` registry rows — `p3_stage_map` / `p4_stage_map` JSON columns added via migration

### 2.3 Documentation and specs

- `docs/specs/visitor-funnel/08-stripe-metadata-contract.md` — cross-checked as authoritative metadata resolution contract
- `packages/integration-adapter-supabase-crm/AGENTS.md` — document new sync handlers and P3/P4 stage-map config
- RFC-0387 runbook — record live Stripe verification procedure and P3/P4 stage ids

### 2.4 Validation and pipelines

- `pnpm --filter @gogol/integration run build:check`
- `pnpm --filter @gogol/integration-adapter-supabase-crm run build:check`
- `pnpm --filter @gogol/integration-adapter-stripe run build:check`
- `pnpm --filter @gogol/ui run build:check`
- `pnpm --filter @gogol/site-kernel-checks run build:check`
- `pnpm exec werkstatt run lagebild.validate --site warpgogol-com --json`
- `pnpm exec werkstatt run billing.config.validate --site warpgogol-com --json`
- `pnpm exec werkstatt run billing.secrets.validate --site warpgogol-com --json`
- `pnpm exec werkstatt run funnel.contract.validate --site warpgogol-com --json`

## 3. Step sequence

### Step 1. Extend `SyncOutboxOp` catalog

**Goal:** Add `upsert_subscription` and `upsert_invoice` to the closed `SYNC_OUTBOX_OPS` array in `@gogol/integration`.

**Agent actions:**

- Add `"upsert_subscription"` and `"upsert_invoice"` to `SYNC_OUTBOX_OPS` in `packages/integration/src/crm-buffer.ts`
- Verify `SyncOutboxOp` type union expands automatically (it's derived from the array)

**Validation:**

- `pnpm --filter @gogol/integration run build:check`

**Completion criterion:** `SYNC_OUTBOX_OPS` includes `upsert_subscription` and `upsert_invoice`; `build:check` passes for `@gogol/integration`.

**Human review:** no

---

### Step 2. Extend `CrmSyncTarget` interface and `PipedriveCredentials`

**Goal:** Add `syncSubscription` / `syncInvoice` to the `CrmSyncTarget` interface and extend `PipedriveCredentials` with P3/P4 stage maps.

**Agent actions:**

- Add `syncSubscription(task: SyncOutboxRow, buffer: CrmBufferReader): Promise<void>` and `syncInvoice(task: SyncOutboxRow, buffer: CrmBufferReader): Promise<void>` to `CrmSyncTarget` in `pipedrive-sync-target.ts`
- Add `p3StageMap?: Record<string, number>` and `p4StageMap?: Record<string, number>` to `PipedriveCredentials`
- Extend `SyncTargetCredentials` and `createSyncTarget` to accept and pass through the stage maps

**Validation:**

- `pnpm --filter @gogol/integration-adapter-supabase-crm run build:check`

**Completion criterion:** `CrmSyncTarget` interface includes the two new methods; `PipedriveCredentials` includes optional P3/P4 stage maps; `build:check` passes.

**Human review:** no

---

### Step 3. Implement `syncSubscription` and `syncInvoice` in `PipedriveSyncTarget`

**Goal:** Implement the P3/P4 deal creation, linking, stage moves, and change-balance logic.

**Agent actions:**

- `syncSubscription`: read the buffer subscription row, resolve or create the linked P3 deal for the Organization, map subscription status (`active` → P3 Active, `past_due` → P3 At-risk, `canceled` → P3 Churned) using `p3StageMap`, and update the deal stage via Pipedrive API
- `syncInvoice`: read the buffer invoice row, record it against the P3/P4 deal, and on a paid cycle invoice reset `included_changes_balance` to `included_changes_per_cycle` via `buffer.adjustChangeBalance`
- Open a P4 change deal for `change.requested` events and decrement the balance when included
- Reuse the existing `request()` method for all Pipedrive API calls
- Clamp change-balance decrement to never go below zero; log an over-decrement warning

**Validation:**

- `pnpm --filter @gogol/integration-adapter-supabase-crm run build:check`

**Completion criterion:** `syncSubscription` and `syncInvoice` are implemented with P3/P4 stage moves and change-balance reset/clamp logic; `build:check` passes.

**Human review:** no

---

### Step 4. Extend `persistLifecycleEvent` to enqueue outbox rows

**Goal:** Make `persistLifecycleEvent` enqueue `upsert_subscription` / `upsert_invoice` outbox tasks alongside the existing buffer writes.

**Agent actions:**

- After the existing `upsertSubscription` call in the subscription branch, add `client.writeOutbox(tenantId, [{ op: "upsert_subscription", payload: { subscription_id: res.id }, maxRetries: 5 }])`
- After the existing `appendInvoice` call in the invoice branch, add `client.writeOutbox(tenantId, [{ op: "upsert_invoice", payload: { invoice_id: id }, maxRetries: 5 }])`
- Ensure the outbox enqueue happens only when the Organization/Deal are resolved (after the existing `orgId` guard)

**Validation:**

- `pnpm --filter @gogol/integration-adapter-supabase-crm run build:check`

**Completion criterion:** `persistLifecycleEvent` enqueues outbox tasks for subscription and invoice events; `build:check` passes.

**Human review:** no

---

### Step 5. Extend worker dispatch and tenant registry

**Goal:** Route the new outbox ops to the new sync handlers and pass P3/P4 stage maps from the tenant registry.

**Agent actions:**

- Add `case "upsert_subscription": return target.syncSubscription(task, buffer)` and `case "upsert_invoice": return target.syncInvoice(task, buffer)` to `processTask` in `worker.ts`
- Add `p3_stage_map` / `p4_stage_map` fields to `SyncTenant` interface in `tenant-registry.ts`
- Resolve the stage maps in `resolveTenantSecrets` (read from registry JSON columns)
- Pass resolved stage maps to `createSyncTarget` in `processTenant`

**Validation:**

- `pnpm --filter @gogol/integration-adapter-supabase-crm run build:check`

**Completion criterion:** Worker dispatches `upsert_subscription` / `upsert_invoice` ops; tenant registry carries P3/P4 stage maps; `build:check` passes.

**Human review:** no

---

### Step 6. Unit tests for lifecycle sync

**Goal:** Cover deal linking, P3 stage map, invoice recording, and change-balance decrement with stubbed Pipedrive + buffer clients.

**Agent actions:**

- Create `packages/integration-adapter-supabase-crm/src/tests/lifecycle-sync.test.ts`
- Test `syncSubscription` with a new subscription (creates P3 deal) and an existing one (moves stage)
- Test `syncInvoice` with a paid cycle invoice (resets balance) and a failed invoice (moves P3 to At-risk)
- Test `syncInvoice` with a `change.requested` event (opens P4 deal, decrements balance)
- Test change-balance clamp at zero (over-decrement is clamped and logged)
- Use stubbed `CrmBufferReader` / `CrmBufferWriter` and a mock `fetchImpl` — no network calls

**Validation:**

- `pnpm --filter @gogol/integration-adapter-supabase-crm run test`

**Completion criterion:** All lifecycle-sync unit tests pass with stubbed dependencies.

**Human review:** no

---

### Step 7. PBT test for change-balance monotonicity

**Goal:** Assert change-balance decrement monotonicity and non-negative clamping per DNA-41.

**Agent actions:**

- Create `packages/integration-adapter-supabase-crm/src/tests/change-balance.pbt.test.ts`
- Property: for any starting balance `b >= 0` and decrement `d`, the result is `max(0, b - d)` and never exceeds `b`
- Property: a paid cycle invoice always resets the balance to `included_changes_per_cycle`, regardless of prior balance
- Use `fast-check` per RFC-0347 conventions

**Validation:**

- `pnpm --filter @gogol/integration-adapter-supabase-crm run test`

**Completion criterion:** PBT test passes for all generated cases; no non-negative violations.

**Human review:** no

---

### Step 8. Extend `lagebild.validate` to assert DDL presence

**Goal:** Make `lagebild.validate` assert the presence of the `subscriptions-invoices.sql` DDL that the new sync handlers depend on.

**Agent actions:**

- In `packages/os/site-kernel-checks/src/lagebild.ts`, add a check that `services/lagebild-sync-worker/supabase/subscriptions-invoices.sql` exists and is non-empty
- Report a violation if the file is missing

**Validation:**

- `pnpm --filter @gogol/site-kernel-checks run build:check`
- `pnpm exec werkstatt run lagebild.validate --site warpgogol-com --json`

**Completion criterion:** `lagebild.validate` asserts DDL presence; `build:check` passes for `@gogol/site-kernel-checks`.

**Human review:** no

---

### Step 9. Documentation updates

**Goal:** Update AGENTS.md and spec references.

**Agent actions:**

- Update `packages/integration-adapter-supabase-crm/AGENTS.md` to document the new `syncSubscription` / `syncInvoice` handlers and P3/P4 stage-map config
- Cross-check `docs/specs/visitor-funnel/08-stripe-metadata-contract.md` as the authoritative metadata resolution contract

**Validation:**

- Manual review of documentation changes

**Completion criterion:** AGENTS.md documents the new handlers; spec is verified consistent.

**Human review:** no

---

### Step 10. Full validation suite

**Goal:** Run all scoped build checks and validators.

**Agent actions:**

- Run `pnpm --filter @gogol/integration run build:check`
- Run `pnpm --filter @gogol/integration-adapter-supabase-crm run build:check`
- Run `pnpm --filter @gogol/integration-adapter-stripe run build:check`
- Run `pnpm --filter @gogol/ui run build:check`
- Run `pnpm --filter @gogol/site-kernel-checks run build:check`
- Run `pnpm exec werkstatt run lagebild.validate --site warpgogol-com --json`
- Run `pnpm exec werkstatt run billing.config.validate --site warpgogol-com --json`
- Run `pnpm exec werkstatt run billing.secrets.validate --site warpgogol-com --json`
- Run `pnpm exec werkstatt run funnel.contract.validate --site warpgogol-com --json`
- Grep for `Make.com` or `make.com` in `packages/integration-adapter-supabase-crm/`, `packages/integration-adapter-stripe/`, `packages/ui/src/integration-routes/` — confirm zero matches

**Validation:**

- All commands must pass (exit code 0)

**Completion criterion:** All scoped `build:check` passes; all validators green; no Make.com references in the billing path.

**Human review:** no

---

### Step 11. Live Stripe webhook verification (delta 6)

**Goal:** Verify `/api/stripe-webhook` end-to-end against a live Stripe test-mode signing secret.

**Agent actions:**

- This is a **human step** — the operator configures a Stripe test-mode webhook endpoint pointing to the deployed `/api/stripe-webhook` route
- Trigger test events (`checkout.session.completed`, `invoice.paid`, `customer.subscription.created`) from the Stripe dashboard
- Confirm the events are mapped, published to QStash, and persisted to the buffer
- Record the verification procedure and results in the RFC-0387 runbook

**Validation:**

- Stripe dashboard shows successful webhook deliveries (200 responses)
- Buffer tables contain the expected rows

**Completion criterion:** Live Stripe webhook events are verified end-to-end; procedure documented in RFC-0387 runbook.

**Human review:** yes — operator must configure Stripe test-mode credentials and trigger events

---

### Step 12. Verification evidence and status stamp

**Goal:** Emit verification evidence and stamp RFC-0386 as `implemented`.

**Agent actions:**

- Run `pnpm exec werkstatt run rfc.verification.emit --id RFC-0386`
- Commit the evidence file in the same commit as the status stamp
- Set `status: implemented`, `implementedAt: 2026-07-14` in the RFC frontmatter
- Commit with message: `implement: RFC-0386 stamp implemented + verification evidence`

**Validation:**

- `pnpm exec werkstatt run rfc.validate RFC-0386 --json`

**Completion criterion:** RFC-0386 is `implemented`; evidence file committed; `rfc.validate` passes.

**Human review:** no

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate RFC-0386 --json`
- `pnpm --filter @gogol/integration run build:check`
- `pnpm --filter @gogol/integration-adapter-supabase-crm run build:check`
- `pnpm --filter @gogol/integration-adapter-stripe run build:check`
- `pnpm --filter @gogol/ui run build:check`
- `pnpm --filter @gogol/site-kernel-checks run build:check`
- `pnpm exec werkstatt run lagebild.validate --site warpgogol-com --json`
- `pnpm exec werkstatt run billing.config.validate --site warpgogol-com --json`
- `pnpm exec werkstatt run billing.secrets.validate --site warpgogol-com --json`
- `pnpm exec werkstatt run funnel.contract.validate --site warpgogol-com --json`
- `pnpm exec werkstatt run rfc.verification.emit --id RFC-0386`

### 4.2 Evidence artifacts

- `docs/rfcs/verification/rfc-0386.generated.json` — verification evidence (RFC-0330)
- Commit messages referencing `RFC-0386` in the subject line (RFC-0265 commit hygiene)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Live Stripe verification requires real credentials | Step 11 uses Stripe test mode; procedure and secrets in RFC-0387 runbook; no card data stored |
| Pipedrive stage-id coupling | Step 5 adds `p3_stage_map` / `p4_stage_map` to tenant registry; runbook records stage ids; `funnel_stage` parity asserted against `VISITOR_FUNNEL_STAGES` |
| Agent misinterpretation (add persistence to webhook route or reintroduce manual branch) | Implementation notes in RFC forbid both; Step 10 grep confirms no Make.com; forward-only discipline enforced |
| Change-balance over-decrement | Step 3 clamps to zero and logs; Step 7 PBT test asserts non-negative invariant |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-1, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0386 --reason "..." --invariant "DNA-1"` instead of working around it.
- If the `SyncOutboxOp` extension conflicts with an existing consumer of `@gogol/integration`, run `rfc.supersede.propose` with `--invariant "DNA-1"` rather than adding a compatibility alias.
- If live Stripe verification (Step 11) reveals a wiring gap in the webhook route that requires more than a minimal fix, escalate to a superseding RFC rather than expanding the route's scope.
