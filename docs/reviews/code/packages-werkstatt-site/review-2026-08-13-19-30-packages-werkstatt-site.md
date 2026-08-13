---
reviewId: REVIEW-CODE-2026-08-13-01
date: 2026-08-13
reviewer:
  skill: fo-review
  model: claude-sonnet-4-20250514
verdict: needs-revision
diffRange: 4c428579...HEAD
filesReviewed:
  - packages/werkstatt-site/src/checks/a11y-label-in-name.ts
  - packages/werkstatt-site/src/checks/command-tables/09b-build-artifacts-part2.ts
  - packages/werkstatt-site/src/checks/pipelines/sites-check-postbuild.ts
  - packages/werkstatt-site/src/checks/tests/a11y-label-in-name.test.ts
  - packages/werkstatt-site/AGENTS.md
  - docs/rfcs/rfc-0832-add-a11y-label-in-name-validate-for-wcag-2-5-3.md
---

# Code Review: 4c428579...HEAD (RFC-0832 a11y.label-in-name.validate)

### Verdict: Needs revision

The implementation is architecturally sound and follows the established `surface.heading-uniqueness.validate` pattern correctly. Three minor findings: a duplicate test case, an unnecessary uppercase SVG tag check, and unrelated formatting changes swept into the commit.

### Mechanical floor

Pass — `pnpm --filter @warpgogol/werkstatt-site run build:check` exits 0, all 2477 tests pass (including 25 new tests), `rfc.validate --id RFC-0832` exits 0.

### Axis A — Structural correctness

1. **Duplicate test case.** `a11y-label-in-name.test.ts` test 5 ("a with aria-label not containing visible text — violation") is an exact duplicate of test 2 ("aria-label does not contain visible text — A11Y-LIN-01 violation") — same HTML, same assertions. Remove the duplicate.

2. **Dead branch in `isSvgElement`.** `a11y-label-in-name.ts:101` checks `node.tagName === "svg" || node.tagName === "SVG"`. parse5 normalizes tag names to lowercase, so the `"SVG"` branch is unreachable. Remove the uppercase check.

### Axis B — DNA alignment

No issues. DNA-6 (kebab-case filenames) — `a11y-label-in-name.ts` and `a11y-label-in-name.test.ts` follow kebab-case. No DNA invariants are directly touched by this change.

### Axis C — Ecosystem fit

No issues. Command registered in the correct command table (`09b-build-artifacts-part2.ts`) with `scope: "app"`, `supportsAllSites: true`. Pipeline placement is correct — `SITES_CHECK_POSTBUILD_PIPELINE` after `surface.heading-uniqueness.validate`. AGENTS.md updated with the new command entry.

### Axis D — Forward-only compliance

No issues. No compatibility shims, no dual paths, no legacy code retained.

### Axis E — Agent-facing clarity

No issues. New source files carry `MODULE_CONTRACT` and `CHANGE_SUMMARY` Compass scaffolding. Function names are self-documenting (`extractLabelInNameViolations`, `isInteractiveElement`, `hasAriaHidden`). `fixHint` provides actionable guidance for agents.

### Axis F — Pragmatism

1. **Unrelated formatting changes in commit.** `09b-build-artifacts-part2.ts` includes line-wrapping reformatting of `reads` arrays for `surface-hub-validate`, `surface-industry-validate`, `surface-service-validate`, and `surface-duplicate-content-report` — these are unrelated to RFC-0832 and were swept into the `ecosystem.commit`. These appear to be pre-existing formatter changes. Not a code issue, but a scope discipline note for future commits.

### Axis G — Blind spots

No issues. Performance is documented in the RFC (~20-40 HTML pages, <1s). False positives are mitigated: interactive elements only, icon-only elements skipped, aria-hidden skipped, hidden inputs skipped, SVG skipped. Edge cases covered: empty HTML, malformed HTML (try/catch returns empty). The nav landmark false-positive guard is explicitly tested.

### Spec compliance

| Requirement from RFC-0832 | Status | Evidence |
| --- | --- | --- |
| Command registered with scope app | Done | `09b-build-artifacts-part2.ts:212-221` |
| A11Y-LIN-01 rule with interactive-only matching | Done | `a11y-label-in-name.ts:127-146` |
| Exception cases (aria-hidden, input hidden, SVG, landmarks) | Done | `a11y-label-in-name.ts:96-110` |
| Integrated into SITES_CHECK_POSTBUILD_PIPELINE | Done | `sites-check-postbuild.ts:81-82` |
| --json output format stable | Done | `a11y-label-in-name.ts:165-178` uses `diagnosticsResult` |
| Unit tests with fixture HTML | Done | `a11y-label-in-name.test.ts`, 25 tests |
| AGENTS.md updated | Done | `packages/werkstatt-site/AGENTS.md:77` |
| rfc.validate passes | Done | exit 0 |

### Questions for the author

1. Why is test 5 an exact duplicate of test 2? Was this intentional or a copy-paste error?
2. Is the `buildElementSelector` function's output (e.g. `a#id.class[role=button]`) consumed by any downstream tool, or is it purely informational in the diagnostic `data` field?
