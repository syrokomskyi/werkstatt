---
reviewId: REVIEW-CODE-2026-08-07-01
date: 2026-08-07
reviewer:
  skill: fo-review
  model: unknown
verdict: approved
diffRange: eb26315^...HEAD
filesReviewed:
  - docs/adrs/adr-0030-site-content-validation-lives-in-validators-not-tests.md
  - packages/os/site-kernel-checks/src/pbp-migration.ts
  - packages/os/site-kernel-checks/src/command-tables/04-content-quality.ts
  - packages/pbp/src/__tests__/rfc-0468-register-and-coverage.test.ts
---

# Code Review: ADR-0030 — site content validation in validators not tests

### Verdict: Approved

The ADR decision is sound and the validator follows existing patterns. Both findings (sync I/O, missing pipeline registration) have been fixed in commit 60193085.

### Mechanical floor

Pass — `tsc --noEmit` passes for `@warpgogol/site-kernel-checks` and `@warpgogol/pbp`. All 920 + 240 tests pass.

### Axis A — Structural correctness

No issues. Fixed in 60193085 — switched to async `node:fs/promises`.

### Axis B — DNA alignment

No issues. No DNA invariants are directly touched by this change.

### Axis C — Ecosystem fit

No issues. Fixed in 60193085 — added to `SITES_CHECK_AUTHOR_PIPELINE`.

### Axis D — Forward-only compliance

No issues. The old test is deleted, not maintained alongside the new validator. No compatibility shims.

### Axis E — Agent-facing clarity

- **ADR trace**: The `CHANGE_SUMMARY` in `pbp-migration.ts` references `ADR-0030` — good. The `MODULE_CONTRACT` purpose is clear. No issues.

### Axis F — Pragmatism

- **Duplicated `readYaml` helper**: The `readYaml` function (wrap in frontmatter delimiters + `parseMarkdownFrontmatter`) is duplicated from the deleted test. Check if `site-kernel-content` or a shared utility already provides YAML parsing — if so, use it instead. If not, this is acceptable since the helper is small and local.

### Axis G — Blind spots

- **Empty state**: A new site with no `owner-decision-register.yaml` or `migration-coverage-report.yaml` will get two "file not found" violations. This is correct behavior — the files are mandatory per RFC-0468. No false positive risk.
- **False positives**: The validator checks structural invariants only (schemaVersion, field presence, sequential IDs, status="open", coverage=100%). These are deterministic — no false positive risk.

### Spec compliance

| Requirement from ADR-0030 | Status | Evidence |
| --- | --- | --- |
| Site content validation in site-kernel-checks | Done | `pbp-migration.ts` created |
| No tests in packages/* hardcode site paths | Done | Test deleted |
| `pbp.migration.validate` replaces deleted test | Done | Command registered in `04-content-quality.ts` |
| Validator runs for every site through pipeline | Done | Added to SITES_CHECK_AUTHOR_PIPELINE in 60193085 |

### Questions for the author

No outstanding questions.
