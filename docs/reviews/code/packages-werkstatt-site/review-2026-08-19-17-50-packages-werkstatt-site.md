---
reviewId: REVIEW-CODE-2026-08-19-01
date: 2026-08-19
reviewer:
  skill: fo-review
  model: unknown
verdict: needs-revision
diffRange: d0e1eb35..HEAD
filesReviewed:
  - packages/werkstatt-site/src/checks/a11y-label-in-name-component.ts
  - packages/werkstatt-site/src/checks/command-tables/08-section-framework.ts
  - packages/werkstatt-site/src/checks/tests/a11y-label-in-name-component.test.ts
  - packages/werkstatt-site/AGENTS.md
  - docs/rfcs/rfc-0882-enhance-a11y-lin-comp-01-to-detect-record-lookup-aria-label-mismatches.md
---

# Code Review: d0e1eb35..HEAD (RFC-0882 Record-lookup aria-label mismatch detection)

### Verdict: Needs revision

One minor finding on Axis A (duplicated parse calls). The implementation is clean, well-tested, and architecturally sound. The finding is cosmetic and does not block correctness.

### Mechanical floor

Pass — `pnpm --filter @warpgogol/werkstatt-site exec vitest run src/checks/tests/a11y-label-in-name-component.test.ts` (23/23 tests pass). Pre-existing TypeScript errors in `packages/werkstatt/` (underscore-prefixed imports) are unrelated to this diff.

### Axis A — Structural correctness

**Finding A-1 (minor): Duplicated `parseRecordLookup(splitFallback(...))` calls.** In `extractComponentLabelInNameViolations`, `parseRecordLookup(splitFallback(ariaLabelExpr))` and `parseRecordLookup(splitFallback(visibleTextExpr))` are called twice each — once inside `isRecordLookupMismatch` and once in the exemption check (`ariaLookup`, `textLookup`). The exemption check could reuse the return value of `isRecordLookupMismatch` if it also returned the parsed lookups, or the parsed values could be computed once and passed to `isRecordLookupMismatch`. This is a minor Duplicated Code smell — not a correctness issue, but the calls are redundant on every iteration.

Evidence: `packages/werkstatt-site/src/checks/a11y-label-in-name-component.ts:215` calls `isRecordLookupMismatch(ariaLabelExpr, visibleTextExpr)` which internally calls `parseRecordLookup(splitFallback(...))` on both expressions. Lines 221-222 call the same `parseRecordLookup(splitFallback(...))` again for the exemption check.

### Axis B — DNA alignment

No issues. DNA-67 (pre-deploy Lighthouse parity gate) is satisfied — this RFC extends an existing build-time validator, aligning with the principle of catching issues at build time rather than post-deploy.

### Axis C — Ecosystem fit

No issues. Package boundaries respected (all changes within `packages/werkstatt-site`). Pipeline placement unchanged (validator already in `PACKAGES_CHECK_PIPELINE`). MODULE_CONTRACT, CHANGE_SUMMARY, command-tables description, and AGENTS.md all updated.

### Axis D — Forward-only compliance

No issues. The existing variable-name-reference check is preserved. The Record-lookup check is additive — no compatibility shim or dual-path.

### Axis E — Agent-facing clarity

No issues. MODULE_CONTRACT and CHANGE_SUMMARY updated in both source and test files. Comments explain the Record-lookup exemption rationale. Variable names are self-documenting (`ariaLookup`, `textLookup`, `sameRecordLookup`, `recordLookupMismatch`).

### Axis F — Pragmatism

No issues. Minimal changes — extends existing function, adds 3 small helper functions and 1 interface. No new dependencies. Existing regex-based pattern followed.

### Axis G — Blind spots

No issues. Performance impact is negligible (one additional regex test per visible text expression). False positives addressed by same-Record exemption. Edge cases covered by 7 new test cases.

### Spec compliance

| Requirement from RFC-0882 | Status | Evidence |
| --- | --- | --- |
| `parseRecordLookup` extracts Record name and key expression | Done | `a11y-label-in-name-component.ts:158-162` |
| `splitFallback` extracts primary expression before `??` | Done | `a11y-label-in-name-component.ts:153-156` |
| `isRecordLookupMismatch` returns true for different Record identifiers | Done | `a11y-label-in-name-component.ts:164-173` |
| `extractVisibleTextExprs` extended for Record-lookup | Done | `a11y-label-in-name-component.ts:135-138` |
| Validator emits A11Y-LIN-COMP-01 for Record-lookup mismatches | Done | `a11y-label-in-name-component.ts:212-240` |
| Safe patterns not flagged | Done | Tests at `a11y-label-in-name-component.test.ts:202-262` |
| Unit tests cover all patterns | Done | 7 new test cases, 23/23 pass |
| MODULE_CONTRACT and CHANGE_SUMMARY updated | Done | `a11y-label-in-name-component.ts:10-11,23` |
| Command-tables description updated | Done | `08-section-framework.ts:122` |
| `rfc.validate` passes | Done | Zero errors |

### Questions for the author

1. Could `isRecordLookupMismatch` return the parsed `RecordLookup` objects alongside the boolean, so the exemption check reuses them instead of re-parsing?
