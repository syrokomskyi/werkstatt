---
reviewId: REVIEW-CODE-2026-08-14-01
date: 2026-08-14
reviewer:
  skill: fo-review
  model: unknown
verdict: needs-revision
diffRange: acaace48...HEAD
filesReviewed:
  - packages/werkstatt-site/src/checks/a11y-label-in-name-component.ts
  - packages/werkstatt-site/src/checks/command-tables/08-section-framework.ts
  - packages/werkstatt-site/src/checks/pipelines/packages-check.ts
  - packages/werkstatt-site/src/checks/tests/a11y-label-in-name-component.test.ts
  - packages/werkstatt-site/AGENTS.md
  - docs/rfcs/rfc-0836-add-component-level-wcag-2-5-3-label-in-name-validator.md
---

# Code Review: acaace48...HEAD (RFC-0836)

### Verdict: Needs revision

The implementation is structurally sound and follows existing patterns (section-image-props.ts), but has a few findings on axes A, E, and G that should be addressed before the review is clean.

### Mechanical floor

Pass — `pnpm --filter @warpgogol/werkstatt-site run build:check` exits 0. `rfc.validate --id RFC-0836 --json` passes. 16/16 unit tests pass.

### Axis A — Structural correctness

1. **Duplicated import** — `a11y-label-in-name-component.test.ts:20-21` imports `runA11yLabelInNameComponentValidate` and `extractComponentLabelInNameViolations` from the same module in two separate import statements. These should be merged into a single import declaration.

2. **`ComponentLabelInNameFinding` interface is over-specified** — the `rule` field is typed as `typeof RULE_ID` (literal `"A11Y-LIN-COMP-01"`), which is always the same constant. This is not wrong, but `severity: "error"` is redundant — the finding is always an error. Consider simplifying the interface to remove `severity` since it's never read by the handler (the handler hardcodes `severity: "error"` at line 216).

### Axis B — DNA alignment

No issues. DNA-67 (Pre-deploy Lighthouse parity gate) is satisfied — the validator catches WCAG 2.5.3 issues at build time, before deploy. The RFC correctly claims `satisfies: [DNA-67]` as strengthening existing coverage rather than introducing new.

### Axis C — Ecosystem fit

No issues. Command is placed in `08-section-framework.ts` after `section.image-props.validate` (same file, same scope pattern). Pipeline integration in `PACKAGES_CHECK_PIPELINE` is correct for a `scope: workspace` command. AGENTS.md is updated with the new command entry.

### Axis D — Forward-only compliance

No issues. No backward compatibility layers, no shims, no dual-paths. The validator is additive — it does not replace the post-build `a11y.label-in-name.validate` (RFC-0832).

### Axis E — Agent-facing clarity

1. **Test file has two import statements from the same module** — `a11y-label-in-name-component.test.ts:20-21`:
   ```ts
   import { runA11yLabelInNameComponentValidate } from "../a11y-label-in-name-component.ts";
   import { extractComponentLabelInNameViolations } from "../a11y-label-in-name-component.ts";
   ```
   Should be a single import. This is a readability issue that another agent may copy as a pattern.

### Axis F — Pragmatism

No issues. The validator follows the minimality ladder — regex-based scanning is sufficient for the common patterns. No new dependencies added. The `collectFiles` and `diagnosticsResult` helpers are reused from existing modules. The command earns its existence as a pre-build complement to the post-build validator.

### Axis G — Blind spots

1. **False positive risk with generic variable names** — the case-insensitive substring match at line 178 (`ariaLabelExpr.toLowerCase().includes(varName.toLowerCase())`) may produce false negatives when the visible text variable has a generic name like `text` or `label` that appears as a substring in an unrelated context within the aria-label expression. The RFC acknowledges this risk and proposes a `<!-- a11y-lin-ignore -->` comment opt-out as a future mitigation, which is acceptable for now.

2. **Multi-line aria-label expressions not handled** — `extractBraceExpression` operates on a single line. If an aria-label expression spans multiple lines (e.g., `aria-label={\n  someExpr\n}`), the function returns `null` and the element is skipped. This is a known limitation of the regex-based approach and is acceptable for common patterns, but should be documented in the MODULE_CONTRACT non-goals.

3. **No test for multi-line element content** — the test suite does not include a case where the interactive element's content spans multiple lines (e.g., `<a aria-label={...}>\n  <span>{label}</span>\n</a>`). While the `extractElementContent` function handles this, there's no explicit test coverage for it. The acceptance criterion mentions "multi-line aria-label expression" but the test covers multi-line content, not multi-line aria-label expressions.

### Spec compliance

| Requirement from RFC-0836 | Status | Evidence |
| --- | --- | --- |
| Command registered | Done | `08-section-framework.ts:119-128` |
| Scans `.astro` in `domain/ui/` | Done | `a11y-label-in-name-component.ts:202-204` |
| Detects aria-label/visible text mismatch | Done | `a11y-label-in-name-component.ts:155-193` |
| Reports A11Y-LIN-COMP-01 with details | Done | `a11y-label-in-name-component.ts:213-227` |
| Exit code 1 on violations | Done | `diagnosticsResult` returns exitCode 1 |
| Integrated into PACKAGES_CHECK_PIPELINE | Done | `packages-check.ts:110-111` |
| Unit tests covering required cases | Done | 16 tests, all pass |
| Existing codebase passes | Done | `pnpm exec werkstatt run a11y.label-in-name.component.validate` exits 0 |
| AGENTS.md updated | Done | `packages/werkstatt-site/AGENTS.md:78` |
| rfc.validate passes | Done | `rfc.validate --id RFC-0836 --json` status: pass |

### Questions for the author

1. Should the `ComponentLabelInNameFinding` interface `severity` field be removed since it's never consumed by the handler and is always `"error"`?
2. Is the lack of multi-line aria-label expression handling acceptable for the current codebase patterns, or should `extractBraceExpression` be enhanced to handle multi-line brace expressions?
