---
reviewId: REVIEW-CODE-2026-08-09-01
date: 2026-08-09
reviewer:
  skill: fo-review
  model: unknown
verdict: needs-revision
diffRange: 4013f2f0...HEAD
filesReviewed:
  - packages/werkstatt-site/src/checks/sitemap-helpers.ts
  - packages/werkstatt-site/src/checks/sitemap.ts
  - packages/werkstatt-site/src/checks/tests/sitemap-helpers.test.ts
  - docs/rfcs/rfc-0788-add-agent-friendly-sitemap-extensions-for-agent-crawl-discovery.md
  - docs/plans/plan-rfc-0788-add-agent-friendly-sitemap-extensions-for-agent-crawl-discovery.md
---

# Code Review: 4013f2f0...HEAD (RFC-0788 — markdown alternate links in sitemap)

### Verdict: Needs revision

The implementation is functionally correct — 32 tests pass, no sitemap-related TypeScript errors, `rfc.validate` passes. Two findings require revision: a regex ordering bug in `parseSitemapXml` that could silently drop markdown alternates in certain XML attribute orders, and a missing `collectFiles` error-handling path in `buildMarkdownTwinsMap`.

### Mechanical floor

Pass — no sitemap-related TypeScript errors. 32/32 unit tests pass. `rfc.validate` passes with 0 errors, 0 warnings.

### Axis A — Structural correctness

**Finding A1: `parseSitemapXml` regex assumes `type` attribute appears after `hreflang` in mixed-attribute order.**

The hreflang regex at `sitemap-helpers.ts:318`:
```
/<xhtml:link[^>]*?hreflang="([^"]*)"[^>]*?href="([^"]*)"[^>]*?\/?>/g
```
requires `hreflang` to appear before `href` in the attribute list. The markdown regex at `sitemap-helpers.ts:326`:
```
/<xhtml:link[^>]*?type="([^"]*)"[^>]*?href="([^"]*)"[^>]*?\/?>/g
```
requires `type` before `href`. If the XML serializer emits `href` before `hreflang` or `type` (which is valid XML), the regexes will not match. The generator at `sitemap-helpers.ts:272-276` always emits `hreflang` before `href` and `type` before `href`, so the generator's own output is safe. But `parseSitemapXml` is also used to parse externally-produced sitemaps in `runSitemapValidate`, and a sitemap produced by a different tool could have `href` first. This is a latent robustness issue.

**Severity**: Low (the generator produces compatible attribute order, so this only affects external sitemaps).

**Finding A2: `buildMarkdownTwinsMap` swallows `collectFiles` errors silently.**

`sitemap.ts:59` calls `collectFiles(publicDir, ...)` which internally swallows `readdir` errors (returns empty array). If `publicDir` does not exist or is unreadable, `buildMarkdownTwinsMap` returns an empty map, and the sitemap is generated without markdown alternates — which is the correct fail-open behavior per the RFC's failure modes section. However, there is no log or diagnostic message indicating that the directory was missing. An operator running `sitemap.generate` on a fresh checkout (no `public/` yet) would silently get a sitemap without markdown alternates, which is correct but could be confusing.

**Severity**: Low (fail-open is the intended behavior per RFC §Failure modes).

### Axis B — DNA alignment

No issues. DNA-16 (semantic layer shares topology with navigation) is satisfied — `buildClustersFromSystemMd` is the canonical cluster builder shared by both generator and validator. No new DNA invariant introduced.

### Axis C — Ecosystem fit

No issues. Imports flow correctly: `sitemap.ts` imports from `@warpgogol/werkstatt-site/share/fs` and `@warpgogol/werkstatt-site/share/semantic` via subpath exports. Both subpath exports exist in `package.json`. No package boundary violations.

### Axis D — Forward-only compliance

No issues. The `markdownTwins` parameter is optional (`?: Map<string, string>`) on `generateSitemapXml` — existing callers without the parameter produce the same output as before. `validateSitemapFile` has a required `markdownTwins` parameter (breaking change for direct callers), but the only callers are `runSitemapValidate` and the test suite, both updated. No backward-compatibility shim or dual-path.

### Axis E — Agent-facing clarity

No issues. `MODULE_CONTRACT` and `CHANGE_SUMMARY` updated in both `sitemap-helpers.ts` and `sitemap.ts`. RFC-0788 referenced in all code comments. Variable names are descriptive (`markdownTwins`, `markdownAlternates`, `twinRelPaths`).

### Axis F — Pragmatism

No issues. The implementation extends existing functions with an optional parameter rather than creating new functions. `buildMarkdownTwinsMap` is a minimal helper that reuses `collectFiles` and `markdownTwinRelPath`/`markdownTwinUrlPath` — no new utilities invented. No new dependencies added.

### Axis G — Blind spots

**Finding G1: No performance cost documented for `collectFiles` scan.**

`buildMarkdownTwinsMap` calls `collectFiles(publicDir, { extensions: [".md"] })` which recursively scans the entire `public/` directory. For a site with a large `public/` (e.g., many images, PDFs), this scan touches every file entry to check the extension. The RFC §Risks mentions "~80 bytes per URL" sitemap size increase but does not mention the scan cost. For a typical site this is negligible (single-digit milliseconds), but for sites with thousands of static assets in `public/`, the cost should be documented.

**Severity**: Low (negligible for typical sites, but undocumented).

### Spec compliance

| Requirement from RFC-0788 | Status | Evidence |
| --- | --- | --- |
| `generateSitemapXml` accepts optional `markdownTwins` | Done | `sitemap-helpers.ts:256-259` |
| `SitemapUrlEntry` gains `markdownAlternates` | Done | `sitemap-helpers.ts:301-304` |
| `parseSitemapXml` extracts `type` alternates | Done | `sitemap-helpers.ts:324-330` (see A1 for robustness note) |
| `runSitemapGenerate` builds `markdownTwins` from `public/*.md` | Done | `sitemap.ts:56-81, 97-103` |
| Sitemap XML includes `text/markdown` alternates | Done | `sitemap-helpers.ts:267-271` |
| `validateSitemapFile` validates markdown alternates separately | Done | `sitemap-helpers.ts:418-437` |
| `sitemap.validate` verifies markdown links point to existing `.md` | Done | `sitemap.ts:166-172, 210` |
| Pages without `.md` twins have no markdown alternates | Done | `sitemap-helpers.ts:268-271` |
| Empty `public/` produces sitemap without markdown alternates | Done | `sitemap.ts:62-80` (fail-open) |
| `isitagentready.com` post-deploy verification | Partial | Deferred to post-deploy — code implementation complete |
| `rfc.validate` passes | Done | exit code 0, 0 errors, 0 warnings |

### Questions for the author

1. Is the `parseSitemapXml` regex attribute-order sensitivity (A1) acceptable given that the generator always produces `hreflang`/`type` before `href`, or should the regexes be made attribute-order-independent?
2. Should `buildMarkdownTwinsMap` log a diagnostic when `publicDir` does not exist or `collectFiles` returns empty, to help operators distinguish "no markdown twins generated yet" from "directory missing"?
3. Is the deferred post-deploy criterion (`isitagentready.com`) acceptable for the `implemented` stamp, or should a follow-up RFC track the runtime verification separately?
