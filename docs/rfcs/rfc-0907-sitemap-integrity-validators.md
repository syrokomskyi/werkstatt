---
id: RFC-0907
title: "Sitemap integrity validators: placeholder expansion and route coverage"
status: accepted
kind: command
scope: workspace
owners:
  - architecture
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-08-21
updatedAt: 2026-08-22
enhancedAt: 2026-08-22
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - DNA-58
  - RFC-0317
  - RFC-0318
  - RFC-0383
  - RFC-0906
versionBump: minor
commands:
  proposed:
    - sitemap.placeholder.validate
    - sitemap.coverage.validate
  added: []
  changed: []
  removed: []
appsImpacted: []
packagesImpacted:
  - "@warpgogol/werkstatt-site"
liveSpec: true
successSignals:
  - "sitemap.placeholder.validate detects unresolved [slug], [version], or other bracket placeholders in sitemap XML files"
  - "sitemap.coverage.validate detects indexable pages missing from the sitemap"
  - "sitemap.coverage.validate detects sitemap URLs that do not correspond to any indexable page"
  - "Both validators run in SITES_CHECK_POSTBUILD_PIPELINE without false positives on warpgogol-com"
nonGoals:
  - "Do not generate sitemaps — that is owned by the sitemap generator in codegen"
  - "Do not validate canonical URL correctness — that is owned by canonical.url.validate (RFC-0317)"
  - "Do not validate canonical trailing-slash parity — that is owned by canonical.html-parity.validate (RFC-0906)"
  - "Do not validate noindex pages in sitemap — that is owned by robots.page.validate (RFC-0165)"
  - "Do not validate sitemap-images parity — that is owned by dist.sitemap.images.validate (RFC-0172)"
  - "Do not validate SEO link structure / orphan pages — that is owned by surface.graph.validate (RFC-0383)"
---

# RFC-0907: Sitemap integrity validators: placeholder expansion and route coverage

## Context

The workshop generates sitemap XML files from the `system.md` manifest during the build pipeline. The sitemap generator iterates over declared pages, computes canonical URLs via `canonicalPageUrl` (RFC-0317), and emits `sitemap.xml` (index) plus per-language sub-sitemaps.

Google Search Console data for `warpgogol.com` (August 2026) revealed two sitemap integrity problems:

1. **Unresolved placeholders:** sitemap XML files contained URLs with unresolved bracket placeholders like `[slug]` and `[version]`. These appear when the sitemap generator uses a route template (e.g., `/leistungen/[slug]`) instead of the expanded route slug (e.g., `/leistungen/beratung`). Google treats these as invalid URLs and drops them from the index. The root cause is that the sitemap generator iterates over route templates instead of resolved route slugs for certain page types (surface pages, PSEO pages).

2. **Missing pages:** indexable pages declared in `system.md` were absent from the sitemap. Google could not discover them via the sitemap, delaying indexing. The root cause is that the sitemap generator skipped certain page types (e.g., surface pages with `depth > 0`) or had conditional logic that excluded pages based on `output.sitemap` settings that were not properly resolved.

The existing `canonical.url.validate` (RFC-0317, CANON-01..03) checks that sitemap URLs are in the expected canonical set — but it does not check for unresolved placeholders (the placeholder URL is in the expected set if the expected set itself contains placeholders). The existing `seo.technical.validate` (RFC-0074) checks sitemap presence — but not completeness.

## Problem

Two classes of sitemap integrity issues are undetectable before deployment today:

**1. Unresolved placeholders in sitemap URLs.** The sitemap generator may emit URLs containing `[slug]`, `[version]`, `[id]`, or other bracket placeholders when it fails to expand a route template. These are always invalid — no real page exists at a URL containing `[slug]`. No existing validator checks for this.

**2. Sitemap coverage gaps.** The sitemap may be missing indexable pages or contain URLs that do not correspond to any indexable page. The existing `canonical.url.validate` checks sitemap URLs against the expected canonical set, but only in one direction (sitemap URLs not in expected set → CANON-01 warning). It does not check the reverse: expected indexable pages that are missing from the sitemap.

