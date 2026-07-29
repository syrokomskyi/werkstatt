---
reviewId: REVIEW-CODE-2026-07-29-01
date: 2026-07-29
reviewer:
  skill: fo-review
  model: unknown
verdict: needs-revision
diffRange: fc40e5c...HEAD
filesReviewed:
  - packages/os/site-kernel-checks/src/diagnostics/rules/content-surface.ts
  - packages/os/site-kernel-checks/src/content-links.ts
  - packages/os/site-kernel-checks/src/checks/mirroring.ts
  - packages/os/site-kernel-checks/src/page-blocks-mirror.ts
  - packages/os/site-kernel-checks/src/public-surface/aggregate.ts
  - packages/os/site-kernel-checks/src/surface-translation.ts
  - packages/os/site-kernel-checks/src/diagnostics/dsl04-baseline.generated.yaml
  - packages/os/site-kernel-checks/src/tests/content-links.test.ts
  - packages/os/site-kernel-checks/src/tests/mirroring.test.ts
  - packages/os/site-kernel-checks/src/tests/page-blocks-mirror.test.ts
  - packages/os/site-kernel-checks/AGENTS.md
---

# Code Review: fc40e5c...HEAD (RFC-0576 + RFC-0577)

### Verdict: Needs revision

Two findings require attention: a `MIRROR-01` ruleId misuse in an error fallback path and a `Violation` interface field name inconsistency. The core migration is sound — canonical diagnostics flow correctly, severity distinctions are preserved, and fixHints are actionable.

### Mechanical floor

Pass — `pnpm --filter @warpgogol/site-kernel-checks run build:check` passes. `diagnostic.shape.lint` shows no DSL-02/DSL-04 violations for the migrated validators. 573/575 tests pass (2 pre-existing `workspace-write-boundary.test.ts` failures unrelated to this diff).

### Axis A — Structural correctness

- **Finding A-1: `MIRROR-01` ruleId used for non-MIRROR-01 error.** In `page-blocks-mirror.ts:218-226`, the `requireAstroSitePaths` catch block emits a diagnostic with `ruleId: "MIRROR-01"` for a configuration error (missing `astro.config` / `appDirectory`). MIRROR-01 is defined as "Localized page block missing or type mismatch vs default-language twin" — a config error is not a block mismatch. This misleads agents parsing `ruleId` to determine the fix pattern. Consider using a more appropriate ruleId (e.g., a generic `MIRROR-CONFIG` or omitting the ruleId if the framework allows), or at minimum document that MIRROR-01 is overloaded for config errors.

- **Finding A-2: `Violation.rule` field name inconsistency.** In `content-links.ts:161-167`, the internal `Violation` interface still uses `rule: string` while the `BlockMirrorViolation` interface in `page-blocks-mirror.ts:40` was renamed to `ruleId: string`. The mapping at `content-links.ts:305` (`ruleId: v.rule`) bridges the gap, but the inconsistency is a minor Fowler "Mysterious Name" smell — two internal interfaces in the same migration use different field names for the same concept.

### Axis B — DNA alignment

No issues. The migration touches DNA-11 (language mirroring) and the canonical diagnostic model (RFC-0203). Both are respected: severity distinctions preserve the default-language error vs non-default warning behavior, and all ruleIds are registered in the rule registry.

### Axis C — Ecosystem fit

No issues. `AGENTS.md` command table entries updated for `mirroring.validate` and `page.blocks.mirror.validate`. `content.links.validate` added to the table. `content-links.ts` removed from DSL-04 baseline. All ruleIds registered in `content-surface.ts` before use.

### Axis D — Forward-only compliance

No issues. Legacy `resultFromViolations` replaced with `diagnosticsResult` — no compatibility shim. `PageBlocksMirrorResult` interface deleted, not maintained behind a flag. The `Violation` interface in `content-links.ts` is an internal type that could be fully replaced with `Diagnostic` to complete the forward-only migration, but this is a minor smell, not a shim.

### Axis E — Agent-facing clarity

No issues. fixHints are actionable and include copy-pasteable commands (RFC-0577) and specific file paths (RFC-0576). `MODULE_CONTRACT` and `CHANGE_SUMMARY` headers updated in modified files. Test helpers (`diagnosticsOf`) are readable and correctly typed.

### Axis F — Pragmatism

No issues. The migration is scoped to exactly the files listed in the RFCs. No speculative generality. The `resolveProseSource` helper (RFC-0577) is minimal — 8 lines, single-purpose, with graceful fallback.

### Axis G — Blind spots

- **Finding G-1: `existsSync` in async context.** `resolveProseSource` in `aggregate.ts:54` uses `existsSync` from `node:fs` inside an async function (`runPublicSurfaceLint`). This is a synchronous I/O call in an async code path. The impact is negligible (single `stat` syscall), but the rest of the file uses `context.io.exists` for filesystem checks. This inconsistency could cause issues in test environments that mock `context.io` but not `node:fs`. Consider using `context.io.exists` or `readFile` with a catch block for consistency with the rest of the validator.

### Spec compliance

| Requirement | Status | Evidence |
| --- | --- | --- |
| RFC-0576: LINK-01..03 registered | Done | `content-surface.ts:498-513` |
| RFC-0576: MIRROR-MISSING registered | Done | `content-surface.ts:515-520` |
| RFC-0576: MIRROR-01..03 registered | Done | `content-surface.ts:522-537` |
| RFC-0576: content.links.validate emits canonical diagnostics | Done | `content-links.ts:304-313` |
| RFC-0576: mirroring.validate emits canonical diagnostics with severity distinction | Done | `mirroring.ts:122-139` |
| RFC-0576: page.blocks.mirror.validate emits canonical diagnostics | Done | `page-blocks-mirror.ts:274-275` |
| RFC-0576: parseUrl normalizes trailing slashes | Done | `content-links.ts:185-187` |
| RFC-0576: content-links.ts removed from DSL-04 baseline | Done | `dsl04-baseline.generated.yaml` |
| RFC-0577: PSEO-GLOSS-01 fixHint includes restamping command | Done | `surface-translation.ts:396,408` |
| RFC-0577: PUBTXT-07 fixHint resolves source file | Done | `aggregate.ts:50-58,292-299` |
| RFC-0577: PUBTXT-07 falls back to generic fixHint | Done | `aggregate.ts:299` |

### Questions for the author

1. Should the `requireAstroSitePaths` catch block in `page-blocks-mirror.ts:218` use a different ruleId than `MIRROR-01` for a configuration error, or is overloading MIRROR-01 intentional?
2. Is the `Violation.rule` field name in `content-links.ts` left intentionally for backward compatibility, or should it be renamed to `ruleId` for consistency with the rest of the migration?
3. Should `resolveProseSource` use `context.io.exists` instead of `existsSync` to stay consistent with the rest of `aggregate.ts` and support test mocking?
