---
reviewId: REVIEW-CODE-2026-08-10-01
date: 2026-08-10
reviewer:
  skill: fo-review
  model: claude-sonnet-4-20250514
verdict: needs-revision
diffRange: ca488194~1...HEAD
filesReviewed:
  - packages/werkstatt-site/src/codegen/open-source-page.ts
  - packages/werkstatt-site/src/codegen/tests/open-source-normalize-license.test.ts
---

# Code Review: ca488194~1...HEAD (RFC-0793)

### Verdict: Needs revision

The implementation is clean, minimal, and forward-only. One finding: acceptance criterion 10 ("Unit test: `licenseDistribution` does not contain an entry with `license: \"Unknown\"`") claims a unit test exists, but no test covers the `buildRegistryData` filter — the evidence annotation points to source code, not a test.

### Mechanical floor

Pass — `pnpm --filter @warpgogol/werkstatt-site run build:check` succeeds. 15/15 new tests pass.

### Axis A — Structural correctness

- **Finding A1: Missing test for `buildRegistryData` unknown-license filter.** Acceptance criterion 10 states "Unit test: `licenseDistribution` does not contain an entry with `license: \"Unknown\"`", but the test file only covers `normalizeLicense`. The `buildRegistryData` function is private (not exported), which makes direct unit testing impractical without exporting it or mocking the full generator pipeline. However, the acceptance criterion explicitly says "Unit test" — either add an integration test (mocking `execFileSync` like `open-source-fingerprint.test.ts` does) or rephrase the criterion to "Code inspection confirms `licenseDistribution` excludes unknown licenses". As-is, the criterion is marked `[x]` with evidence pointing to source code line 581, not a test.

### Axis B — DNA alignment

No issues. No DNA invariants are touched by this change (`satisfies: []` in the RFC).

### Axis C — Ecosystem fit

No issues. Changes are internal to `@warpgogol/werkstatt-site`. No new commands, no package boundary changes, no imports added.

### Axis D — Forward-only compliance

No issues. The `Python-2.0` dead alias is removed, not kept behind a flag. The old parenthesized-expression fallthrough to `unknown` is replaced, not maintained as a parallel path.

### Axis E — Agent-facing clarity

No issues. New test file carries `MODULE_CONTRACT` and `CHANGE_SUMMARY` scaffolding. Variable name `withoutParens` is self-documenting.

### Axis F — Pragmatism

No issues. The fix is minimal: one `replace()` call, one `continue` statement, one alias addition, one alias removal. No new dependencies, no new commands, no speculative generality.

### Axis G — Blind spots

No issues. The `withoutParens` computation is O(n) on short strings (license names <50 chars) and only runs after SPDX ID and alias lookups fail — negligible cost. Nested parentheses edge case is documented in the RFC's Risks section.

### Spec compliance

| Requirement from RFC-0793 | Status | Evidence |
| --- | --- | --- |
| Strip parentheses before OR/AND parsing | Done | `open-source-page.ts:235` |
| Add Apache2 alias | Done | `open-source-page.ts:194` |
| Remove Python-2.0 dead alias | Done | `open-source-page.ts:185-208` |
| Filter unknown from licenseDistribution only | Done | `open-source-page.ts:581` |
| Unit test for licenseDistribution filter | Partial | Criterion marked [x] but no test covers `buildRegistryData` |
| Component table/SBOM/NOTICES retain unknown | Done | Filter is in `licenseMap` loop only (line 581); `components` array (line 601) and `sbomComponents` (line 848) are unfiltered |

### Questions for the author

1. Should acceptance criterion 10 have a real unit/integration test for the `buildRegistryData` filter, or should the criterion be rephrased to "code inspection confirms"?