Both problems are deterministic: the `system.md` manifest declares all pages and their indexability, and the sitemap XML files are available at build time. A validator can cross-reference them.

## Decision

The kernel gains two new post-build validators:

1. **`sitemap.placeholder.validate`** — scans all `sitemap*.xml` files in `dist/client/` for URLs containing unresolved bracket placeholders (`[slug]`, `[version]`, `[id]`, `[lang]`, or any `[...]` pattern). Emits errors for each placeholder URL found.

2. **`sitemap.coverage.validate`** — cross-references sitemap URLs against the set of indexable pages declared in `system.md`. Emits errors for:
   - Indexable pages missing from the sitemap (SITEMAP-COV-01).
   - Sitemap URLs that do not correspond to any indexable page (SITEMAP-COV-02, warning — may be intentionally included non-indexable pages).

Both validators are integrated into `SITES_CHECK_POSTBUILD_PIPELINE` after `dist.sitemap.images.validate`, grouping all sitemap-related validators together.

## Architectural fit

**Architecture DNA:**

- **DNA-58** (Generated-file content determinism) — complements sitemap integrity: the sitemap MUST contain exactly the indexable pages declared in `system.md`, with fully expanded URLs (no placeholders). Unresolved placeholders and coverage gaps are determinism violations. This RFC does not establish a new DNA invariant; it enforces existing DNA-58 principles for sitemap files specifically.

**Existing RFCs:**

- **RFC-0317** (`canonical.url.validate`, CANON-01..03) — this RFC complements it. `canonical.url.validate` checks that sitemap URLs are in the expected canonical set (CANON-01). `sitemap.placeholder.validate` checks that sitemap URLs do not contain unresolved placeholders. `sitemap.coverage.validate` checks the reverse direction (expected pages missing from sitemap).
- **RFC-0318** (`public.orphans.validate`, `redirect.map.validate`) — this RFC is part of the same public-surface validation family.
- **RFC-0383** (`surface.graph.validate`) — checks SEO link structure / orphan pages. This RFC checks sitemap coverage, which is a different concern (sitemap vs. internal links).
- **RFC-0165** (`robots.page.validate`) — checks that noindex pages do not appear in the sitemap. This RFC checks that all indexable pages DO appear in the sitemap.

**Site OS operator model:**

- Both commands are post-build validators registered in `packages/werkstatt-site/src/checks/`.
- Both follow the existing pattern: read `dist/client/sitemap*.xml`, load `system.md` manifest, emit `Diagnostic[]` via `diagnosticsResult`.
- Both are integrated into `SITES_CHECK_POSTBUILD_PIPELINE`.

## Design

### CLI surface

```sh
# Sitemap placeholder detection — post-build, scans dist/client/sitemap*.xml
pnpm exec werkstatt run sitemap.placeholder.validate --app warpgogol-com
pnpm exec werkstatt run sitemap.placeholder.validate --app warpgogol-com --json

# Sitemap coverage — post-build, cross-references sitemap vs system.md
pnpm exec werkstatt run sitemap.coverage.validate --app warpgogol-com
pnpm exec werkstatt run sitemap.coverage.validate --app warpgogol-com --json
```

Both commands accept `--app <id>` (optional, single-site scope) and `--json` (machine-readable output). Both set `supportsAllSites: true`. No additional flags.

### TypeScript contracts

**`sitemap.placeholder.validate`** — new file: `packages/werkstatt-site/src/checks/sitemap-placeholder.ts`

