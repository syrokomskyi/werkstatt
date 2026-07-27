---
reviewId: REVIEW-CODE-2026-07-14-01
date: 2026-07-14
reviewer:
  skill: fo-review
  model: unknown
verdict: approved
diffRange: e09417f90...HEAD
filesReviewed:
  - packages/integration/src/crm-buffer.ts
  - packages/integration-adapter-supabase-crm/src/adapter.ts
  - packages/integration-adapter-supabase-crm/src/client.ts
  - packages/integration-adapter-supabase-crm/src/pipedrive-sync-target.ts
  - packages/integration-adapter-supabase-crm/src/tenant-registry.ts
  - packages/integration-adapter-supabase-crm/src/worker.ts
  - packages/integration-adapter-supabase-crm/src/tests/lifecycle-sync.test.ts
  - packages/integration-adapter-supabase-crm/src/tests/change-balance.pbt.test.ts
  - packages/integration-adapter-supabase-crm/AGENTS.md
  - packages/os/site-kernel-checks/src/lagebild.ts
  - docs/rfcs/rfc-0386-complete-stripe-lifecycle-sync-deltas-for-tier-2.md
---

# Code Review: e09417f90...HEAD (RFC-0386 implementation)

### Verdict: Approved

The diff cleanly implements RFC-0386 lifecycle sync deltas with correct port extensions, proper outbox enqueueing, tenant-specific P3/P4 stage maps, and comprehensive test coverage. All mechanical checks pass (4 scoped `build:check`, 33 tests, `rfc.validate`). Two minor findings are advisory, not blocking.

### Mechanical floor

Pass — all four impacted packages pass `build:check`:

- `@warpgogol/integration` — pass
- `@warpgogol/integration-adapter-supabase-crm` — pass
- `@warpgogol/integration-adapter-stripe` — pass
- `@warpgogol/site-kernel-checks` — pass

`rfc.validate RFC-0386` — pass (0 violations). 33 tests pass (8 lifecycle + 5 PBT + 20 existing).

### Axis A — Structural correctness

- **Duplicated code** (minor): The `syncSubscription` method has two branches (create vs. move) that construct nearly identical `body` objects with the same `title`, `org_id`, and `stage_id` logic. This is a possible Duplicated Code smell. The duplication is small (4 lines) and the branches differ in HTTP method and URL, so extracting a shared body-builder would add indirection for minimal gain. Acceptable as-is.
- **No `any` types**: All new code uses `Record<string, unknown>` and proper type assertions. No `any` leaks.
- **Error handling**: All error paths throw with descriptive messages including the entity id. No swallowed errors.
- **Exhaustive switch**: `processTask` in `worker.ts` covers all 6 `SyncOutboxOp` values with a `default` throw for unknown ops. Correct.

### Axis B — DNA alignment

- **DNA-1** (monorepo boundary): No `apps/* → apps/*` or `apps/* → services/*` imports. All imports flow `packages/* → packages/*`. Pass.
- **DNA-7** (thin routes): No changes to route files. The webhook route stays a thin proxy. Pass.
- **DNA-41** (PBT for pure functions): `change-balance.pbt.test.ts` covers monotonicity, non-negative clamping, idempotency, and zero-decrement invariance using `fast-check`. Pass.
- **DNA-42** (Compass markup): New test files carry `MODULE_CONTRACT` and `CHANGE_SUMMARY`. Existing files have updated `CHANGE_SUMMARY` entries. Pass.

### Axis C — Ecosystem fit

- **Package boundaries**: Imports flow correctly. `tenant-registry.ts` imports types from `pipedrive-sync-target.ts` (same package). `pipedrive-sync-target.ts` imports from `@warpgogol/integration`. Pass.
- **AGENTS.md updates**: `packages/integration-adapter-supabase-crm/AGENTS.md` updated with lifecycle sync documentation, new `CrmBufferReader` methods, and P3/P4 stage-map config. Pass.
- **Command lifecycle**: `lagebild.validate` command updated from stub to actual DDL check. No new commands added. Pass.

### Axis D — Forward-only compliance

- No compatibility shims or dual-paths. The `SYNC_OUTBOX_OPS` array is extended directly — no fallback for old op names.
- `lagebild.validate` replaces the stub entirely — no `--legacy` flag or conditional skip.
- `CrmSyncTarget` interface is extended directly — no `CrmSyncTargetV2` or optional method fallback.
- Pass.

