---
reviewId: REVIEW-CODE-2026-07-10-01
date: 2026-07-10
reviewer:
  skill: wg-review
  model: unknown
verdict: approved
diffRange: HEAD (uncommitted changes on ecosystem-evolution)
filesReviewed:
  - packages/integration-adapter-stripe/src/mapping.ts
  - packages/integration-adapter-stripe/src/index.ts
  - packages/integration-adapter-stripe/src/billing.ts (deleted)
  - packages/integration-adapter-stripe/package.json
  - packages/integration-adapter-stripe/AGENTS.md
  - packages/integration-adapter-stripe/README.md
  - packages/integration-adapter-stripe/src/tests/stripe-adapter.test.ts
  - packages/ui/src/integration-routes/stripe-webhook.api.ts
  - packages/integration-adapter-supabase-crm/src/pipedrive-sync-target.ts
  - packages/integration-adapter-supabase-crm/src/worker.ts
  - packages/integration-adapter-supabase-crm/src/index.ts
  - packages/integration-adapter-supabase-crm/src/adapter.ts
  - packages/integration-adapter-supabase-crm/package.json
  - packages/share/src/integration/crm-buffer.ts
  - packages/nebula/src/collect.ts
  - packages/nebula/src/compute.ts
  - packages/nebula/src/index.ts
  - packages/nebula/package.json
  - packages/passport/src/emit.ts
  - packages/os/site-kernel-checks/src/passport.ts
---

# Code Review: HEAD (uncommitted) — Stripe adapter refactor + CRM buffer split + Nebula collect extraction

### Verdict: Approved

The diff removes a phantom billing client, adds a deep verify-and-map wrapper with runtime validation and subscription metadata resolution, extracts a CrmSyncTarget port from a 400-line worker, and centralizes Nebula input collection. All changes are forward-only, mechanically clean (all affected packages pass `tsc --noEmit`), and architecturally sound. Three minor findings on axes A, E, and G are noted but do not block approval.

### Mechanical floor

Pass — all affected packages pass `tsc --noEmit`:

- `@warpgogol/integration-adapter-stripe` build:check + test:check
- `@warpgogol/ui` build:check
- `@warpgogol/integration-adapter-supabase-crm` build:check
- `@warpgogol/nebula` build:check
- `@warpgogol/passport` build:check
- `@warpgogol/share` build:check

### Axis A — Structural correctness

- **`fetchSubscriptionMetadata` silent catch** (`mapping.ts:280`) — the `catch` block swallows all errors and returns `null`. This is intentional (graceful degradation when Stripe API is unreachable), but a bare `catch` with no logging means a network outage or auth failure is invisible. Consider adding a structured `console.warn` with the subscription id and error message, consistent with the worker's error logging pattern.

- **`resolvePipedriveStageUpdate` fallback to `STAGE_MAP.new`** (`pipedrive-sync-target.ts:79`) — when `stage` is not a known `BufferDealStage`, the function falls back to `STAGE_MAP.new` (stage_id 1). This is a silent default that could mask a data corruption bug. The `stage` parameter is typed as `string` (not `BufferDealStage`), so the fallback is reachable. Consider either narrowing the parameter type to `BufferDealStage` or throwing on unknown stages.

- **`createSyncTarget` throws for unsupported vendors** (`pipedrive-sync-target.ts:290`) — the factory throws synchronously, which means a tenant with a misconfigured `destination_vendor` will crash the worker's `processTenant` before any outbox processing. This is caught by the per-tenant try/catch in the worker, so it is safe, but the error message could include the tenant id for debugging.

### Axis B — DNA alignment

No issues.

- **DNA-1** (monorepo boundary) — all imports flow `packages/* → packages/*` and `packages/ui → packages/integration-adapter-stripe`. No `apps/* → apps/*` or `apps/* → services/*` imports.
- **DNA-7** (thin routes) — the webhook route in `stripe-webhook.api.ts` is a thin orchestrator: read body → call `verifyAndMapStripeEvent` → publish to QStash. No inline logic, no hardcoded copy.
- **DNA-42** (Compass markup) — all new source files (`pipedrive-sync-target.ts`, `collect.ts`) carry `MODULE_CONTRACT` and `CHANGE_SUMMARY`. Updated files have updated `CHANGE_SUMMARY` entries.

### Axis C — Ecosystem fit

No issues.

- **Package boundaries** — the `CrmBufferWriter` / `CrmBufferReader` split in `crm-buffer.ts` correctly separates the adapter-side write port from the worker-side read/patch port. `CrmBufferClient = CrmBufferWriter & CrmBufferReader` preserves the combined interface for the Supabase client.
- **AGENTS.md updates** — `integration-adapter-stripe/AGENTS.md` and `README.md` are updated to reflect billing removal and the new `verifyAndMapStripeEvent` wrapper.
- **Export surface** — `package.json` exports are clean: `./signature`, `./mapping`, `.` (barrel). No `./billing` subpath. The `./pipedrive-sync-target` subpath is added to `integration-adapter-supabase-crm/package.json`.
- **Nebula export surface** — `./collect` subpath added to `nebula/package.json`; `compute.ts` exports `derivePerformanceScore`, `deriveAccessibilityScore`, and `toPassportScores` for direct testing and reuse.