```ts
interface SitemapPlaceholderResult {
  checkedUrls: number;
  placeholderUrls: number;
}

// Rules:
// SITEMAP-PH-01 (unresolved bracket placeholder in sitemap URL) — severity: error
//   A URL in a sitemap XML file contains an unresolved bracket placeholder
//   like [slug], [version], [id], [lang], or any [...] pattern.
//   These URLs are always invalid — no real page exists at a URL with brackets.

// Logic:
// 1. Glob dist/client/sitemap*.xml (includes sitemap.xml index and sub-sitemaps)
//    Note: most postbuild validators read from dist/client/ (e.g. seo.technical.validate,
//    robots.page.validate). canonical.url.validate reads from public/ — this is the
//    exception, not the convention. These validators follow the majority dist/client/ convention.
// 2. For each sitemap file:
//    a. Parse XML, extract all <loc> URLs
//    b. For each URL, check for bracket placeholder pattern: /\[[a-zA-Z0-9_-]+\]/
//    c. If found → SITEMAP-PH-01 error with the URL and sitemap file path
// 3. Return diagnostics
```

**`sitemap.coverage.validate`** — new file: `packages/werkstatt-site/src/checks/sitemap-coverage.ts`

```ts
interface SitemapCoverageResult {
  expectedPages: number;
  sitemapUrls: number;
  missing: number;
  extra: number;
}

// Rules:
// SITEMAP-COV-01 (indexable page missing from sitemap) — severity: error
//   A page declared in system.md with indexable: true (and not excluded via
//   output.sitemap: false or output.sitemap: { include: false }) is not found
//   in any sitemap XML file. Both boolean and object forms of output.sitemap
//   exclusion are handled (see isSitemapExcluded in routes/registry.ts).
// SITEMAP-COV-02 (sitemap URL not in expected indexable set) — severity: warning
//   A URL in a sitemap XML file does not correspond to any indexable page
//   declared in system.md. May be intentionally included (e.g., special pages).

// Logic:
// 1. Load system.md manifest, build expected indexable URL set:
//    For each page with routes and not excluded via output.sitemap:
//      (exclusion check: output.sitemap === false OR output.sitemap.include === false)
//      For each lang in routes:
//        expectedUrls.add(canonicalPageUrl({ lang, route: slug, kind: "html" }, canonicalOpts))
// 2. Parse all sitemap*.xml files, collect all sitemap URLs into a Set
// 3. For each expected URL not in sitemap URLs → SITEMAP-COV-01 error
// 4. For each sitemap URL not in expected URLs → SITEMAP-COV-02 warning
// 5. Return diagnostics
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/werkstatt-site/src/checks/sitemap-placeholder.ts` | New file: `sitemap.placeholder.validate` command implementation |
| `packages/werkstatt-site/src/checks/sitemap-coverage.ts` | New file: `sitemap.coverage.validate` command implementation |
| `packages/werkstatt-site/src/checks/command-tables/09b-build-artifacts-part2.ts` | Modified: register both new commands |
| `packages/werkstatt-site/src/checks/pipelines/sites-check-postbuild.ts` | Modified: add both commands to `SITES_CHECK_POSTBUILD_PIPELINE` |
| `packages/werkstatt-site/src/tests/sitemap-placeholder.test.ts` | New file: unit tests for `sitemap.placeholder.validate` |
| `packages/werkstatt-site/src/tests/sitemap-coverage.test.ts` | New file: unit tests for `sitemap.coverage.validate` |
| `dist/client/sitemap*.xml` | Read-only: sitemap URLs parsed from here |
| `docs/verification-plan.xml` | Modified: add SITEMAP-PH-01 and SITEMAP-COV-01..02 rule IDs |

### Output format

Both commands use `diagnosticsResult` from `@warpgogol/werkstatt-shared/checks/result-helpers`.

**`sitemap.placeholder.validate --json`:**

```json
{
  "data": {
    "command": "sitemap.placeholder.validate",
    "status": "fail",
    "diagnostics": [
      {
        "ruleId": "SITEMAP-PH-01",
        "severity": "error",
        "file": "dist/client/sitemap-0.xml",
        "message": "Sitemap URL contains unresolved placeholder: https://warpgogol.com/leistungen/[slug]/",
        "fixHint": "Ensure the sitemap generator expands route templates into resolved slugs before emitting URLs"
      }
    ],
    "summary": { "error": 1, "warning": 0, "info": 0 }
  },
  "exitCode": 1,
  "summary": "sitemap.placeholder.validate: 1 error(s), 0 warning(s)"
}
```

