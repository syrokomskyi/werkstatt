---
id: ADR-0045
title: "LH-12 unreferenced JS detection must respect .lighthouse-budget-ignore patterns"
status: implemented
scope: package
decider: architecture
createdAt: 2026-08-13
updatedAt: 2026-08-13
implementedAt: 2026-08-13
supersedes: []
supersededBy:
related:
  - RFC-0833
  - DNA-67
reviewers:
  - human:andrii-syrokomskyi
---

# ADR-0045: LH-12 unreferenced JS detection must respect .lighthouse-budget-ignore patterns

## Context

RFC-0833 introduced three Lighthouse budget checks: LH-10 (bundle size), LH-11 (render-blocking CSS), and LH-12 (unreferenced JS bundles). LH-10 was implemented with support for `.lighthouse-budget-ignore` patterns — files matching a pattern in the ignore file are exempted from the size budget check. LH-12 was implemented without this same ignore mechanism, creating an inconsistency: a site could suppress LH-10 false positives via `.lighthouse-budget-ignore` but could not suppress LH-12 false positives for the same files.

This gap surfaced during mission `warpgogol-com-m000054` close. JS bundles from sections on gated pages (`deployment.production: false`) and blocks with `visibility: { segment: temporary-hide }` were flagged as unreferenced by LH-12 because the sections are excluded from the build output — their JS bundles are emitted by Astro's `import.meta.glob` eager scan but never referenced by any HTML page. The `.lighthouse-budget-ignore` file existed to suppress these for LH-10, but LH-12 ignored it.

## Decision

LH-12 unreferenced JS bundle detection applies the same `ignorePatterns` from `readBudgetIgnorePatterns()` that LH-10 already uses. Files whose relative path includes any pattern from `.lighthouse-budget-ignore` are skipped before being reported as unreferenced.

- The ignore check is applied in the LH-12 reporting loop in `runLighthouseBudgetCheck`, not inside `buildJsReferenceGraph` itself — the reference graph builder remains a pure function that reports all unreferenced files, and the caller decides which to ignore.
- `.lighthouse-budget-ignore` patterns are substring matches against the relative path (same as LH-10), not glob patterns.

## Justification

- **Parity with LH-10**: Both checks scan the same `dist/client/_astro/` directory and can produce false positives for the same reason (gated pages, hidden segments). Having different ignore mechanisms for the two checks is confusing and error-prone.
- **Minimal change**: Reusing the existing `readBudgetIgnorePatterns` infrastructure avoids introducing a new config file or a new code path.
- **Correct layering**: `buildJsReferenceGraph` remains a pure function; the ignore filter is a policy applied by the caller, making it easy to test independently.

## Consequences

- Positive: Site operators can suppress LH-12 false positives for gated/hidden sections via a single `.lighthouse-budget-ignore` file.
- Positive: The ignore mechanism is consistent across LH-10 and LH-12.
- Negative: `.lighthouse-budget-ignore` patterns are substring matches, not glob — this is inherited from LH-10 and is not changed by this ADR. A future RFC could upgrade both to glob if needed.
- Technical debt: None — the fix is a 2-line addition in the reporting loop.

## Evolution

This ADR documents a post-hoc fix already applied in platform 5.51.3 (commit `ecosystem.commit` by Cascade, 2026-08-13). The regression test that verifies LH-12 respects ignore patterns must be added to `packages/werkstatt-site/src/checks/tests/lighthouse.test.ts` in a follow-up implementation session.