### Axis D — Forward-only compliance

No issues.

- The billing client is **deleted**, not deprecated behind a flag. No compatibility shim.
- `StripeEventLike` type cast in the webhook route is **replaced** by `StripeEventSchema.safeParse` — no dual path.
- The worker's inline Pipedrive sync logic is **extracted** to `pipedrive-sync-target.ts` — the old code is removed from `worker.ts`, not maintained in parallel.
- `createStubNebulaInputs` usage in `passport.ts` and `emit.ts` is **replaced** by `collectNebulaInputs` — no fallback to the stub path.

### Axis E — Agent-facing clarity

- **`verifyAndMapStripeEvent` JSDoc** (`mapping.ts:286-292`) — the docstring clearly explains the full pipeline and the `needsSubscriptionLookup` resolution. Good.

- **`collectNebulaInputs` silent JSON errors** (`collect.ts:103`) — the `readJsonSafe` helper swallows JSON parse errors with a bare `catch` and falls back to stub values. The JSDoc says "Malformed files are logged and ignored" but the implementation does not log. Either add the promised `console.warn` or update the JSDoc to say "silently ignored."

- **`pipedrive-sync-target.ts` exhaustiveness guard** (`pipedrive-sync-target.ts:66-67`) — `_stageMapExhaustive` is a compile-time guard that ensures `STAGE_MAP` covers all `BufferDealStage` values. The `void _stageMapExhaustive` suppression is a common pattern but could benefit from a comment explaining why the variable exists for agents reading the file.

### Axis F — Pragmatism

No issues.

- **`CrmSyncTarget` port** — justified by two adapters (PipedriveSyncTarget production + test doubles). The worker is now a 170-line thin orchestrator vs. the previous 400+ line monolith.
- **`collectNebulaInputs` extraction** — centralizes 4 artifact reads that were previously duplicated between `passport.ts` and `emit.ts`. Lean.
- **`verifyAndMapStripeEvent`** — folds 4 steps (verify + parse + validate + map) into one call, eliminating the unvalidated cast in the route. Minimal and necessary.
- **`toPassportScores`** — eliminates manual field mapping in `emit.ts`. Small, focused helper.

### Axis G — Blind spots

- **`fetchSubscriptionMetadata` exposes `stripeSecretKey` to Stripe API** (`mapping.ts:274-275`) — the secret key is sent as a Bearer token to `https://api.stripe.com`. This is the correct usage, but the function does not validate that `secretKey` starts with `sk_` or `rk_` before making the call. A misconfigured env var (e.g. a webhook secret accidentally used) would result in a 401 from Stripe, caught by the bare `catch`, and silently swallowed. Consider adding a prefix check or at least logging the HTTP status on failure.

- **`collectNebulaInputs` shallow merge** (`collect.ts:102`) — `{ ...fallback, ...parsed }` does a shallow merge. If an artifact file has a nested structure (e.g. `lighthouse.routes`), partial data in the artifact will replace the entire nested object from the fallback. This is documented as "shallow field extraction" in the non-goals, so it is acceptable, but agents should be aware.

- **No tests for `pipedrive-sync-target.ts`** — the new `CrmSyncTarget` port and `PipedriveSyncTarget` adapter have no direct unit tests. The existing `stage-map.test.ts` covers `STAGE_MAP` exhaustiveness and `resolvePipedriveStageUpdate`, but the sync methods (`syncContact`, `syncDeal`, etc.) are untested. The test signal in `package.json` should be checked.

### Spec compliance

No spec available — spec compliance skipped. The changes originate from an architecture review (HTML report) that identified 5 candidates. All 5 are addressed:

| Candidate | Status | Evidence |
| --- | --- | --- |
| 1: Phantom billing client | Done | `billing.ts` deleted, exports removed from `index.ts` and `package.json` |
| 2: `__formEncode` leak | Done | Eliminated with `billing.ts` deletion |
| 3: `needsSubscriptionLookup` unhandled | Done | `verifyAndMapStripeEvent` fetches subscription metadata when `stripeSecretKey` is provided |
| 4: `StripeEventLike` unvalidated cast | Done | `StripeEventSchema` (zod) + `safeParse` in `verifyAndMapStripeEvent` |
| 5: Two seams in one package | Done | Outbound billing removed; only inbound webhook source remains |

### Questions for the author

1. **`fetchSubscriptionMetadata` error visibility** — if the Stripe API returns 401 (wrong secret key) or 403 (insufficient permissions), the event is published to QStash with `needsSubscriptionLookup` still set. The downstream CRM buffer has no handler for this flag. Is this intentional (the buffer will attribute by Stripe Customer id instead), or should the wrapper retry or surface the failure?

2. **`resolvePipedriveStageUpdate` silent fallback** — when an unknown stage string reaches this function, it silently maps to `new` (stage_id 1). Should this throw instead, since an unknown stage indicates a data integrity issue in the buffer?

3. **`collectNebulaInputs` missing log** — the JSDoc promises "Malformed files are logged and ignored" but `readJsonSafe` does not log. Should the log be added, or should the JSDoc be corrected?
