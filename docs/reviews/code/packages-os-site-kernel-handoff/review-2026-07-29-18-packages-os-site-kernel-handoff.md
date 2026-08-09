---
reviewId: REVIEW-CODE-2026-07-29-01
date: 2026-07-29
reviewer:
  skill: fo-review
  model: unknown
verdict: needs-revision
diffRange: 8afc858...HEAD
filesReviewed:
  - packages/os/site-kernel-handoff/src/bordbuch/bordbuch-io.ts
  - packages/os/site-kernel-handoff/src/bordbuch/bordbuch-repair.ts
  - packages/os/site-kernel-handoff/src/bordbuch/bordbuch-repair.test.ts
  - packages/os/site-kernel-handoff/src/bordbuch/bordbuch.module.ts
  - packages/os/site-kernel-handoff/src/bordbuch/index.ts
  - packages/os/site-kernel-handoff/AGENTS.md
  - docs/rfcs/rfc-0583-add-bordbuch-repair-command-for-hash-chain-restoration-and-missing-mission-open-insertion.md
---

# Code Review: 8afc858...HEAD (RFC-0583 bordbuch.repair implementation)

### Verdict: Needs revision

The implementation is functionally correct — all tests pass, typecheck passes, and the command is properly registered. Two findings require attention: a pre-existing DNA-53 violation that the diff extends by exporting, and a missing `BordbuchRepairPlan` type export gap.

### Mechanical floor

Pass — `pnpm --filter @warpgogol/site-kernel-handoff build:check` and `pnpm --filter @warpgogol/site-kernel-handoff test` (338 tests) both pass. `rfc.validate RFC-0583` passes.

### Axis A — Structural correctness

1. **`BordbuchRepairPlan` interface is exported but never constructed.** The `BordbuchRepairPlan` type is declared and exported from `bordbuch-repair.ts` and `index.ts`, but the handler never creates or returns a `BordbuchRepairPlan` object. It is dead code — the dry-run path returns `orphans` inside `BordbuchRepairResult` instead. Either remove the unused type or use it in the dry-run path.

### Axis B — DNA alignment

1. **DNA-53 (semantic fingerprint governance) — pre-existing violation extended.** `computeEntryHash` in `bordbuch-io.ts:70-72` uses `crypto.createHash("sha256")` directly instead of `@warpgogol/fingerprint`. This predates this diff (RFC-0355), but by exporting it for reuse by `bordbuch-repair.ts`, the diff extends the surface area of the violation. The `fingerprint.usage.lint` check does not catch it (likely because bordbuch hashing predates the lint rule). The repair handler itself calls `computeEntryHash` (not `createHash` directly), so no new direct violation is introduced — but the exported function perpetuates the pattern. Consider migrating `computeEntryHash` to use `@warpgogol/fingerprint` in a follow-up.

### Axis C — Ecosystem fit

No issues. Command registration follows the existing `bordbuch.module.ts` pattern. Barrel exports follow the existing `index.ts` pattern. AGENTS.md updated with the new section. Generated artifacts regenerated.

### Axis D — Forward-only compliance

No issues. No compatibility shims or legacy paths. The RFC amends RFC-0355's append-only invariant directly.

### Axis E — Agent-facing clarity

No issues. `MODULE_CONTRACT` and `CHANGE_SUMMARY` scaffolding present on `bordbuch-repair.ts`. Variable names are clear. Lock scopes documented in AGENTS.md.

### Axis F — Pragmatism

No issues. The command earns its existence — it performs a specialized repair operation that no existing command covers. The handler reuses existing `readBordbuch`, `validateBordbuch`, `computeEntryHash`, `atomicWriteFile`, and lock primitives rather than reimplementing them.

### Axis G — Blind spots

1. **Concurrent execution edge case.** The handler acquires both `system:<id>` and `bordbuch:<id>` locks, but `bordbuch.append` (in `bordbuch-append.ts`) may only acquire `system:<id>`. If the lock scopes don't match, concurrent append + repair could race. Verify that `bordbuch.append` also acquires `bordbuch:<id>` or that the `system:<id>` lock is sufficient to prevent concurrent append.

### Spec compliance

| Requirement from RFC-0583                   | Status | Evidence                            |
| ------------------------------------------- | ------ | ----------------------------------- |
| Command registered in bordbuch.module.ts    | Done   | `bordbuch.module.ts:108-129`        |
| runBordbuchRepair exported from index.ts    | Done   | `index.ts:19-24`                    |
| computeEntryHash exported                   | Done   | `bordbuch-io.ts:70`                 |
| Detects orphan-mission-close                | Done   | `bordbuch-repair.ts:120`            |
| Auto-derives metadata                       | Done   | `bordbuch-repair.ts:134-137`        |
| --metadata overrides                        | Done   | `bordbuch-repair.ts:130-133`        |
| Recomputes hash chain and event-id          | Done   | `bordbuch-repair.ts:183-195`        |
| bordbuch.validate passes after repair       | Done   | `bordbuch-repair.ts:207`            |
| --dry-run shows planned repairs             | Done   | `bordbuch-repair.ts:218-230`        |
| Post-repair validate fails if still invalid | Done   | `bordbuch-repair.ts:209-216`        |
| Unit test covers repair scenario            | Done   | `bordbuch-repair.test.ts` (6 tests) |
| AGENTS.md updated                           | Done   | `AGENTS.md:90-99`                   |

### Questions for the author

1. Should `BordbuchRepairPlan` be used in the dry-run path (returned as a structured plan), or should it be removed as dead code?
2. Does `bordbuch.append` acquire the `bordbuch:<id>` lock scope, or only `system:<id>`? If the latter, the repair handler's `bordbuch:<id>` lock won't prevent concurrent appends.
3. Should `computeEntryHash` be migrated to `@warpgogol/fingerprint` as part of this RFC, or deferred to a follow-up cleanup RFC?
