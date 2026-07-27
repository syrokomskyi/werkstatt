---
reviewId: REVIEW-CODE-2026-07-10-01
date: 2026-07-10
reviewer:
  skill: wg-review
  model: unknown
verdict: approved
fixesApplied: 2026-07-10
fixCommit: 68e892d25
diffRange: uncommitted changes (working tree vs HEAD)
filesReviewed:
  - packages/share/src/integration/crm-buffer.ts
  - packages/integration-adapter-supabase-crm/src/pipedrive-sync-target.ts
  - packages/integration-adapter-supabase-crm/src/worker.ts
  - packages/integration-adapter-supabase-crm/src/client.ts
  - packages/integration-adapter-supabase-crm/src/adapter.ts
  - packages/integration-adapter-supabase-crm/src/index.ts
  - packages/integration-adapter-supabase-crm/src/tests/stage-map.test.ts
  - packages/integration-adapter-supabase-crm/src/tests/funnel-persistence.test.ts
  - packages/integration-adapter-supabase-crm/package.json
  - packages/integration-adapter-supabase-crm/AGENTS.md
  - packages/integration-adapter-supabase-crm/README.md
---

# Code Review: Supabase CRM Adapter Architectural Refactor

## Verdict: Approved (fixes applied 2026-07-10)

The diff extracts Pipedrive-specific sync logic behind a vendor-agnostic `CrmSyncTarget` port, splits the buffer client into writer/reader interfaces, and eliminates test duplication — all forward-only, with clean type safety and no backward-compat shims. All review findings and questions have been addressed in commit `68e892d25`.

### Fixes applied

| Finding | Resolution |
| --- | --- |
| A-1 (unknown stage silent fallback) | `console.warn` added in `resolvePipedriveStageUpdate` for unknown and null-mapped stages |
| G-2 (no retry/backoff on 429/5xx) | Retry with exponential backoff (3 retries, 500ms base) added in `PipedriveSyncTarget.request` |
| Q1 (JSDoc mentions InMemorySyncTarget) | Fixed — docstring no longer references non-existent test adapter |
| Q2 (createSyncTarget registry vs function) | Kept as simple function — documented that a registry is premature until multiple vendors exist |
| Q3 (silent fallback intentional?) | No longer silent — `console.warn` now logs unknown stages |

## Mechanical floor

**Pass.** All affected packages typecheck clean:

- `@warpgogol/integration-adapter-supabase-crm` — `tsc --noEmit` (main + test config)
- `@warpgogol/share` — `tsc --noEmit`
- `lagebild-sync-worker` — `tsc --noEmit`

## Axis A — Structural correctness

**1. `resolvePipedriveStageUpdate` fallback for unknown stages (minor).**

`pipedrive-sync-target.ts:79`:

```ts
const id = STAGE_MAP[stage as BufferDealStage] ?? STAGE_MAP.new;
```

If `stage` is not a valid `BufferDealStage`, the function silently falls back to `stage_id: 1` (new). This is the same behavior as the original code, so it is not a regression. However, the `as BufferDealStage` cast masks invalid input. A stricter approach would throw or log a warning for unknown stages. Low priority — the exhaustiveness guard already ensures `STAGE_MAP` covers all catalog stages.

**2. `syncDeal` does not pass stage on POST (create) path — consistent with original.**

`pipedrive-sync-target.ts:200-210`: The POST (create deal) path does not include `resolvePipedriveStageUpdate(deal.stage)`, matching the original `worker.ts` behavior. This is correct — Pipedrive assigns a default stage on creation. Not a finding, just confirmed equivalence.

**No other issues.** No `any` types, no magic numbers, no dead code, no swallowed errors. Error handling is consistent throughout — all failures throw with descriptive messages.

## Axis B — DNA alignment

**No issues.**

- **DNA-1** (monorepo boundary) — all imports flow `packages/* → packages/*` and `services/* → packages/*`. No `apps/*` imports.
- **DNA-6** (kebab-case) — new file `pipedrive-sync-target.ts` is kebab-case.
- **DNA-42** (Compass markup) — new file carries `MODULE_CONTRACT` and `CHANGE_SUMMARY` blocks. Updated files retain existing markup.
- No cosmic naming, no `.astro` components, no CSS tokens, no content layer, no routes touched — remaining DNA invariants are N/A.

## Axis C — Ecosystem fit

**No issues.**

- **Package boundaries** — `pipedrive-sync-target.ts` imports from `@warpgogol/share/integration/crm-buffer` (correct direction). `worker.ts` imports from `./pipedrive-sync-target.ts` and `./client.ts` (intra-package). `adapter.ts` imports from `@warpgogol/share/integration/crm-buffer` (correct).
- **Package exports** — `package.json` adds `./pipedrive-sync-target` export. `index.ts` re-exports `createSyncTarget`, `PipedriveSyncTarget`, `resolvePipedriveStageUpdate`, `STAGE_MAP`, and types.
- **AGENTS.md** — updated with architecture section documenting the three-layer structure and port split.
- **README.md** — updated with architecture section.
- No Compass XML changes needed — this is an internal package refactor with no repository-wide contract changes.

