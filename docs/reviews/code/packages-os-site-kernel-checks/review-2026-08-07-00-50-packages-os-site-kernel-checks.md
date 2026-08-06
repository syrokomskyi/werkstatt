---
reviewId: REVIEW-CODE-2026-08-07-01
date: 2026-08-07
reviewer:
  skill: fo-review
  model: claude-sonnet-4-20250514
verdict: needs-revision
diffRange: 5eacce26...HEAD
filesReviewed:
  - packages/os/site-kernel-checks/src/checks/tokens.ts
  - packages/os/site-kernel-checks/src/command-tables/04-content-quality.ts
  - packages/os/site-kernel-checks/src/tests/tokens-colors-lint.test.ts
  - packages/os/site-kernel-checks/AGENTS.md
---

# Code Review: 5eacce26...HEAD (RFC-0725)

### Verdict: Needs revision

Implementation is functionally correct — typecheck passes, 887 tests pass, rfc.validate passes, all 9 acceptance criteria met. One minor finding on duplicated I/O in packages-level scan. The code is well-structured with good decomposition into reusable helpers.

### Mechanical floor

Pass — `pnpm --filter @warpgogol/site-kernel-checks run build:check` (tsc --noEmit) exits 0. `pnpm --filter @warpgogol/site-kernel-checks run test` — 133 test files, 887 tests pass. `rfc.validate --id RFC-0725 --json` — 0 errors.

### Axis A — Structural correctness

No issues. `ColorLintFinding` interface is exported and used consistently. Helpers (`scanCssFileForColors`, `scanCssFileForUndefinedTokens`, `scanPackagesUiCss`) are well-decomposed with clear single responsibilities. No `any` types, no magic numbers, no dead code. Error handling for missing `packages/ui/src` is graceful (catch + warn + return `[]`).

### Axis B — DNA alignment

No issues. DNA-10 ("No hardcoded design tokens") is strengthened — the RFC extends `tokens.colors.lint` to verify undefined `--ds-*` tokens against `TOKEN_NAME_SET`, catching a class of violations that previously required a full build to discover.

### Axis C — Ecosystem fit

No issues. Package boundaries respected (`site-kernel-checks` imports from `@warpgogol/tokens`). Command table `reads` and `description` updated. AGENTS.md updated with new `tokens.colors.lint` description. No pipeline changes needed — command already runs in `sites-check-author`.

### Axis D — Forward-only compliance

No issues. Return type extended additively (`findings` count preserved alongside new `violations` array). Old inline color scanning code replaced by `scanCssFileForColors` helper — no legacy path retained. No shims or dual-paths.

### Axis E — Agent-facing clarity

No issues. New test file carries `MODULE_CONTRACT` and `CHANGE_SUMMARY` scaffolding. `tokens.ts` `CHANGE_SUMMARY` updated with RFC-0725 entry. Variable and function names are self-documenting.

### Axis F — Pragmatism

No issues. Existing helpers (`stripBlockCommentsPreserveLength`, `stripUrlsPreserveLength`, `getLineColumn`, `collectFilesByExtensions`) are reused. No new dependencies. `scanCssFileForColors` is shared between app-level and packages-level scans — correct decomposition since app-level only needs color checking while packages-level needs both.

### Axis G — Blind spots

**Finding G-1 (minor):** `scanCssFileForColors` and `scanCssFileForUndefinedTokens` each independently read the file and strip comments/URLs. For packages-level files, this means double I/O — `readFile` + `stripBlockCommentsPreserveLength` + `stripUrlsPreserveLength` runs twice per file. At ~50 files this is negligible (<100ms), but the two functions could share a single read-and-strip pass. Consider merging into a single `scanCssFile(filePath, tokenNameSet)` that returns both color and undefined-token findings from one cleaned text.

### Spec compliance

| Requirement from RFC-0725 | Status | Evidence |
| --- | --- | --- |
| Scan packages/ui/src/**/*.css | Done | `scanPackagesUiCss` at tokens.ts:168-196 |
| Report undefined --ds-* tokens | Done | `scanCssFileForUndefinedTokens` at tokens.ts:144-166 |
| reason: "undefined-token" in output | Done | tokens.ts:162, `ColorLintFinding.reason` field |
| Exit code 1 on undefined tokens | Done | tokens.ts:253, `exitCode: allFindings.length > 0 ? 1 : 0` |
| Missing packages/ui/src → warning | Done | tokens.ts:178-181, catch + warn + return [] |
| Existing raw color checks unchanged | Done | Test "detects raw hex and rgba colors in app styles" passes |
| Unit tests cover new functionality | Done | 6 tests in tokens-colors-lint.test.ts, all pass |
| Command description updated | Done | 04-content-quality.ts:204-205 |
| rfc.validate passes | Done | 0 errors confirmed |

### Questions for the author

1. The RFC §3 says "The same `ignoredDefinitionPatterns` logic applies to packages-level scan." The implementation does not apply `ignoredDefinitionPatterns` to packages-level files. In practice this is harmless (the patterns are app-relative paths like `src/styles/global.css` that don't exist in `packages/ui/src/`), but should the code explicitly skip packages-level files matching equivalent patterns for forward safety?
