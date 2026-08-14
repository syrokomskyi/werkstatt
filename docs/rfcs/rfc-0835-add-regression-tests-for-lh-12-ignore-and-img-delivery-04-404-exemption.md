---
id: RFC-0835
title: "Add regression tests for LH-12 ignore patterns and IMG-DELIVERY-04 404.html exemption"
status: draft
kind: contract
scope: workspace
owners:
  - architecture
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-08-13
updatedAt: 2026-08-14
enhancedAt: 2026-08-14
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - ADR-0045
  - ADR-0046
  - RFC-0833
  - RFC-0830
satisfies:
  - DNA-67
versionBump: patch
commands:
  proposed: []
  added: []
  changed: []
  removed: []
appsImpacted: []
packagesImpacted:
  - packages/werkstatt-site
successSignals:
  - "LH-12 ignore patterns tested — .lighthouse-budget-ignore suppresses unreferenced JS false positives"
  - "IMG-DELIVERY-04 404.html exemption tested — 404 pages with chrome-only images do not trigger page-level LCP errors"
nonGoals:
  - "Do not change validator behavior — only add tests for already-applied fixes"
  - "Do not add tests for the component-level WCAG 2.5.3 validator (that is RFC-0834)"
---

# RFC-0835: Add regression tests for LH-12 ignore patterns and IMG-DELIVERY-04 404.html exemption

## Context

ADR-0045 and ADR-0046 document two fixes applied during mission `warpgogol-com-m000054` close (platform 5.51.3 and 5.51.4):

1. **ADR-0045**: LH-12 unreferenced JS detection now respects `.lighthouse-budget-ignore` patterns (parity with LH-10).
2. **ADR-0046**: IMG-DELIVERY-04 page-level LCP check now skips `404.html`.

Both fixes are in production code (`packages/werkstatt-site/src/checks/lighthouse.ts` and `packages/werkstatt-site/src/checks/image-delivery.ts`) but have **no regression tests**. The existing test suites (`lighthouse.test.ts`, `image-delivery.test.ts`) do not cover these specific scenarios.

## Problem

**Unprotected invariant**: The fixes applied in ADR-0045 and ADR-0046 can be silently reverted by a future refactor. Without regression tests, there is no automated signal that the behavior changed.

- `lighthouse.test.ts` tests `buildJsReferenceGraph` directly but does not test the `runLighthouseBudgetCheck` reporting loop where the ignore filter is applied.
- `image-delivery.test.ts` tests IMG-DELIVERY-04 per-image checks and the page-level check, but does not test the `404.html` exemption.

## Decision

Add regression tests to the existing test files that verify the specific behavior introduced by ADR-0045 and ADR-0046.

## Architectural fit

- **DNA-67**: Regression tests ensure the pre-deploy Lighthouse parity gate remains correct over time.
- **Testing pyramid**: Unit tests in the existing test suites — no new test infrastructure needed.

## Design

### Test 1: LH-12 respects .lighthouse-budget-ignore (ADR-0045)

**File**: `packages/werkstatt-site/src/checks/tests/lighthouse.test.ts`

**Setup**:

- Use `makeTestSiteContext` from `./helpers.ts` to build a `KernelRuntimeContext` with `appDir` as `context.site.directory`.
- Create `dist/client/_astro/` with:
  - `referenced.js` (minimal valid JS)
  - `orphan.js` (not referenced by any HTML or JS)
- Create `dist/client/index.html` referencing `/_astro/referenced.js` via `<script src>`
- Create `.lighthouse-budget-ignore` in `appDir` (not `dist/`) containing `orphan`

**Assertions**:

- `runLighthouseBudgetCheck` returns `exitCode: 0` (no violations)
- No LH-12 finding for `orphan.js`
- LH-12 finding IS produced for `orphan.js` when `.lighthouse-budget-ignore` is absent or doesn't match

**Test name**: `"LH-12: .lighthouse-budget-ignore suppresses unreferenced JS false positive"`

### Test 2: IMG-DELIVERY-04 skips 404.html (ADR-0046)

