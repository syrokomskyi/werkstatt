---
reviewId: REVIEW-CODE-2026-08-14-01
date: 2026-08-14
reviewer:
  skill: fo-review
  model: unknown
verdict: needs-revision
diffRange: 82b4105f...HEAD
filesReviewed:
  - packages/werkstatt-site/src/checks/css-mobile-layout-lint.ts
  - packages/werkstatt-site/src/checks/command-tables/04-content-quality.ts
  - packages/werkstatt-site/src/checks/index.ts
  - packages/werkstatt-site/src/checks/pipelines/sites-check-author.ts
  - packages/werkstatt-site/src/checks/tests/css-mobile-layout-lint.test.ts
---

# Code Review: 82b4105f...HEAD (RFC-0837 css.mobile-layout.lint)

### Verdict: Needs revision

Four minor findings — duplicated code in `collectAllFiles`, silently swallowed file-read errors, and two pieces of dead code. None are architectural or DNA violations. The validator is functionally correct and all 14 tests pass.

### Mechanical floor

Pass — `build:check` and `vitest` both exit 0.

### Axis A — Structural correctness

1. **Duplicated Code** — `collectAllFiles` (lines 309–354) has four nearly identical blocks: collect files by extension, read each, compute relative path, push to results. Extract a helper like `collectAndRead(dir, ext, basePath)` to eliminate the repetition.

2. **Swallowed errors** — Lines 321, 330, 339, 347 use `.catch(() => "")` which silently turns file-read errors into empty content (then skipped by `if (!content) continue`). The RFC spec (§Failure modes) says: "If a CSS file cannot be parsed, the validator logs a warning and skips that file." File-read errors should log `context.logger.warn` before skipping.

3. **Dead code** — `CssRule.startLine` (line 87) is computed in `parseCssRules` (line 133) but never read. `makeViolation` uses `getLineColumn(fullSource, ruleOffset)` to compute the line. Remove the field.

4. **Unused parameter** — `makeViolation` (line 290) takes `_rule: CssRule` (prefixed with `_`) but never reads it. Remove the parameter and update call sites.

### Axis B — DNA alignment

No issues. DNA-68 is established and the validator enforces it. No conflicts with other invariants.

### Axis C — Ecosystem fit

No issues. Command registered in `04-content-quality.ts` following the existing `css.important.lint` pattern. Pipeline placement in `SITES_CHECK_AUTHOR_PIPELINE` after `css.important.lint` is correct per RFC. Import flow follows `werkstatt-site → werkstatt/kernel` and `werkstatt-site → werkstatt-site/*` boundaries.

### Axis D — Forward-only compliance

No issues. No compatibility shims, no legacy paths, no dual-paths.

### Axis E — Agent-facing clarity

No issues. `MODULE_CONTRACT` and `CHANGE_SUMMARY` present on both new source files. Variable and function names are descriptive. No ungrounded assertions.

### Axis F — Pragmatism

Findings 1 and 3 from Axis A are also pragmatism concerns — the duplicated collection blocks and dead `startLine` field add unnecessary code mass. The validator correctly uses existing `collectFiles` and `getLineColumn` utilities rather than reimplementing them.

### Axis G — Blind spots

- **CSS comments**: `findMatchingBrace` (line 146) does not handle `/* */` comments. A `{` or `}` inside a comment will throw off the depth counter. This is a known limitation of the regex approach, acknowledged in the RFC risks section. Acceptable for initial rollout.
- **Line reporting inside non-min-width media queries**: When `100vh` appears inside `@media (max-width: 480px)`, the violation points to the `@media` line rather than the inner rule. Minor imprecision, not incorrect.
- **Performance**: not annotated in source, but RFC §Risks states "<100ms" for the same file set. Acceptable.

### Spec compliance

| Requirement from RFC-0837 | Status | Evidence |
| --- | --- | --- |
| Six rules MOBILE-CSS-01..06 | Done | `RULE_MESSAGES` lines 42–80 |
| `--mode warning`/`error` flag | Done | Lines 387–388, 417 |
| Scans `.css` and `.astro` | Done | `collectAllFiles` lines 318–351 |
| `@media (min-width: ...)` suppression | Done | `findMinWidthMediaBlocks` + `isInsideMinWidthMedia` |
| Structured `--json` output | Done | `MobileLayoutLintResult` interface lines 35–40 |
| Exit code 1 on errors | Done | Line 417 |
| Pipeline integration after `css.important.lint` | Done | `sites-check-author.ts` line 330 |
| DNA-68 established | Done | `docs/architecture-dna.md` line 287 |
| AGENTS.md updated | Done | `packages/werkstatt-site/AGENTS.md` line 84 |
| verification-plan.xml updated | Done | `docs/verification-plan.xml` vm-16 |
| File-read errors logged as warnings | Partial | `.catch(() => "")` swallows errors silently — no warning logged |

### Questions for the author

1. Should `collectAllFiles` extract a shared helper for the four duplicated collect-read-push blocks, or is the explicit repetition intentional for readability?
2. The `.catch(() => "")` pattern silently skips unreadable files — should this log a warning per the RFC's failure-mode spec, or is silent skip acceptable because unreadable files are rare?
3. The `CssRule.startLine` field and `makeViolation`'s `_rule` parameter are unused — remove them, or are they reserved for future use?
