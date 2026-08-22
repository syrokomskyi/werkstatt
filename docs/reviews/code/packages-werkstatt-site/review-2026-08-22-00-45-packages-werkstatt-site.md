---
reviewId: REVIEW-CODE-2026-08-22-01
date: 2026-08-22
reviewer:
  skill: fo-review
  model: claude-sonnet-4-20250514
verdict: needs-revision
diffRange: 6942f14c...HEAD
filesReviewed:
  - packages/werkstatt-site/src/checks/canonical-url.ts
  - packages/werkstatt-site/src/checks/sitemap-placeholder.ts
  - packages/werkstatt-site/src/checks/sitemap-coverage.ts
  - packages/werkstatt-site/src/checks/command-tables/09b-build-artifacts-part2.ts
  - packages/werkstatt-site/src/checks/pipelines/sites-check-postbuild.ts
  - packages/werkstatt-site/src/checks/tests/sitemap-placeholder.test.ts
  - packages/werkstatt-site/src/checks/tests/sitemap-coverage.test.ts
  - packages/werkstatt-site/AGENTS.md
  - docs/rfcs/rfc-0907-sitemap-integrity-validators.md
---

# Code Review: 6942f14c...HEAD (RFC-0907 sitemap integrity validators)

### Verdict: Needs revision

Two minor findings: speculative exported interfaces without consumers and an unnecessary type assertion. The implementation is otherwise clean, follows existing patterns, and passes all mechanical checks.

### Mechanical floor

Pass — `pnpm --filter @warpgogol/werkstatt-site build:check` passes with zero errors. `rfc.validate --id RFC-0907` passes with zero violations. 12 unit tests pass.

### Axis A — Structural correctness

- **Speculative exported interfaces**: `SitemapPlaceholderResult` (sitemap-placeholder.ts:31-34) and `SitemapCoverageResult` (sitemap-coverage.ts:33-38) are exported but have no consumers. Per packages/AGENTS.md: "Do not export Zod schemas or types without at least one consumer." The existing `canonical-html-parity.ts` does not export its result type. These should be unexported (remove `export` keyword) or deleted entirely since the return type is structurally inferred.

- **Unnecessary type assertion**: `sitemap-coverage.ts:81-84` casts `manifest.i18n` as `{ supported?: Record<string, unknown> } | undefined`, but `SystemManifest.i18n` is already typed as `{ default: string; supported: Record<string, unknown> } | undefined` (system-manifest.ts:37-40). The cast is redundant and can be simplified to `Object.keys(manifest.i18n?.supported ?? { [defaultLang]: true })`.

### Axis B — DNA alignment

No issues. No DNA invariants are directly touched by this diff. DNA-58 (generated-file content determinism) is not relevant — these validators read but do not write generated files.

### Axis C — Ecosystem fit

No issues. Package boundaries are correct (werkstatt-site imports from werkstatt-shared and werkstatt engine). Pipeline placement is correct — both validators are post-build checks in `SITES_CHECK_POSTBUILD_PIPELINE` after `dist.sitemap.images.validate`. Command registration follows the existing pattern in `09b-build-artifacts-part2.ts`. AGENTS.md is updated. Compass XML (`docs/verification-plan.xml` vm-43) is already present and correct.

### Axis D — Forward-only compliance

No issues. No compatibility shims, no dual-paths, no legacy code maintained behind flags.

### Axis E — Agent-facing clarity

No issues. Both new source files carry `MODULE_CONTRACT` and `CHANGE_SUMMARY` scaffolding. Test files carry `MODULE_CONTRACT`. Variable and function names are descriptive. No ungrounded assertions.

### Axis F — Pragmatism

- **YAGNI result interfaces**: The `SitemapPlaceholderResult` and `SitemapCoverageResult` interfaces are not needed by any consumer. The return type can be inferred from the `diagnosticsResult` spread. These add dead code.

- **Minimality**: `extractSitemapUrls` reuse from `canonical-url.ts` is correct — avoids duplication. `diagnosticsResult` reuse is correct. `collectFiles` from `@warpgogol/werkstatt-shared/share/fs` is the canonical fs helper. Two separate commands are justified — different responsibilities (URL validity vs. set completeness).

### Axis G — Blind spots

No issues. Performance is negligible (small XML files). False positives are addressed in the RFC (SITEMAP-PH-01 has none, SITEMAP-COV-02 is warning). Edge cases are handled: no sitemap files → skip, empty sitemap → skip, missing system.md → skip. Migration path is automatic (new apps get the validators via pipeline).

### Spec compliance

| Requirement from RFC-0907 | Status | Evidence |
| --- | --- | --- |
| `sitemap.placeholder.validate` registered | Done | 09b-build-artifacts-part2.ts:899-910 |
| `sitemap.coverage.validate` registered | Done | 09b-build-artifacts-part2.ts:911-921 |
| SITEMAP-PH-01 for bracket placeholders | Done | sitemap-placeholder.ts:73-80 |
| SITEMAP-COV-01 for missing pages | Done | sitemap-coverage.ts:113-121 |
| SITEMAP-COV-02 for unexpected URLs (warning) | Done | sitemap-coverage.ts:123-131 |
| Both in SITES_CHECK_POSTBUILD_PIPELINE after dist.sitemap.images.validate | Done | sites-check-postbuild.ts:57-59 |
| output.sitemap boolean and object forms | Done | sitemap-coverage.ts:41-47 |
| Unit tests | Done | 12 tests pass |
| AGENTS.md documentation | Done | packages/werkstatt-site/AGENTS.md:109-110 |

### Questions for the author

1. Should the `SitemapPlaceholderResult` and `SitemapCoverageResult` interfaces be removed or un-exported since no consumer imports them?
2. Can the type assertion on `manifest.i18n` in `sitemap-coverage.ts:81-84` be simplified since `SystemManifest.i18n` is already typed?
