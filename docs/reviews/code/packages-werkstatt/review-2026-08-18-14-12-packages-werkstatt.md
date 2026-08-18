---
reviewId: REVIEW-CODE-2026-08-18-01
date: 2026-08-18
reviewer:
  skill: fo-review
  model: unknown
verdict: needs-revision
diffRange: 150157e1...HEAD
filesReviewed:
  - packages/werkstatt/package.json
  - packages/werkstatt/src/nachweis/nachweis-lighthouse-measure.ts
  - packages/werkstatt/src/nachweis/nachweis.module.ts
  - packages/werkstatt/src/nachweis/index.ts
  - packages/werkstatt/src/tests-handoff/nachweis-lighthouse-measure.test.ts
  - packages/werkstatt/AGENTS.md
  - docs/rfcs/rfc-0874-add-reproducible-google-lighthouse-assessment-adapter-for-nachweisregister.md
---

# Code Review: 150157e1...HEAD (RFC-0874 Lighthouse adapter)

### Verdict: Needs revision

Implementation is functionally correct — 15 tests pass, typecheck passes, RFC acceptance criteria are met. However, there are two findings: a duplicated `flagString`/`flagBool`/`flagInt` helper pattern that should use the shared kernel flag utilities, and a `Promise.race` timer cleanup issue in the Lighthouse subprocess runner.

### Mechanical floor

Pass — `pnpm --filter @warpgogol/werkstatt build` and `vitest run` (2267 tests) pass with zero errors.

### Axis A — Structural correctness

1. **Duplicated Code (flag helpers)** — `flagString`, `flagBool`, `flagInt` are defined locally in `nachweis-lighthouse-measure.ts:107-122`. The same pattern exists in `nachweis-assessment-ingest.ts` and likely other nachweis handlers. These should be extracted to a shared `nachweis-flag-helpers.ts` utility or imported from the kernel if a shared helper already exists.

2. **Promise.race timer cleanup** — `runLighthouseProcess` (line ~340) uses `setTimeout` for subprocess timeout. The timer is cleared on `close` and `error` events, but if the child process never emits either event (e.g. the process is killed externally), the timer leaks. Per `packages/AGENTS.md` §Promise.race timer cleanup, the timer should be cleared in a `finally` block. However, this specific code uses event-based cleanup (not `Promise.race`), and the `close` event is reliable for child processes — so this is a minor concern, not a hard violation.

### Axis B — DNA alignment

No issues. The adapter respects DNA-64 (stack-agnostic) by using `npx lighthouse` CLI subprocess instead of a static `import("lighthouse")`. No `@warpgogol/*` static imports from stack plugins.

### Axis C — Ecosystem fit

No issues. Command is registered in `nachweis.module.ts` with correct scope, flags, and lazy-loaded handler. Barrel exports updated in `index.ts`. AGENTS.md updated with dedicated section.

### Axis D — Forward-only compliance

No issues. No compatibility shims, no dual-paths, no legacy code maintained behind flags.

### Axis E — Agent-facing clarity

No issues. `MODULE_CONTRACT` and `CHANGE_SUMMARY` scaffolding present. Function names are descriptive. Log messages carry context (`[nachweis.measure.lighthouse]` prefix).

### Axis F — Pragmatism

1. **Duplicated flag helpers** (same as Axis A-1) — the `flagString`/`flagBool`/`flagInt` pattern is duplicated across nachweis handlers. This is a pragmatism concern: the existing pattern should be reused, not reinvented.

2. **`flagInt` handles `number` type** — `flagInt` checks `typeof v === "number"` but `KernelFlagValue` is `boolean | string | string[]` — the `number` branch is dead code. This is harmless but technically unreachable.

### Axis G — Blind spots

1. **Subprocess timeout** — `timeoutPerRunMs` is hardcoded to 120_000 (2 minutes). For large sites, Lighthouse can take 60+ seconds per run, and 5 sequential runs at 2 minutes each means 10 minutes total. This is documented in the RFC but not configurable via CLI flag. Consider adding a `--timeout-per-run` flag.

2. **Temp directory cleanup** — `workDir` is created via `mkdtemp` but never cleaned up after successful runs. The temp directory contains LHR files and the methodology artifact. After ingest, these are uploaded to R2 and the local copies are unnecessary. Consider adding `await fs.rm(workDir, { recursive: true, force: true })` in a `finally` block.

### Spec compliance

| Requirement from RFC-0874 | Status | Evidence |
| --- | --- | --- |
| Pin Lighthouse 13.4.1 | Done | `packages/werkstatt/package.json:387` |
| Five sequential canonical runs | Done | `flagInt(input, "runs", 5)` + sequential loop |
| Preserve raw LHR JSON | Done | `buildAssessmentBundle` maps to `canonical: true` |
| Batch failure on invalid run | Done | `LighthouseBatchError` |
| Numeric median aggregation | Done | `aggregateNumericSamples` + test |
| Non-numeric pass/fail preservation | Done | `extractCategoryProjection` + test |
| AssessmentBundleV1 delegation | Done | `runNachweisAssessmentIngest` call |
| No R2/PBP/Bordbuch duplication | Done | No R2/SHA-256/PBP logic in handler |
| Entitlement gating | Done | `isNachweisEntitled` check |
| Deterministic observedAt | Done | `firstRun.fetchTime` |
| Chrome detection | Done | `checkChromeAvailable` |
| Methodology parsing | Done | `@` split + validation tests |

### Questions for the author

1. Should the `flagString`/`flagBool`/`flagInt` helpers be extracted to a shared utility, or is the duplication accepted as the nachweis module convention?
2. Should `--timeout-per-run` be a CLI flag, or is the hardcoded 120s sufficient for the pilot?
3. Should the temp directory be cleaned up after ingest, or is it intentionally left for debugging?
