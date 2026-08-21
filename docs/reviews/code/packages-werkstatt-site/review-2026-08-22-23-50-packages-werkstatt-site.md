---
reviewId: REVIEW-CODE-2026-08-22-01
date: 2026-08-22
reviewer:
  skill: fo-review
  model: claude-sonnet-4-20250514
verdict: needs-revision
diffRange: a48bc9df...HEAD
filesReviewed:
  - packages/werkstatt-site/src/domain/share/astro/page-handler/resolve-route.ts
  - packages/werkstatt-site/src/checks/canonical-html-parity.ts
  - packages/werkstatt-site/src/checks/canonical-url.ts
  - packages/werkstatt-site/src/checks/command-tables/09b-build-artifacts-part2.ts
  - packages/werkstatt-site/src/checks/pipelines/sites-check-postbuild.ts
  - packages/werkstatt-site/src/checks/tests/canonical-html-parity.test.ts
---

# Code Review: a48bc9df...HEAD (RFC-0906 implementation)

### Verdict: Needs revision

The implementation is architecturally sound and correctly enforces DNA-85. However, there are two duplicated functions that should reuse existing helpers from `helpers.ts`, one unused variable, and an inconsistent redirect-detection pattern between the two validators.

### Mechanical floor

Pass — `pnpm --filter @warpgogol/werkstatt-site run build:check` passes. Unit tests pass (8/8 in the new test file; 3 pre-existing failures in unrelated test files).

### Axis A — Structural correctness

- **Unused variable `checkedPages`** in `canonical-html-parity.ts:96` — declared and incremented (`checkedPages++`) but never read or returned. Dead code. Remove it.
- **Duplicated `isHtmlRedirectPage`** in `canonical-html-parity.ts:42-46` — the same function already exists in `packages/werkstatt-site/src/checks/audit/validators/helpers.ts:74-79`. The new file re-implements it instead of importing the existing one. Per packages/AGENTS.md: "Do not duplicate canonical regex patterns across packages."

### Axis B — DNA alignment

No issues. DNA-85 (canonical URL trailing-slash parity gate) is directly enforced by the new validator and the runtime fix. The `canonicalPageUrl` usage with `trailingSlash: "always"` is the single source of truth.

### Axis C — Ecosystem fit

- **Duplicated canonical extraction regex** — `canonical-html-parity.ts:38` defines `extractCanonicalHref` with the same regex pattern as `helpers.ts:82` (`extractCanonicalPath`). While the helpers version returns a pathname and the new version returns the full href, the regex is duplicated. Consider extracting the raw href extraction into a shared helper or importing `extractCanonicalPath` and adapting.
- **Inconsistent redirect detection in CANON-04** — `canonical-url.ts:199` only checks `/<meta[^>]+http-equiv=["']refresh["']/i` but `canonical-html-parity.ts:44` checks both `http-equiv="refresh"` AND `window.location.(replace|href)`. The same `isHtmlRedirectPage` check should be used in both places for consistency. A page with a JS redirect but no meta refresh would be skipped by `canonical.html-parity.validate` but not by `canonical.url.validate`, producing inconsistent CANON-04 warnings.

### Axis D — Forward-only compliance

No issues. The runtime fix directly replaces `localizeUrl` with `canonicalPageUrl` — no dual-path, no backward compatibility shim.

### Axis E — Agent-facing clarity

No issues. `MODULE_CONTRACT` and `CHANGE_SUMMARY` scaffolding present on the new file. RFC-0906 references are clear. Variable names are descriptive.

### Axis F — Pragmatism

- **`checkedPages` variable** — YAGNI; tracked but never used. Remove it.
- **`isHtmlRedirectPage` duplication** — a one-line import from `helpers.ts` replaces a 5-line reimplementation.

### Axis G — Blind spots

No issues. Performance is negligible (same `dist/client/**/*.html` scan pattern as `seo.domain.validate` and `csp.origins.validate`). Edge cases handled: missing `dist/client/`, redirect pages, files with no canonical/og:url tags.

### Spec compliance

| Requirement from RFC-0906 | Status | Evidence |
| --- | --- | --- |
| Runtime fix: pageUrl uses canonicalPageUrl | Done | resolve-route.ts:1122-1124 |
| New canonical.html-parity.validate command | Done | canonical-html-parity.ts, command-tables/09b:766 |
| CANON-HTML-01..03 rules | Done | canonical-html-parity.ts:108,117,126 |
| CANON-04 in canonical.url.validate | Done | canonical-url.ts:184-215 |
| Pipeline integration | Done | sites-check-postbuild.ts:50 |
| DNA-85 in architecture-dna.md | Done | docs/architecture-dna.md:355 |
| Unit tests | Done | 8/8 pass |
| AGENTS.md documentation | Done | packages/werkstatt-site/AGENTS.md:106-107 |

### Questions for the author

1. Why does `canonical-html-parity.ts` re-implement `isHtmlRedirectPage` instead of importing it from `helpers.ts`? The existing helper at `audit/validators/helpers.ts:74` is identical.
2. Why is `checkedPages` tracked but never used in the diagnostics output or summary?
3. Why does the CANON-04 check in `canonical-url.ts:199` use a narrower redirect detection (only `http-equiv="refresh"`) than `canonical-html-parity.ts:44` (which also checks `window.location.replace|href`)?