**`sitemap.coverage.validate --json`:**

```json
{
  "data": {
    "command": "sitemap.coverage.validate",
    "status": "fail",
    "diagnostics": [
      {
        "ruleId": "SITEMAP-COV-01",
        "severity": "error",
        "file": "dist/client/sitemap-0.xml",
        "message": "Indexable page missing from sitemap: https://warpgogol.com/leistungen/beratung/",
        "fixHint": "Ensure the sitemap generator includes all indexable pages from system.md"
      },
      {
        "ruleId": "SITEMAP-COV-02",
        "severity": "warning",
        "file": "dist/client/sitemap-0.xml",
        "message": "Sitemap URL not in expected indexable set: https://warpgogol.com/special-page/",
        "fixHint": "Verify this URL should be in the sitemap; if not, exclude it via output.sitemap: false"
      }
    ],
    "summary": { "error": 1, "warning": 1, "info": 0 }
  },
  "exitCode": 1,
  "summary": "sitemap.coverage.validate: 1 error(s), 1 warning(s)"
}
```

### Failure modes

**`sitemap.placeholder.validate`:**

- If `dist/client/sitemap*.xml` files are missing → skip with info message (sitemap generation may be disabled).
- If no URLs found in sitemaps → skip with info message.
- If placeholder URLs found → `exitCode: 1`, diagnostics emitted. SITEMAP-PH-01 is an error.
- If no placeholders → `exitCode: 0`, summary with `checkedUrls` count.

**`sitemap.coverage.validate`:**

- If `dist/client/sitemap*.xml` files are missing → skip with info message.
- If `system.md` manifest is missing → skip with info message.
- If indexable pages missing from sitemap (SITEMAP-COV-01) → `exitCode: 1`, diagnostics emitted.
- If extra sitemap URLs found (SITEMAP-COV-02) → warning, does not affect exit code.
- If no issues → `exitCode: 0`, summary with counts.

## Rollout

**Default behavior: fail-hard from day one.** SITEMAP-PH-01 and SITEMAP-COV-01 are errors. SITEMAP-COV-02 is a warning. No grace period — placeholder URLs and missing pages cause Google indexing issues.

**Existing apps:** Sites with placeholder URLs or missing pages will fail the validator. The fix is to correct the sitemap generator to expand all route templates and include all indexable pages.

**New apps:** Automatically compliant — the validators run in `SITES_CHECK_POSTBUILD_PIPELINE`.

**Pipeline integration:** Both commands are added to `SITES_CHECK_POSTBUILD_PIPELINE` after `dist.sitemap.images.validate`, grouping all sitemap-related validators together:

```
robots.page.validate
feed.validate
canonical.url.validate
seo.domain.validate
seo.cross-lang-links.validate
dist.sitemap.images.validate
sitemap.placeholder.validate      ← NEW
sitemap.coverage.validate         ← NEW
passport.verify
```

Note: `robots.page.validate` runs before `canonical.url.validate` in the actual pipeline (line 44 vs 48 in `sites-check-postbuild.ts`). The earlier draft of this RFC proposed inserting before `robots.page.validate`, which was based on an incorrect understanding of the pipeline order.

## Alternatives considered

**1. Extend `canonical.url.validate` instead of creating new commands.** Rejected: `canonical.url.validate` checks sitemap/feed/llms URLs against the expected canonical set — it operates on URL parity. Placeholder detection is a different concern (URL validity, not URL parity). Coverage detection is the reverse direction (expected set vs. sitemap, not sitemap vs. expected set). Combining them would create a command with three unrelated rule families.

**2. One combined command `sitemap.integrity.validate`.** Rejected: placeholder detection and coverage checking are different responsibilities — one checks URL validity, the other checks set completeness. Combining them would create a command with two unrelated rule families. The workshop principle is to split when responsibilities differ.

**3. Fix only the sitemap generator, no validators.** Rejected: the generator fix resolves the current issue, but without validators, the same regression can reappear. DNA-67 (pre-deploy Lighthouse parity gate) establishes that every deterministically checkable issue MUST have a build-time validator.

