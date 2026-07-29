---
reviewId: REVIEW-CODE-2026-07-29-01
date: 2026-07-29
reviewer:
  skill: fo-review
  model: unknown
verdict: needs-revision
diffRange: c2dcc3e...HEAD
filesReviewed:
  - packages/os/site-kernel-handoff/src/mission/mission-materialization-commands.ts
  - packages/os/site-kernel-handoff/src/release/release-commands.ts
  - packages/os/site-kernel-handoff/AGENTS.md
  - docs/adrs/adr-0008-enforce-three-phase-build-pipeline-in-distribution-producing-commands.md
---

# Code Review: c2dcc3e...HEAD

### Verdict: Needs revision

The fix correctly addresses the root cause (bypassed `build.post` pipeline) and is forward-only. However, the pipeline execution pattern is duplicated 5 times across the diff, and the build-input-hash computation is duplicated between `mission.build` and `release.prepare`. Both should be extracted into shared helpers.

### Mechanical floor

Pass — `tsc --noEmit` and 354 tests pass for `@warpgogol/site-kernel-handoff`.

### Axis A — Structural correctness

- **Duplicated Code (Fowler)** — The pipeline execution pattern (`executeKernelPipeline` → `Array.isArray` unwrap → `.ok` check → filter failed steps → throw) is copy-pasted 5 times in this diff:
  - `mission-materialization-commands.ts:406-423` (mission.build build.prepare)
  - `mission-materialization-commands.ts:442-461` (mission.build build.post)
  - `mission-materialization-commands.ts:276-296` (mission.validate build.post)
  - `release-commands.ts:239-257` (release.prepare build.prepare)
  - `release-commands.ts:271-289` (release.prepare build.post)

  Each instance is ~15 lines of identical logic. Extract a helper like `runPipelineOrThrow(workspaceRoot, pipelineName, siteName, label)` that handles the array unwrap, `.ok` check, failed-step formatting, and error wrapping. This would reduce each call site to 2-3 lines.

- **Duplicated Code (Fowler)** — The build-input-hash computation (`resolveCurrentEcosystem` → `resolvePlatformSemanticHash` → `fingerprintTree(contentDir)` → `byteHash(...)`) is duplicated between `mission-materialization-commands.ts:477-488` (new) and `release-commands.ts:203-215` (existing). Extract a shared `computeBuildInputHash(workspaceRoot, workpieceDir)` helper.

- **Primitive Obsession (Fowler)** — The `Array.isArray(result) ? result[0] : result` unwrap pattern is repeated in every pipeline call. This suggests the return type of `executeKernelPipeline` is ambiguous (sometimes array, sometimes single). If the API always returns a single report, the unwrap is unnecessary; if it can return an array, the consumer should not silently pick `[0]`.

### Axis B — DNA alignment

No issues. DNA-53 (all hashing via `@warpgogol/fingerprint`) is satisfied — `byteHash` and `fingerprintTree` are both imported from `@warpgogol/fingerprint`.

### Axis C — Ecosystem fit

No issues. Package boundaries are correct (`@warpgogol/site-kernel`, `@warpgogol/fingerprint`). Pipeline placement is correct (`build.prepare`, `build.post` via `executeKernelPipeline`). AGENTS.md is updated with the three-phase build pipeline section.

### Axis D — Forward-only compliance

No issues. The old `execSync("pnpm exec astro build")` direct calls are replaced, not kept alongside. No compatibility shims or dual paths.

### Axis E — Agent-facing clarity

No issues. Comments reference RFC-0356 and explain why `build.post` is non-negotiable. Log messages are structured and distinguishable per phase. No new source files — no Compass scaffolding needed.

### Axis F — Pragmatism

- **Scope discipline** — The fix touches only what's necessary: the three commands that were bypassing the pipeline. No scope creep.
- **Existing patterns** — `executeKernelPipeline` was already used in `mission.validate` for `build.prepare` and `build.check`. The fix extends this existing pattern to the missing commands. However, the pattern itself should be DRYed (see Axis A).

### Axis G — Blind spots

- **Performance** — `build.prepare` and `build.post` add time to every `mission.build` and `release.prepare` fresh build. This is acknowledged in ADR-0008's Consequences section. Acceptable.
- **Edge cases** — If `executeKernelPipeline` returns an empty array, `result[0]` is `undefined`, and accessing `.ok` throws a `TypeError` rather than a descriptive error. Low probability given the API contract, but the helper extraction (Axis A) would centralize this guard.

### Spec compliance

No spec available — skipped. The fix addresses a reported bug (long dashes surviving deployment) and is documented in ADR-0008.

### Questions for the author

1. Why does `executeKernelPipeline` return a type that needs `Array.isArray` unwrapping? Is the array case real, or is the unwrap defensive cargo-culting?
2. The build-input-hash computation in `mission.build` duplicates the one in `release.prepare` — was a shared helper considered?
