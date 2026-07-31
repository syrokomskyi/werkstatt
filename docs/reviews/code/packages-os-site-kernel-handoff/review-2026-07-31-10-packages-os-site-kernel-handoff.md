---
reviewId: REVIEW-CODE-2026-07-31-10
date: 2026-07-31
reviewer:
  skill: fo-review
  model: unknown
verdict: needs-revision
diffRange: 5705793...HEAD
filesReviewed:
  - packages/os/site-kernel-checks/src/index.ts
  - packages/os/site-kernel-handoff/src/mission/mission-materialize.ts
  - packages/os/site-kernel-handoff/src/tests/rfc-0620-workspace-absolute-generated-files-filter.test.ts
  - packages/os/site-kernel-handoff/src/tests/mission-materialize-baseline.test.ts
  - packages/os/site-kernel-handoff/src/tests/mission-materialize-preflight-skip.test.ts
  - packages/os/site-kernel-handoff/src/tests/mission-materialize-force-cache-bypass.test.ts
---

# Code Review: 5705793...HEAD (RFC-0620 implementation)

### Verdict: Needs revision

The implementation correctly replaces the hardcoded bordbuch removal with an ownership-map-driven filter. However, there are two findings: an unused parameter and a test duplication issue.

### Mechanical floor

Pass — `pnpm --filter @warpgogol/site-kernel-checks run build:check` and `pnpm --filter @warpgogol/site-kernel-handoff run build:check` both pass. All 426 tests pass. `rfc.validate --id RFC-0620` passes.

### Axis A — Structural correctness

1. **Unused parameter `systemId` in `getWorkspaceAbsoluteGeneratedPaths`.** The function signature accepts `systemId: string` but never uses it — the prefix is hardcoded as `"systems/{system}/"` (a template placeholder), not interpolated with the system ID. The parameter should be removed or the function should use it. (`packages/os/site-kernel-handoff/src/mission/mission-materialize.ts:133`)

### Axis B — DNA alignment

No issues. DNA-47 (Materialization) is respected — the filter operates during the data-path copy stage, before pipeline execution. The Werkstück is still materialized from the pinned data bundle; only generated artifacts within that bundle are excluded.

### Axis C — Ecosystem fit

No issues. The import flow is correct: `site-kernel-handoff` imports from `site-kernel-checks` (allowed direction). The re-export from `site-kernel-checks/src/index.ts` follows the existing pattern of re-exporting from the main entry point.

### Axis D — Forward-only compliance

No issues. The hardcoded bordbuch removal is fully deleted and replaced by the ownership-map-driven filter. No dual paths, no compatibility shims.

### Axis E — Agent-facing clarity

No issues. New source file (`rfc-0620-workspace-absolute-generated-files-filter.test.ts`) carries `MODULE_CONTRACT` and `CHANGE_SUMMARY` scaffolding. Code comments reference RFC-0620. The `CHANGE_SUMMARY` in `mission-materialize.ts` is updated with the RFC-0620 entry.

### Axis F — Pragmatism

2. **Test setup duplication.** The `setupWorkspaceWithGeneratedFiles` function and the test body (input/context construction, `runMissionMaterialize` call, workpiece path assembly) are duplicated across all 4 tests. Tests 2 and 4 are functionally identical (both assert `test-generated.json` is absent). Consider extracting a shared `materializeAndReturnWorkpiecePublic` helper or using `beforeEach` to reduce duplication. (`packages/os/site-kernel-handoff/src/tests/rfc-0620-workspace-absolute-generated-files-filter.test.ts:121-235`)

### Axis G — Blind spots

No issues. The filter handles the git clone case (post-clone removal). Empty state (no workspace-absolute entries) is handled — `getWorkspaceAbsoluteGeneratedPaths` returns an empty set, `copyDir` receives `undefined` for `skipPaths`, and the post-clone removal loop iterates zero times. Performance is O(1) per file against a small set.

### Spec compliance

| Requirement from RFC-0620 | Status | Evidence |
| --- | --- | --- |
| Filter workspace-absolute generated files from data-path copy | Done | `mission-materialize.ts:777-823` |
| Use `GENERATOR_OWNERSHIP_MAP` as filter source | Done | `mission-materialize.ts:133-143` |
| Replace hardcoded bordbuch removal | Done | Old code deleted, `mission-materialize.ts:850-862` removed |
| Re-export `GENERATOR_OWNERSHIP_MAP` from `site-kernel-checks` | Done | `site-kernel-checks/src/index.ts:167-169` |
| Regression test | Done | `rfc-0620-workspace-absolute-generated-files-filter.test.ts` |
| `rfc.validate` passes | Done | Exit code 0 |

### Questions for the author

1. Why does `getWorkspaceAbsoluteGeneratedPaths` accept `systemId` if it uses the `{system}` template placeholder instead? Should the parameter be removed, or should the function resolve the placeholder against the actual system ID?
2. Tests 2 and 4 are identical — both assert `test-generated.json` is absent. Is the intent to have test 4 also assert bordbuch files are absent (which it does on line 234), making it a superset of test 2? If so, test 2 is redundant.