## Axis D — Forward-only compliance

**No issues.**

- No compatibility shims or bridges. The old `CrmBufferClient` interface is replaced by `CrmBufferWriter` + `CrmBufferReader` + `CrmBufferClient = CrmBufferWriter & CrmBufferReader` (type alias, not a separate interface). Existing code that imports `CrmBufferClient` still works because the type alias is exported.
- All Pipedrive-specific code is deleted from `worker.ts` — not maintained behind a flag.
- `fetchRow`/`patchRow` helpers are deleted — replaced by `CrmBufferReader` methods.
- `stage-map.test.ts` duplicate logic is deleted — replaced by import from `pipedrive-sync-target.ts`.

## Axis E — Agent-facing clarity

**No issues.**

- **Compass scaffolding** — `pipedrive-sync-target.ts` has `MODULE_CONTRACT` with `<purpose>`, `<non-goals>`, and `CHANGE_SUMMARY`.
- **No ungrounded assertions** — all comments reference real functions, types, and RFCs.
- **Readable names** — `CrmSyncTarget`, `PipedriveSyncTarget`, `CrmBufferWriter`, `CrmBufferReader`, `SyncTargetCredentials`, `DealPipedriveIdPatch` are self-documenting.
- **Logging** — worker.ts retains structured `[lagebild][site_name]` prefixed logs. No bare `console.log`.

## Axis F — Pragmatism

**No issues.**

- **Minimal command surface** — no new OS commands introduced.
- **Lean contracts** — `CrmSyncTarget` has 4 methods (one per outbox op). `CrmBufferReader` has 7 methods (3 reads + 3 patches + 2 outbox). No speculative generality.
- **Existing patterns** — follows the port/adapter pattern already established by `DestinationAdapter`, `GrowthAdapter`, `ChatWidgetAdapter`.
- **Scope discipline** — the diff touches only the CRM buffer package and its share-layer types. No scope creep.

## Axis G — Blind spots

**1. `patchDealPipedriveIds` sends `undefined` fields in PATCH body (minor).**

`client.ts:596-612`: The `DealPipedriveIdPatch` type has optional fields (`pipedrive_deal_id?`, `pipedrive_lead_id?`). When only one is set, `JSON.stringify` omits `undefined` values, so the PATCH body only contains the set field. This is correct behavior — Supabase PATCH only updates provided columns. No issue, just confirmed safe.

**2. No retry/backoff on Pipedrive API 429/5xx (pre-existing).**

`pipedrive-sync-target.ts:250-268`: The `request` method throws on any non-OK response. The worker's circuit breaker (`consecutiveErrors >= threshold`) handles this at the tenant level, but there is no per-request retry with backoff. This is pre-existing behavior (the original `worker.ts` had the same pattern) — not a regression. A future improvement could add exponential backoff for 429/5xx responses.

**3. `getContact`/`getDeal`/`getOrganization` return full rows (acceptable).**

The new reader methods use `select: "*"` and return the full typed row. This is simpler than projecting only needed fields and avoids maintaining a separate return type. The rows are small (contacts, deals, organizations) — no performance concern.

## Spec compliance

No formal spec available — the task was driven by the architectural review report (`arch-review-supabase-crm.html`) which identified 4 candidates. Gap table:

| Requirement from the review | Status | Evidence |
| --- | --- | --- |
| Candidate 1: Extract `CrmSyncTarget` port + `PipedriveSyncTarget` adapter | Done | `pipedrive-sync-target.ts:38-43` (port), `:99-268` (adapter), `:279-291` (factory) |
| Candidate 2: Add `getContact`/`getDeal`/`getOrganization`/`patchPipedriveIds` to port + impl | Done | `crm-buffer.ts:436-468` (port), `client.ts:513-612` (impl) |
| Candidate 3: Fix `stage-map.test.ts` to import real function | Done | `stage-map.test.ts:20` imports from `../pipedrive-sync-target.ts` |
| Candidate 4: Split `CrmBufferClient` into `CrmBufferWriter` + `CrmBufferReader` | Done | `crm-buffer.ts:347-420` (writer), `:436-468` (reader), `:471` (combined alias) |

## Questions for the author

1. **`CrmSyncTarget` JSDoc mentions `InMemorySyncTarget (tests)` — does a test fake exist?** The `pipedrive-sync-target.ts:36` docstring says "Two adapters justify this seam: PipedriveSyncTarget (production) and InMemorySyncTarget (tests)." No in-memory test adapter is in this diff. Is one planned, or should the docstring say "future tests"?
2. **Should `createSyncTarget` be extensible via a registry?** Currently it's a hardcoded `if (vendor === "pipedrive")` check. If a second vendor is added, this becomes a switch statement. Is a registry pattern (like `DESTINATION_ADAPTERS`) preferred, or is a simple function sufficient for now?
3. **`resolvePipedriveStageUpdate` silent fallback — intentional?** Unknown stages fall back to `stage_id: 1` (new). Should this log a warning instead, or is the silent fallback acceptable because the exhaustiveness guard prevents catalog drift?
