---
reviewId: REVIEW-CODE-2026-08-05-01
date: 2026-08-05
reviewer:
  skill: fo-review
  model: unknown
verdict: approved
diffRange: 5d99ff2f...HEAD
filesReviewed:
  - packages/os/site-kernel/src/runtime/registry-cache.ts
  - packages/os/site-kernel/src/runtime/registry.ts
  - packages/os/site-kernel/src/runtime/execute-command.ts
  - packages/os/site-kernel/src/runtime/execute-pipeline.ts
  - packages/os/site-kernel/src/cli/index.ts
  - packages/os/site-kernel/src/runtime.ts
  - packages/os/site-kernel/src/tests/registry-cache.test.ts
  - packages/os/site-kernel/AGENTS.md
---

# Code Review: ADR-0022 registry cache (5d99ff2f...HEAD)

### Verdict: Approved

The implementation is clean and minimal. The sole finding (redundant `setRegistryCacheEnabled(false)` calls) was fixed in commit `cbb72fd` — the early detection in `main()` is now the single handler.

### Mechanical floor

Pass — `pnpm --filter @warpgogol/site-kernel build:check` and `pnpm --filter @warpgogol/site-kernel test` both pass (260 tests, 29 files).

### Axis A — Structural correctness

No issues. The `--no-registry-cache` flag is parsed once in `consumeCommonFlags` (to strip it from argv) and handled once in `main()` early detection (to call `setRegistryCacheEnabled(false)` before any registry-building call). The `noRegistryCache` return field from `consumeCommonFlags` is currently unused by subcommand destructuring but is retained for potential future use.

### Axis B — DNA alignment

No issues. No DNA invariant is touched by this change.

### Axis C — Ecosystem fit

No issues. Package boundaries are respected. AGENTS.md is updated with the new registry cache section and `--no-registry-cache` is added to the reserved CLI flags list.

### Axis D — Forward-only compliance

No issues. No compatibility shims or legacy paths. The cache is additive — when enabled, it speeds things up; when disabled, behavior is identical to before.

### Axis E — Agent-facing clarity

No issues. New file `registry-cache.ts` carries `MODULE_CONTRACT` and `CHANGE_SUMMARY`. All modified files have updated `CHANGE_SUMMARY` entries referencing ADR-0022.

### Axis F — Pragmatism

No issues. The cache is minimal — a `Map<string, KernelRegistry>` with three small functions. No speculative generality. `buildRegistryForModule` is intentionally not cached (single-module registries are cheap and one-off).

### Axis G — Blind spots

- **Edge case — stale cache during long-running processes**: The registry cache is process-lifetime with no invalidation mechanism other than `--no-registry-cache` and `clearRegistryCache()`. If a `kernel.config.ts` file is modified during a long-running process (e.g. a watch mode), the cached registry will be stale. This is acceptable for the CLI use case (short-lived processes), but should be documented. The ADR already notes this limitation.

### Spec compliance

| Requirement from ADR-0022 | Status | Evidence |
| --- | --- | --- |
| Process-lifetime singleton cache | Done | `registry-cache.ts` module-level `Map` |
| Cache keyed by config source | Done | `workspace:<root>` and `site:<configPath>` keys |
| `--no-registry-cache` flag | Done | `cli/index.ts` `consumeCommonFlags` + early detection |
| Cache invalidated on process exit | Done | Module-level Map, no persistence |
| Avoid redundant builds in `--all` mode | Done | `loadAppRuntime` uses `getOrBuildRegistry` |

### Questions for the author

None — all findings resolved.
