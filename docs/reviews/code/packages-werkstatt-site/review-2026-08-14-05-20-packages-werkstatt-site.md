---
reviewId: REVIEW-CODE-2026-08-14-02
date: 2026-08-14
reviewer:
  skill: fo-review
  model: claude-sonnet-4-20250514
verdict: approved
diffRange: 1ea3ae00...HEAD
filesReviewed:
  - packages/werkstatt-site/src/checks/tests/lighthouse.test.ts
  - packages/werkstatt-site/src/checks/tests/image-delivery.test.ts
  - docs/rfcs/rfc-0835-add-regression-tests-for-lh-12-ignore-and-img-delivery-04-404-exemption.md
---

# Code Review: 1ea3ae00...HEAD (RFC-0835 regression tests)

### Verdict: Approved

The diff adds 4 regression test cases to 2 existing test files, following established patterns in the same files. No new commands, no validator changes, no pipeline changes. All tests pass. The code is minimal, correctly scoped, and grounded in the existing test infrastructure.

### Mechanical floor

Pass — `pnpm --filter @warpgogol/werkstatt-site run build:check` and `pnpm --filter @warpgogol/werkstatt-site run test` (2509 tests passed, 5 skipped, 0 failed).

### Axis A — Structural correctness

No issues. The new test cases follow the exact patterns already established in the same files: `mkdtemp`/`mkdir`/`writeFile` for setup, `beforeEach`/`afterEach` for cleanup, `unwrapData` for result extraction. No magic numbers, no dead code, no duplicated logic beyond the expected test setup repetition. The `unwrapData(result) as { violations: number }` cast is safe — the return type of `runLighthouseBudgetCheck` is `KernelCommandResult<{ totalSize: number; violations: number; instrumentRunId?: string }>` and `unwrapData` returns the `data` field.

### Axis B — DNA alignment

No issues. RFC-0835 satisfies DNA-67 (pre-deploy Lighthouse parity gate). The regression tests verify that the LH-12 ignore-pattern fix (ADR-0045) and the IMG-DELIVERY-04 404.html exemption (ADR-0046) remain correct over time, directly supporting the DNA-67 invariant that every deterministically-checkable Lighthouse audit has a build-time validator with test coverage.

### Axis C — Ecosystem fit

No issues. Tests are in `packages/werkstatt-site/src/checks/tests/` — the correct location. No new commands, no pipeline changes, no package boundary violations. The `makeTestSiteContext` import from `./helpers.ts` follows the existing pattern used by `image-delivery.test.ts`.

### Axis D — Forward-only compliance

No issues. No backward compatibility layers, no shims, no dual-paths. The tests verify existing behavior — no old code paths were maintained.

### Axis E — Agent-facing clarity

No issues. Test names are descriptive and reference the ADR they verify. The `describe` block title includes the ADR-0045 reference. No ungrounded assertions — all expectations are grounded in the actual validator behavior.

### Axis F — Pragmatism

No issues. The tests extend existing test files rather than creating new ones (correctly rejected in the RFC's Alternatives section). No new dependencies. No speculative generality. The test setup is minimal — only the files needed to trigger the specific behavior under test.

### Axis G — Blind spots

No issues. The tests use minimal JS files (a few bytes each) well under the 300KB LH-10 budget. The test HTML has no `<link rel="stylesheet">` so LH-11 produces zero findings. The assertions check `exitCode` and `violations` count rather than filtering findings by rule, which is sufficient because the minimal setup guarantees only LH-12 can produce violations.

### Spec compliance

| Requirement from RFC-0835 | Status | Evidence |
| --- | --- | --- |
| Test 1: LH-12 respects `.lighthouse-budget-ignore` | Done | lighthouse.test.ts:212-265, 2 test cases |
| Test 2: IMG-DELIVERY-04 skips page-level check for `404.html` | Done | image-delivery.test.ts:242-253 |
| Test 3: IMG-DELIVERY-04 per-image check still runs on `404.html` | Done | image-delivery.test.ts:256-268 |
| All tests pass on current codebase | Done | 2509 tests passed, 0 failed |
| No validator behavior changes | Done | Only test files modified, no `.ts` validator files touched |

### Questions for the author

None — the diff is clean and complete.
