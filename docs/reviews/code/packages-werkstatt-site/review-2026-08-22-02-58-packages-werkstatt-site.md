---
reviewId: REVIEW-CODE-2026-08-22-01
date: 2026-08-22
reviewer:
  skill: fo-review
  model: unknown
verdict: needs-revision
diffRange: af325ff5^...HEAD
filesReviewed:
  - packages/werkstatt-site/src/checks/host-canonical.ts
  - packages/werkstatt-site/src/checks/trailing-slash.ts
  - packages/werkstatt-site/src/checks/tests/host-canonical.test.ts
  - packages/werkstatt-site/src/checks/tests/trailing-slash.test.ts
  - packages/werkstatt-site/src/checks/command-tables/31-public-surface.ts
  - packages/werkstatt-site/src/checks/pipelines/sites-check-postbuild.ts
  - packages/werkstatt-site/AGENTS.md
  - docs/rfcs/rfc-0908-host-canonicalization-and-url-normalization-validators.md
---

# Code Review: af325ff5^...HEAD (RFC-0908 host canonicalization and URL normalization validators)

### Verdict: Needs revision

The implementation is functionally correct — all 16 tests pass, types check clean, and the commands are properly registered and wired into the pipeline. However, there are minor structural findings: dead code (unused result interfaces and variables), a redundant ternary branch, and an overly broad type in the `TrailingSlashResult` interface.

### Mechanical floor

Pass — `pnpm --filter @warpgogol/werkstatt-site build:check` (tsc --noEmit) exits 0. All 16 RFC-0908 tests pass. 3 pre-existing test failures in unrelated modules (`resolve-page-route.test.ts`, `golden-fixtures.test.ts`) are not caused by this diff.

### Axis A — Structural correctness

1. **Dead code — unused `HostCanonicalResult` interface and `result` variable** in `host-canonical.ts:288-291`. The `result` variable is constructed but never passed anywhere — `passResult()` at line 292 does not accept a `data` parameter. The `HostCanonicalResult` interface at lines 35-38 is only used for this dead variable. Both should be removed.

2. **Dead code — unused `TrailingSlashResult` interface and `result` variable** in `trailing-slash.ts:151-154`. Same pattern: `result` is constructed but `passResult()` at line 155 does not use it. The `TrailingSlashResult` interface at lines 36-39 is only used for the dead variable and for the `policy` type annotation at line 87. The `policy` variable itself (line 87) is only used in the template string at line 157, which is also inside the dead `result` block. All of these should be removed or the result should actually be returned.

3. **Redundant ternary** in `host-canonical.ts:264-266`. The `redirectDescription` ternary has identical branches:
   ```ts
   const redirectDescription = isApexCanonical
     ? `${nonCanonical} → ${canonicalHost}`
     : `${nonCanonical} → ${canonicalHost}`;
   ```
   Both branches produce the same string. The ternary should be replaced with a simple assignment: `const redirectDescription = \`${nonCanonical} → ${canonicalHost}\`;`.

4. **Overly broad type** — `TrailingSlashResult["policy"]` at `trailing-slash.ts:37` declares `"always" | "never" | "ignore"` but the code only ever uses `"always"` (line 87). The RFC assumes `trailingSlash: "always"` as a literal type. The union type is speculative generality — it should be `"always"` (or just remove the interface entirely per finding 2).

### Axis B — DNA alignment

No issues. DNA-86 is correctly added to `docs/architecture-dna.md:359-361` and references both `host.canonical.config.validate` (HOST-CANON-01..03) and `trailing.slash.config.validate` (SLASH-01..03). The implementation matches the invariant's requirements.

### Axis C — Ecosystem fit

No issues. Commands are registered in the correct command table (`31-public-surface.ts`), wired into the correct pipeline (`SITES_CHECK_POSTBUILD_PIPELINE` after `redirect.shadow.validate` and before `robots.page.validate`), and use the standard `diagnosticsResult`/`passResult` helpers. `AGENTS.md` is updated. Generated artifacts were regenerated and `ecosystem.manifest.validate` passes with 0 errors.

### Axis D — Forward-only compliance

No issues. No compatibility shims, no legacy paths, no dual-paths.

