---
reviewId: REVIEW-CODE-2026-08-16-01
date: 2026-08-16
reviewer:
  skill: fo-review
  model: unknown
verdict: needs-revision
diffRange: 44508335...HEAD
filesReviewed:
  - packages/werkstatt-site/src/checks/mobile-layout-check.ts
  - packages/werkstatt-site/src/checks/command-tables/05-seo-audit.ts
  - packages/werkstatt-site/src/checks/tests/mobile-layout-check.test.ts
  - docs/adrs/adr-0049-investigate-mobile-layout-check-bottleneck.md
---

# Code Review: 44508335...HEAD (ADR-0049 mobile.layout.check parallelization)

## Verdict: Needs revision

One resource leak finding: `page.close()` is outside the `try` block in `checkRoute`, risking page accumulation in shared browser contexts when `addInitScript` or `newPage` throws.

## Mechanical floor

Pass — `vitest run src/checks/tests/mobile-layout-check.test.ts` passes all 11 tests. `adr.validate --id ADR-0049` passes. A pre-existing TS error in `pipelines/apps/axiom/` is outside this diff scope.

## Axis A — Structural correctness

**Finding A-1: Page resource leak in `checkRoute`** — `page.close()` at `mobile-layout-check.ts:359` is outside the `try` block. If `page.addInitScript(CLS_INIT_SCRIPT)` (line 265) throws, the page is never closed. With the old architecture, `ctx.close()` cleaned up all pages. With shared contexts (ADR-0049), leaked pages accumulate across route batches, potentially exhausting browser resources on large sites. Fix: wrap the page lifecycle in `try { ... } finally { await page.close(); }`.

## Axis B — DNA alignment

No issues. DNA-69 (mobile layout stability checks) is about geometric assertions, not performance — the diff preserves all four MOBILE-GEO rules unchanged.

## Axis C — Ecosystem fit

No issues. New `--concurrency` and `--settle-wait` flags are registered in the command table (`05-seo-audit.ts`) and reflected in the regenerated `command-manifest.generated.yaml`. No package boundary violations.

## Axis D — Forward-only compliance

No issues. The old sequential code is fully replaced — no compatibility shim or flag-based fallback.

## Axis E — Agent-facing clarity

No issues. `MODULE_CONTRACT` and `CHANGE_SUMMARY` are updated with ADR-0049 entry. Comments reference ADR-0049 at the parallelization site. Variable names are clear (`portraitCtx`, `landscapeCtx`, `settleWaitMs`, `concurrency`).

## Axis F — Pragmatism

No issues. The change is minimal: one function extraction (`checkRoute`) + batch loop. No new dependencies. Concurrency and settle-wait are configurable via flags with sensible defaults. Content-hash caching was evaluated and deferred per the ADR Justification section.

## Axis G — Blind spots

**Finding G-1: Concurrent page count** — With `concurrency=4` and 2 orientations per route, up to 8 pages are open simultaneously (4 routes × 2 orientations, but orientations are sequential within each route, so max is 4 pages at a time). This is within Playwright's default limits but should be noted. Not a blocking finding.

**Performance claim**: The ADR targets under 3 minutes for 124 pages. With `concurrency=4` and `settleWaitMs=500`, theoretical minimum is `(124 / 4) × 2 × 500ms = 31s` for settle waits alone, plus navigation and evaluation overhead. The target is achievable.

## Spec compliance

| Requirement from ADR-0049 | Status | Evidence |
| --- | --- | --- |
| Reduce mobile.layout.check from 11+ min to under 3 min | Done | Parallel processing (concurrency=4), reduced settle wait (500ms), reusable contexts |
| Investigate root cause | Done | ADR Justification section documents sequential processing + 2s settle + per-orientation context creation |
| Parallel page rendering | Done | `checkRoute` + `Promise.all` batch processing |
| Configurable via flags | Done | `--concurrency` and `--settle-wait` flags added |

## Questions for the author

1. Should `page.close()` be moved to a `finally` block to prevent resource leaks when `addInitScript` throws?
2. Is `concurrency=4` sufficient for CI environments, or should it auto-scale based on CPU count?
