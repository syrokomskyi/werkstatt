---
reviewId: REVIEW-CODE-2026-07-31-01
date: 2026-07-31
reviewer:
  skill: fo-review
  model: unknown
verdict: needs-revision
diffRange: 826714b...HEAD
filesReviewed:
  - packages/os/site-kernel-checks/src/tests/adr-0011-placeholder-expansion.test.ts
  - packages/os/site-kernel-checks/src/tests/adr-0011-preview-glob-leak.test.ts
  - docs/adrs/adr-0011-require-regression-tests-for-validator-bug-fixes.md
---

# Code Review: 826714b...HEAD (ADR-0011 regression tests)

### Verdict: Needs revision

Two new test files and an ADR frontmatter transition. The tests are well-structured and cover the intended bugs, but the "multiple placeholders" test case is redundant — it repeats the exact same assertions as the `{slug}` and `{id}` individual tests with identical inputs. This is a minor Duplicated Code smell.

### Mechanical floor

Pass — `pnpm --filter @warpgogol/site-kernel-checks build:check` and full test suite (689 tests) pass.

### Axis A — Structural correctness

- **Duplicated Code**: The "multiple placeholders in a single path are all expanded" test (`adr-0011-placeholder-expansion.test.ts:88-93`) repeats the exact same assertions as the `{slug}` test (line 80) and `{id}` test (line 84) with identical inputs. These are not additional cases — they are literal duplicates. Either remove the redundant test or use different paths that combine multiple placeholders in novel ways (e.g., `src/content/pages/{lang}/{slug}.md` which has two placeholders in one path).

### Axis B — DNA alignment

No issues. The diff is test-only; no DNA invariants are touched.

### Axis C — Ecosystem fit

No issues. Tests are correctly placed under `src/tests/` per the vitest config. ADR-0011 correctly references related RFCs. The ADR follows the lifecycle parity convention from RFC-0367.

### Axis D — Forward-only compliance

No issues. No compatibility shims or legacy paths.

### Axis E — Agent-facing clarity

No issues. Both test files carry `MODULE_CONTRACT` and `CHANGE_SUMMARY` scaffolding. Test names reference the diagnostic codes and behaviors being tested per ADR-0011's requirement.

### Axis F — Pragmatism

- **Scope discipline**: The "multiple placeholders" test adds no new coverage. It should either test a genuinely different combination or be removed.

### Axis G — Blind spots

No issues. Tests use temp directories with proper cleanup. No edge cases missed for the intended scope.

### Spec compliance

| Requirement from ADR-0011 | Status | Evidence |
| --- | --- | --- |
| Regression test for placeholder expansion (all 7 placeholders) | Done | `adr-0011-placeholder-expansion.test.ts` covers `{system}`, `{app}`, `{lang}`, `{route}`, `{slug}`, `{id}`, `{category}` |
| Regression test for preview image glob leak | Done | `adr-0011-preview-glob-leak.test.ts` covers orphaned, existing, and nested preview paths |
| Test name references diagnostic code or behavior | Done | Test names include "STALE-01", placeholder names |
| Bugs 3-5 already have tests from RFC implementations | Done | `markdown-twin-provenance.test.ts`, `page-markdown.test.ts`, `rfc-0614-public-well-known-bordbuch-conflict.test.ts` |
| ADR transitioned to implemented | Done | `status: implemented`, `implementedAt: 2026-07-31`, reviewer added |

### Questions for the author

1. The "multiple placeholders" test duplicates `{slug}` and `{id}` test inputs exactly — was this intentional, or should it test a path that combines multiple placeholders in a way not already covered by the individual tests?