### Axis E — Agent-facing clarity

No issues. Both new source files carry `MODULE_CONTRACT` and `CHANGE_SUMMARY` scaffolding. Test files also carry `MODULE_CONTRACT`. Variable and function names are descriptive. The `nonCanonicalHost` and `isApex` helper names clearly express their purpose.

### Axis F — Pragmatism

1. **Speculative generality in `TrailingSlashResult["policy"]`** — the `"never" | "ignore"` variants are not used anywhere in the code or RFC. This is YAGNI. Either narrow to `"always"` or remove the interface (see Axis A finding 2).

2. **Minimal command surface** — both commands earn their existence as separate commands per the RFC. They validate distinct concerns (host canonicalization vs trailing-slash normalization) and are independently useful.

### Axis G — Blind spots

1. **False positives — `HOST_REDIRECT_PATTERNS` in `host-canonical.ts:187-193`** are broad regexes (e.g. `Response\.redirect\s*\(` matches any redirect, not just host redirects). This means any Worker source that uses `Response.redirect()` for any purpose (e.g. trailing-slash normalization) will pass the host canonicalization check. The validator may report false negatives (pass when it should fail). The RFC does not document this trade-off. Consider tightening the patterns or documenting the limitation in the MODULE_CONTRACT.

2. **Edge case — `extractRoutesFromToml` in `host-canonical.ts:133-153`** uses a regex-based TOML parser that won't handle multi-line arrays, inline tables, or nested route objects. This is acceptable for the common case but should be documented as a limitation.

3. **Edge case — empty `_redirects` file** in `trailing-slash.ts:118-132`: if `_redirects` exists but is empty, `parseRedirectRules("")` returns `[]`, and `hasTrailingSlashNormalization([])` returns `false`, correctly emitting SLASH-01. This is handled correctly.

### Spec compliance

| Requirement from RFC-0908 | Status | Evidence |
| --- | --- | --- |
| `host.canonical.config.validate` registered with scope `app`, `supportsAllSites: true` | Done | `31-public-surface.ts:420-436` |
| `trailing.slash.config.validate` registered with scope `app`, `supportsAllSites: true` | Done | `31-public-surface.ts:438-447` |
| HOST-CANON-01 emitted for apex canonical without www→apex redirect | Done | `host-canonical.test.ts:72-88` |
| HOST-CANON-02 emitted for www canonical without apex→www redirect | Done | `host-canonical.test.ts:109-125` |
| HOST-CANON-03 (warning) for missing/ambiguous site URL | Done | `host-canonical.test.ts:127-159` |
| SLASH-01 emitted when no normalization redirects | Done | `trailing-slash.test.ts:59-74, 143-157` |
| SLASH-02 emitted for inconsistent build.format | Done | `trailing-slash.test.ts:92-107` |
| SLASH-03 (warning) for undeclared build.format | Done | `trailing-slash.test.ts:125-141` |
| Both commands in SITES_CHECK_POSTBUILD_PIPELINE after redirect.shadow.validate | Done | `sites-check-postbuild.ts:43-48` |
| DNA-86 added to architecture-dna.md | Done | `docs/architecture-dna.md:359-361` |
| AGENTS.md documents both commands | Done | `packages/werkstatt-site/AGENTS.md:96-97` |
| Reuses `parseRedirectRules` from werkstatt-shared | Done | `trailing-slash.ts:31` |
| Reuses `readAstroSiteUrl` | Done | `host-canonical.ts:29` |
| Reuses `diagnosticsResult` | Done | both files |
| Reuses `resolveDeploymentAdapter` | Done | `host-canonical.ts:31` |

### Questions for the author

1. The `HostCanonicalResult` and `TrailingSlashResult` interfaces and their `result` variables are constructed but never returned — was this intentional (for future use) or leftover from an earlier draft?
2. The `HOST_REDIRECT_PATTERNS` regexes match any `Response.redirect()` call, not just host-based redirects. Is this acceptable as a heuristic, or should the patterns be tightened to require host comparison context?
3. The `redirectDescription` ternary at line 264-266 has identical branches — was there originally a different format for the www-canonical case?
