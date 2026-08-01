---
reviewId: REVIEW-CODE-2026-08-01-01
date: 2026-08-01
reviewer:
  skill: fo-review
  model: unknown
verdict: needs-revision
diffRange: cd88bfa...HEAD
filesReviewed:
  - packages/os/site-kernel/src/types.ts
  - packages/os/site-kernel/src/cache/command-result-cache.ts
  - packages/os/site-kernel/src/runtime/execute-pipeline.ts
  - packages/os/site-kernel/src/cache/__tests__/command-result-cache.test.ts
  - packages/os/site-kernel/AGENTS.md
---

# Code Review: cd88bfa...HEAD (RFC-0637 implementation)

## Verdict: Needs revision

One finding on Axis A (Duplicated Code). The `moduleHashCacheKey` computation and `moduleHash` lookup block is duplicated verbatim between `tryCacheRead` and `tryCacheWrite`. Extracting it into a shared helper would eliminate the duplication and ensure future changes to the cache key logic only need to be made in one place.

## Mechanical floor

Pass — `pnpm --filter @warpgogol/site-kernel run build:check` exits 0; `pnpm --filter @warpgogol/site-kernel run test` passes 195/195 tests including 4 new RFC-0637 tests.

## Axis A — Structural correctness

**Finding A1 — Duplicated Code (Fowler):** The module hash cache key computation and lookup block is duplicated between `tryCacheRead` (execute-pipeline.ts:209-216) and `tryCacheWrite` (execute-pipeline.ts:253-260):

```ts
const moduleHashCacheKey = `${moduleSrcDir}:${command.modulePaths?.join(",") ?? ""}`;
let moduleHash = moduleHashCache.get(moduleHashCacheKey);
if (!moduleHash) {
  moduleHash = await computeModuleHash(moduleSrcDir, command.modulePaths);
  moduleHashCache.set(moduleHashCacheKey, moduleHash);
}
```

Both blocks are identical. This duplication was pre-existing (the `moduleSrcDir` key lookup was already duplicated), but the diff touches both instances and makes them more complex (adding `modulePaths` to the key and `computeModuleHash` call). Extracting a helper like `getOrComputeModuleHash(moduleSrcDir, command, moduleHashCache)` would centralize the cache key logic and prevent drift if the key format changes again.

## Axis B — DNA alignment

No issues. DNA-53 (Semantic fingerprint governance) is satisfied — all hashing continues to use `@warpgogol/fingerprint` (`fingerprintFile`, `fingerprintTree`, `stableJsonHash`). No new ad hoc hashing helpers introduced.

## Axis C — Ecosystem fit

No issues. No new commands, no package boundary violations, no pipeline placement changes. `AGENTS.md` updated with `modulePaths` documentation. `CHANGE_SUMMARY` blocks updated in both modified source files.

## Axis D — Forward-only compliance

No issues. The `modulePaths` field is a new optional field with a permanent fallback (full `src/` fingerprint), not a compatibility shim or dual-path. No legacy code paths maintained behind a flag.

## Axis E — Agent-facing clarity

No issues. `CHANGE_SUMMARY` blocks updated in both modified source files. JSDoc on `modulePaths` field references RFC-0637 and explains the fallback behavior. `computeModuleHash` JSDoc explains the granular hashing behavior and non-existent path skipping. Test names are descriptive and reference RFC-0637.

## Axis F — Pragmatism

No issues. `modulePaths?: string[]` is a minimal contract addition. The change extends the existing `computeModuleHash` function rather than creating a new one. Scope is tight — only the cache logic and its documentation are touched.

## Axis G — Blind spots

No issues. `moduleHashCache` deduplication is preserved — the hash is computed once per `modulePaths` combination per pipeline run. Non-existent path skipping is tested. Empty `modulePaths` array falls back to full `src/` fingerprint. The RFC documents the migration path as incremental (commands opt in).

## Spec compliance

| Requirement from RFC-0637 | Status | Evidence |
| --- | --- | --- |
| `modulePaths?: string[]` on `KernelCommandDefinition` | Done | types.ts:273 |
| `computeModuleHash` accepts optional `modulePaths` | Done | command-result-cache.ts:145-147 |
| Granular fingerprinting of listed paths only | Done | command-result-cache.ts:149-166 |
| `moduleHashCache` key includes `modulePaths` | Done | execute-pipeline.ts:211,255 |
| Backward-compatible fallback for commands without `modulePaths` | Done | command-result-cache.ts:167-176 |
| Unit test: granular hashing | Done | command-result-cache.test.ts:122-130 |
| Unit test: fallback behavior | Done | command-result-cache.test.ts:132-140 |
| Unit test: cache key isolation | Done | command-result-cache.test.ts:142-149 |
| Unit test: non-existent path skipping | Done | command-result-cache.test.ts:151-156 |
| `rfc.validate` passes | Done | `rfc.validate --id RFC-0637` → pass |

## Questions for the author

1. Should the duplicated `moduleHashCacheKey` + lookup block in `tryCacheRead`/`tryCacheWrite` be extracted into a shared helper to prevent future drift?
