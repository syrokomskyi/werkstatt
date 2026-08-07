---
reviewId: REVIEW-CODE-2026-08-07-01
date: 2026-08-07
reviewer:
  skill: fo-review
  model: unknown
verdict: needs-revision
diffRange: eb26315^...HEAD
filesReviewed:
  - docs/adrs/adr-0030-site-content-validation-lives-in-validators-not-tests.md
  - packages/os/site-kernel-checks/src/pbp-migration.ts
  - packages/os/site-kernel-checks/src/command-tables/04-content-quality.ts
  - packages/pbp/src/__tests__/rfc-0468-register-and-coverage.test.ts
---

# Code Review: ADR-0030 — site content validation in validators not tests

### Verdict: Needs revision

The ADR decision is sound and the validator follows existing patterns, but the validator uses synchronous `readFileSync` while the rest of `site-kernel-checks` uses async `fs/promises`. There is also a missing ADR-0030 code trace in the new module's Compass scaffolding.

### Mechanical floor

Pass — `tsc --noEmit` passes for `@warpgogol/site-kernel-checks` and `@warpgogol/pbp`. All 920 + 240 tests pass.

### Axis A — Structural correctness

- **Synchronous I/O in an async validator**: `pbp-migration.ts` uses `readFileSync`/`existsSync` from `node:fs` while peer validators (`content-pbp.ts`, `pbp-profile.ts`) use `fs.access`/`fs.readdir` from `node:fs/promises`. The validator is declared `async` but performs blocking I/O. This is a Fowler **Divergent Change** smell — the module diverges from the established I/O pattern in the same package. Switch to `fs.readFile` and `fs.access` from `node:fs/promises`.

### Axis B — DNA alignment

No issues. No DNA invariants are directly touched by this change.

### Axis C — Ecosystem fit

- **Pipeline placement**: The command is registered in `04-content-quality.ts` with `supportsAllSites: true` — correct. However, the command is not added to any pipeline constant in `src/pipelines/`. Existing PBP validators (`pbp.profile.validate`, `pbp.content.validate`) ARE in the author pipeline. `pbp.migration.validate` should be added to the same pipeline to actually run during `build.prepare`/`build.check`. Without pipeline registration, the command exists but never executes automatically.

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
| Validator runs for every site through pipeline | Partial | Command registered but NOT added to pipeline constants |

### Questions for the author

1. Should `pbp.migration.validate` be added to `SITES_CHECK_AUTHOR_PIPELINE` or `APPS_BUILD_PREPARE_PIPELINE` so it actually runs during builds?
2. Why use synchronous `readFileSync` when the validator is `async` and peer validators use `fs/promises`?