### Axis E — Agent-facing clarity

- **Compass scaffolding**: New test files (`lifecycle-sync.test.ts`, `change-balance.pbt.test.ts`) carry `MODULE_CONTRACT` with `<purpose>` and `<non-goals>`, and `CHANGE_SUMMARY` with RFC-0386 items. Pass.
- **No ungrounded assertions**: All comments reference real functions, types, and RFC sections. The `pipedrive_deal_id` field is properly documented on `BufferSubscription`.
- **Readable**: Method names (`syncSubscription`, `syncInvoice`, `resolveP3StageId`) clearly reveal intent. Variable names (`sub`, `inv`, `orgId`, `stageId`) are conventional and clear.
- Pass.

### Axis F — Pragmatism

- **Lean contracts**: `P3StageMap` and `P4StageMap` are minimal — `Partial<Record<...>>` and a small interface with 3 optional fields. No speculative generality.
- **Existing patterns**: New `getSubscription`/`getInvoice`/`patchSubscriptionPipedriveDealId` methods follow the exact same pattern as existing `getDeal`/`getOrganization`/`patchDealPipedriveIds`. No new patterns invented.
- **Scope discipline**: The diff touches only the files necessary for lifecycle sync. No scope creep.
- Pass.

### Axis G — Blind spots

- **Edge case — missing stage map**: When `p3StageMap` is empty or doesn't have an entry for the subscription's status, `resolveP3StageId` returns `undefined` and the deal is created/moved without a `stage_id`. This is documented in the method comment ("the deal stays put"). Acceptable — Pipedrive will place the deal in the pipeline's default stage.
- **Edge case — subscription without organization**: `syncSubscription` handles `sub.organization_id` being absent by setting `orgId = null` and not passing `org_id` to Pipedrive. Correct.
- **Edge case — invoice without subscription**: `syncInvoice` handles `inv.subscription_id` being absent by skipping balance reset and note recording. The P4 change-deal path is also skipped (requires `sub?.pipedrive_deal_id`). Correct — a change invoice without a linked subscription is an anomaly that should be retried, not silently processed.
- **Security**: No card data touched. Stripe secrets are not accessed in this diff (the webhook route was already verified in prior work). No PII leaks.
- Pass.

### Spec compliance

| Requirement from RFC-0386 | Status | Evidence |
| --- | --- | --- |
| Extend `SYNC_OUTBOX_OPS` with `upsert_subscription`, `upsert_invoice` | Done | `crm-buffer.ts:302-304` |
| Add `syncSubscription`, `syncInvoice` to `CrmSyncTarget` | Done | `pipedrive-sync-target.ts:51-53` |
| Implement P3/P4 stage-move + change-balance logic | Done | `pipedrive-sync-target.ts:307-408` |
| `persistLifecycleEvent` enqueues outbox rows | Done | `adapter.ts:234-237, 264-267` |
| Worker dispatches new ops | Done | `worker.ts:171-174` |
| `p3_stage_map`/`p4_stage_map` in tenant registry | Done | `tenant-registry.ts:31-34, 53-56` |
| Unit tests for lifecycle sync | Done | `lifecycle-sync.test.ts` (8 tests) |
| PBT for change-balance monotonicity (DNA-41) | Done | `change-balance.pbt.test.ts` (5 tests) |
| `lagebild.validate` asserts DDL presence | Done | `lagebild.ts:63-76` |
| Live Stripe webhook verification | Deferred | Operator will complete in RFC-0387 runbook |

### Questions for the author

1. The `syncInvoice` P4 change-deal path creates a new Pipedrive deal on every change invoice without dedup. Is this intentional (each change invoice = a separate P4 deal), or should it check for an existing open P4 deal first?
2. The `lagebild.validate` check only verifies file existence and non-zero size. Should it also parse the SQL to assert the `buffer_subscriptions` and `buffer_invoices` table definitions are present?
3. The `renderDevVarsExample` in `lagebild.ts` still references `TENANT_ID` (line 51) instead of `SUPABASE_BUFFER_TENANT_ID`. This is a pre-existing issue from RFC-0385, but should it be fixed in this change since the file was already modified?