## Risks

**Performance:** Both validators parse sitemap XML files and cross-reference against the manifest. Sitemap files are small (thousands of URLs at most). Performance impact is negligible.

**False positive rate:** SITEMAP-PH-01 has no false positives — URLs with bracket placeholders are always invalid. SITEMAP-COV-01 has no false positives by design — if a page is declared indexable in `system.md` and not excluded via `output.sitemap: false`, it must be in the sitemap. SITEMAP-COV-02 is a warning to account for intentionally included non-indexable pages.

**Maintenance burden:** Two new files (~150 lines each) plus pipeline registration and tests. The placeholder regex and coverage logic are simple and stable.

## Acceptance criteria

- [x] `sitemap.placeholder.validate` command registered in `packages/werkstatt-site/src/checks/command-tables/09b-build-artifacts-part2.ts` with correct name, scope `app`, and `supportsAllSites: true` (evidence: packages/werkstatt-site/src/checks/command-tables/09b-build-artifacts-part2.ts:899-910, rfc.validate)
- [x] `sitemap.coverage.validate` command registered in `packages/werkstatt-site/src/checks/command-tables/09b-build-artifacts-part2.ts` with correct name, scope `app`, and `supportsAllSites: true` (evidence: packages/werkstatt-site/src/checks/command-tables/09b-build-artifacts-part2.ts:911-921, rfc.validate)
- [x] `sitemap.placeholder.validate` emits SITEMAP-PH-01 for URLs containing `[slug]`, `[version]`, or any bracket placeholder (evidence: packages/werkstatt-site/src/checks/sitemap-placeholder.ts:73-80, src/checks/tests/sitemap-placeholder.test.ts:88-96)
- [x] `sitemap.coverage.validate` emits SITEMAP-COV-01 for indexable pages missing from the sitemap (evidence: packages/werkstatt-site/src/checks/sitemap-coverage.ts:113-121, src/checks/tests/sitemap-coverage.test.ts:170-178)
- [x] `sitemap.coverage.validate` emits SITEMAP-COV-02 (warning) for sitemap URLs not in the expected indexable set (evidence: packages/werkstatt-site/src/checks/sitemap-coverage.ts:123-131, src/checks/tests/sitemap-coverage.test.ts:180-193)
- [x] Both commands added to `SITES_CHECK_POSTBUILD_PIPELINE` after `dist.sitemap.images.validate` (evidence: packages/werkstatt-site/src/checks/pipelines/sites-check-postbuild.ts:57-59)
- [x] `--json` output format matches the documented shape for both commands (evidence: packages/werkstatt-site/src/checks/sitemap-placeholder.ts:94-96, packages/werkstatt-site/src/checks/sitemap-coverage.ts:133-135, diagnosticsResult from @warpgogol/werkstatt-shared/checks/result-helpers)
- [x] `packages/werkstatt-site/AGENTS.md` documents both new commands (evidence: packages/werkstatt-site/AGENTS.md:109-110)
- [x] Unit tests pass: `pnpm --filter @warpgogol/werkstatt-site test` (evidence: 12 tests pass, src/checks/tests/sitemap-placeholder.test.ts + src/checks/tests/sitemap-coverage.test.ts)
- [x] `rfc.validate` passes on this file (evidence: rfc.validate --id RFC-0907 --json, exitCode: 0, errors: [])

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST reuse `canonicalPageUrl` from `@warpgogol/werkstatt-site/share/astro/canonical-url` for expected URL computation in `sitemap.coverage.validate`.
- Agents MUST reuse `extractSitemapUrls` from `canonical-url.ts` for parsing sitemap XML. This function is currently private — export it from `canonical-url.ts` or extract it to a shared helper in `@warpgogol/werkstatt-shared/checks` before reuse.
- Agents MUST use `diagnosticsResult` from `@warpgogol/werkstatt-shared/checks/result-helpers` for output, consistent with existing validators. The re-export shim at `../result-helpers.ts` in `werkstatt-site` also works but the canonical source is `werkstatt-shared`.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