**File**: `packages/werkstatt-site/src/checks/tests/image-delivery.test.ts`

**Setup**:

- Create a temp `dist/client/` with:
  - `404.html` containing `<img src="/logo.webp" width="200" height="50" loading="eager" decoding="async" />` (no `fetchpriority="high"`)
  - `index.html` with the same content
  - `logo.webp` (small valid webp)

**Assertions**:

- `runImageDeliveryValidate` produces NO IMG-DELIVERY-04 page-level error for `404.html`
- `runImageDeliveryValidate` DOES produce IMG-DELIVERY-04 page-level error for `index.html` (same content, different filename)
- Per-image IMG-DELIVERY-04 check still runs on 404.html (if an image on 404.html has `fetchpriority="high"` but missing `decoding="async"`, it should still error)

**Test name**: `"IMG-DELIVERY-04: 404.html is exempt from page-level LCP marker requirement"`

### Test 3: IMG-DELIVERY-04 per-image check still runs on 404.html (ADR-0046)

**File**: `packages/werkstatt-site/src/checks/tests/image-delivery.test.ts`

**Setup**:

- Create `404.html` with `<img src="/hero.webp" srcset="..." width="800" height="600" loading="eager" fetchpriority="high" />` (missing `decoding="async"`)

**Assertions**:

- `runImageDeliveryValidate` produces an IMG-DELIVERY-04 per-image error for `404.html` (the per-image check is NOT skipped, only the page-level check is)

**Test name**: `"IMG-DELIVERY-04: per-image attribute check still runs on 404.html"`

## Rollout

- Tests are added to existing test files — no pipeline changes needed.
- Tests run as part of the normal `vitest run` suite.
- All tests must pass on the current codebase (the fixes are already applied).

## Alternatives considered

- **Separate test file**: Rejected — the tests belong with the existing `lighthouse.test.ts` and `image-delivery.test.ts` suites that test the same validators.
- **Integration test via mission.validate**: Rejected — too slow (~60s per run). Unit tests with temp directories are fast (~1s) and test the specific behavior directly.

## Risks

- **Test isolation**: The tests create temp directories and must clean up after themselves. Use the existing `beforeEach`/`afterEach` patterns in the test files.
- **Flakiness**: The `.lighthouse-budget-ignore` file must be created in the correct location (`appDirectory`) for the test to work. Test 1 calls `runLighthouseBudgetCheck` which requires a `KernelRuntimeContext` — use the `makeTestSiteContext` pattern from `image-delivery.test.ts` (not the helper-direct pattern in `lighthouse.test.ts`, which only tests exported functions without a context).
- **LH-10/LH-11 interference**: `runLighthouseBudgetCheck` also runs LH-10 (bundle size) and LH-11 (render-blocking CSS). The minimal test JS files (a few bytes each) are well under the 300KB LH-10 budget, and the test HTML has no `<link rel="stylesheet">` so LH-11 produces zero findings. The test should filter findings by `rule === "LH-12"` to assert only on the relevant rule.

## Acceptance criteria

- [ ] Test 1 added to `lighthouse.test.ts`: LH-12 respects `.lighthouse-budget-ignore`
- [ ] Test 2 added to `image-delivery.test.ts`: IMG-DELIVERY-04 skips page-level check for `404.html`
- [ ] Test 3 added to `image-delivery.test.ts`: IMG-DELIVERY-04 per-image check still runs on `404.html`
- [ ] All new tests pass on the current codebase
- [ ] `pnpm exec vitest run packages/werkstatt-site/src/checks/tests/lighthouse.test.ts` passes
- [ ] `pnpm exec vitest run packages/werkstatt-site/src/checks/tests/image-delivery.test.ts` passes
- [ ] `rfc.validate` passes on this file before merging

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- For RFCs created on or after 2026-07-07 with acceptance probes: before stamping `implemented`, run `pnpm exec werkstatt run rfc.verification.emit --id RFC-0835` and commit the evidence file in the same commit (RFC-0330 amended transition precondition).
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0835 --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
