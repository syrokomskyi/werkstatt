---
reviewId: REVIEW-CODE-2026-07-22-01
date: 2026-07-22
reviewer:
  skill: fo-review
  model: claude-sonnet-4-20250514
verdict: approved
diffRange: af4fe7aef...HEAD
filesReviewed:
  - packages/os/site-kernel-checks/src/tests/helpers.ts
  - packages/os/site-kernel-checks/src/tests/result-helpers.test.ts
  - packages/os/site-kernel-checks/src/tests/css-important-lint.test.ts
  - packages/os/site-kernel-checks/src/tests/content-filename.test.ts
  - packages/os/site-kernel-checks/src/tests/runtime-context-shape.test.ts
  - packages/os/site-kernel-checks/src/tests/section-defaults.test.ts
  - packages/os/site-kernel-checks/src/tests/labels-shape.test.ts
  - packages/os/site-kernel-checks/src/tests/import-extensions.test.ts
  - packages/os/site-kernel-checks/src/tests/tsconfig-shape.test.ts
  - packages/os/site-kernel-checks/src/tests/section-placeholder.test.ts
  - packages/os/site-kernel-checks/src/tests/scripts-placement.test.ts
  - packages/os/site-kernel-checks/src/tests/compass-audit-isauditdue.test.ts
  - packages/os/site-kernel-checks/src/tests/compass-audit-validate.test.ts
  - packages/os/site-kernel-checks/src/tests/schema-drift.test.ts
  - packages/os/site-kernel-checks/src/tests/need-markers.test.ts
  - packages/os/site-kernel-checks/src/tests/page-blocks-mirror.test.ts
  - packages/os/site-kernel-checks/src/tests/route-topology.test.ts
  - packages/os/site-kernel-checks/src/tests/text-normalize.test.ts
  - packages/os/site-kernel-checks/src/tests/trust-rating.test.ts
  - packages/os/site-kernel-checks/src/tests/visibility-expr.test.ts
---

# Code Review: af4fe7aef...HEAD (test coverage expansion + helper extraction)

### Verdict: Approved

The diff adds 10 new test files (48 tests) covering previously untested modules and extracts shared test helpers to eliminate cross-file duplication. All tests pass, typecheck is clean, and every new file carries Compass scaffolding. Two minor findings on axis A and one on axis G — none blocking.

### Mechanical floor

Pass — `tsc --noEmit` clean, 73 test files (366 tests) all green.

### Axis A — Structural correctness

- **`as never` on testLogger** (`helpers.ts:31`) — the `as never` cast on the logger stub is an established pattern in this codebase (`compass-audit-record.test.ts`, `sitemap-helpers.test.ts` use it identically). Not a finding — consistent with existing convention.
- **`result.data!` non-null assertions** (`result-helpers.test.ts`, 21 occurrences) — the `KernelCommandResult` type marks `data` as optional, but the result builders (`passResult`, `failResult`, `diagnosticsResult`) always set it. The `!` assertion is the correct tool here since the test knows the builder's runtime contract. Minor: could add a typed helper `unwrapData(result)` to centralize the assertion, but this is not a blocking issue.
- **Duplicated `KernelCommandInput` literal** — every fixture test constructs `const input: KernelCommandInput = { flags: {}, argv: [], args: [] }` inline. A `testInput()` helper in `helpers.ts` would eliminate this repetition. Minor — not blocking.

### Axis B — DNA alignment

No issues. All new test files carry `MODULE_CONTRACT` and `CHANGE_SUMMARY` (DNA-42). No new source files outside `src/tests/`. No cosmic naming, content, or route surface touched.

### Axis C — Ecosystem fit

No issues. Tests import from `../module-under-test.ts` and `./helpers.ts` — no cross-package imports introduced. No pipeline or command surface changes. The `helpers.ts` extraction follows the AGENTS.md guidance on shared utilities within a package.

### Axis D — Forward-only compliance

No issues. The helper extraction replaced inline duplicated code in 8 files — no legacy shim left behind, no dual-path. The old inline logger/context factory code was deleted, not preserved behind a flag.

### Axis E — Agent-facing clarity

No issues. `helpers.ts` has clear JSDoc on each exported function explaining when to use `makeTestContext` vs `makeTestSiteContext`. All new test files have `MODULE_CONTRACT` blocks with purpose statements. Test descriptions are descriptive (`"fails when filename does not match pageId slug"`).

### Axis F — Pragmatism

No issues. Each test file covers the minimal set of cases: happy path, violation detection, edge case (missing dir, empty input). No speculative test infrastructure or over-engineered fixture framework. The `helpers.ts` file is minimal — 3 exports, no speculative generality.

### Axis G — Blind spots

- **Temp dir cleanup on test failure** — all fixture tests use `afterEach(async () => { await rm(workspaceRoot, { recursive: true, force: true }); })`. If a test throws before `afterEach` runs (e.g., `beforeEach` fails), the temp dir leaks. This is a known vitest behavior — `afterEach` runs even on `beforeEach` failure, so this is actually safe. No finding.
- **`collectFiles` extension matching** — `section-placeholder.test.ts` creates `.astro` files under `sections/<name>/` and relies on `collectFiles` to find them. The `collectFiles` function from `@warpgogol/share/fs` is not tested in isolation here, but it's an existing shared utility with its own coverage. No finding.
- **`scripts-placement.test.ts` SP-07 test** — the test creates a `.client.ts` file with a mismatched name. The test asserts `exitCode === 1` and `errors >= 1`, but does not verify the specific rule ID (`SP-07`). Minor — adding `expect(result.data!.errors).toBe(1)` with a diagnostic check would be more precise, but the current assertion is sufficient for regression detection.

### Spec compliance

No spec available — spec compliance skipped. The diff is a continuation of the test coverage expansion tracked in the session TODO list.

### Questions for the author

1. Should `testInput()` be added to `helpers.ts` to eliminate the repeated `{ flags: {}, argv: [], args: [] }` literal across all fixture tests?
2. The `result-helpers.test.ts` uses `result.data!` 21 times — would a thin `unwrapData()` helper be preferable, or is the direct assertion preferred for test readability?
3. `scripts-placement.test.ts` SP-07 test asserts `errors >= 1` but does not check the specific rule ID — is this sufficient, or should it verify `SP-07` specifically?
