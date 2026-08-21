---
id: RFC-0898
title: "Canonical URL hardening and cross-language link validator"
status: draft
kind: architecture
scope: workspace
owners:
  - architecture
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-08-21
updatedAt: 2026-08-21
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0317
  - RFC-0162
satisfies:
  - DNA-57
  - DNA-61
versionBump: patch
commands:
  proposed:
    - seo.domain.validate
    - seo.cross-lang-links.validate
  added: []
  changed: []
  removed: []
appsImpacted: []
packagesImpacted:
  - "@warpgogol/werkstatt-site"
successSignals:
  - "Build fails when rendered HTML canonical URL origin does not match astro.config.mjs site origin"
  - "Build fails when a DE page contains an internal link to /uk/... (or vice versa)"
  - "Build fails when any SEO tag (canonical, og:url, hreflang, JSON-LD url) contains a dev/staging domain"
nonGoals:
  - "Do not check external links — only internal links and self-referential SEO tags"
  - "Do not validate sitemap URL parity — that is already covered by canonical.url.validate (RFC-0317)"
  - "Do not validate og:image dimensions or format — that is a separate concern"
---

# RFC-0898: Canonical URL hardening and cross-language link validator

## Context

An SEO expert auditing warpgogol.com found that `dev.warpgogol.com` appeared in canonical URLs, `og:url`, and JSON-LD on the publicly accessible dev subdomain. Additionally, the German Impressum page linked to `/uk/barrierefreiheit` instead of `/barrierefreiheit` — a cross-language link error that no existing validator catches.

The existing `canonical.url.validate` (RFC-0317) checks parity between sitemap, feed, and llms URLs, but does **not** extract `<link rel="canonical">` from rendered HTML in `dist/client/`. The existing `seo.meta.validate` checks `og:url` vs canonical parity but does **not** verify that the canonical origin matches `Astro.site`. No validator checks that internal links on a page match the page's language prefix.

## Problem

Three unprotected gaps:

1. **Canonical domain drift:** If `Astro.site` is misconfigured, undefined, or if a page template falls back to `Astro.url.toString()` (which in SSR/hybrid mode reflects the request host, not the configured site), the canonical URL in rendered HTML may point to a dev/staging domain. No build-time validator catches this.

2. **Cross-language internal links:** A DE page can contain `<a href="/uk/barrierefreiheit">` — an internal link to the wrong language version. This happened in the Impressum and was not caught by any validator. The existing `seo.internal-linking.validate` checks link structure (broken links, orphan pages) but not language-prefix consistency.

3. **Dev/staging domain leakage:** Even if canonical is correct, other SEO tags (og:url, hreflang hrefs, JSON-LD `url` fields) could contain dev/staging domains if the build was done against a non-production `Astro.site`. No validator scans for dev/staging patterns in SEO tags.

## Decision

Two new post-build validators are added to `SITES_CHECK_POSTBUILD_PIPELINE`:

1. **`seo.domain.validate`** — scans every rendered HTML file in `dist/client/` for `<link rel="canonical">`, `<meta property="og:url">`, `<link rel="alternate" hreflang>` hrefs, and JSON-LD `url` fields. Checks that all origins match the `Astro.site` origin from `astro.config.mjs`. Also checks that no URL contains dev/staging hostname patterns (`dev.`, `staging.`, `localhost`, `127.0.0.1`, `.local`).

2. **`seo.cross-lang-links.validate`** — scans every rendered HTML file in `dist/client/` for internal `<a href>` links. For each page, determines the page's language from its path prefix (or default for unprefixed). Checks that internal links to same-site pages use the same language prefix. Flags links that cross language boundaries without an explicit `hreflang` attribute on the `<a>` tag.

Additionally, page templates are hardened to pass `canonicalUrl` explicitly to `BaseLayout`, eliminating the `Astro.url.toString()` fallback.

## Architectural fit

- **DNA-57 (Dev/prod egress parity):** The dev server must reflect production output. By catching domain drift at build time, we ensure that what operators see in dev matches what will be published.
- **DNA-61 (Resolved content regression gate):** Cross-language link errors are content regressions that should be caught before publication, not after an expert audit.
- **Existing validators:** `canonical.url.validate` (RFC-0317) checks sitemap/feed/llms parity. `seo.meta.validate` (RFC-0162) checks OG tag presence and og:url vs canonical parity. This RFC adds the missing domain-origin check and the cross-language link check.

## Design

### CLI surface

```sh
# Automatic — runs as part of sites-check.postbuild and build.post pipelines
# Can be run standalone for debugging:
pnpm exec werkstatt run seo.domain.validate --app warpgogol-com
pnpm exec werkstatt run seo.cross-lang-links.validate --app warpgogol-com
```

### TypeScript contracts

```ts
interface SeoDomainValidateResult {
  command: "seo.domain.validate";
  diagnostics: Diagnostic[];
}

interface CrossLangLinksValidateResult {
  command: "seo.cross-lang-links.validate";
  diagnostics: Diagnostic[];
}
```

### Rule catalog

| Rule ID | Severity | Description |
|---|---|---|
| `SEO-DOMAIN-01` | error | Canonical URL origin does not match `Astro.site` origin |
| `SEO-DOMAIN-02` | error | `og:url` origin does not match `Astro.site` origin |
| `SEO-DOMAIN-03` | error | hreflang href origin does not match `Astro.site` origin |
| `SEO-DOMAIN-04` | error | JSON-LD `url` field origin does not match `Astro.site` origin |
| `SEO-DOMAIN-05` | error | Any SEO tag URL contains a dev/staging hostname pattern |
| `SEO-XLANG-01` | error | Internal link on a DE page points to `/uk/...` without `hreflang` attribute |
| `SEO-XLANG-02` | warning | Internal link crosses language boundary with `hreflang` but target language differs from page language |

### File system responsibilities

| Path | Role |
|---|---|
| `dist/client/**/*.html` | Scanned for canonical, og:url, hreflang, JSON-LD, and internal links |
| `astro.config.mjs` | Read for `site` property (via `readAstroSiteUrl`) |
| `src/content/system.md` | Read for i18n config (default language, supported languages) |

### Output format

```json
{
  "command": "seo.domain.validate",
  "diagnostics": [
    {
      "ruleId": "SEO-DOMAIN-01",
      "severity": "error",
      "message": "Canonical URL origin https://dev.warpgogol.com does not match Astro.site origin https://warpgogol.com in dist/client/de/impressum/index.html",
      "fixHint": "Check astro.config.mjs site property and page template canonicalUrl prop."
    }
  ]
}
```

### Failure modes

- **Missing `Astro.site`:** If `astro.config.mjs` has no `site` property, `SEO-DOMAIN-01` through `SEO-DOMAIN-04` are skipped (warning emitted). `SEO-DOMAIN-05` still runs.
- **No HTML files in dist:** Command returns zero diagnostics (no-op).
- **Malformed HTML:** Regex-based extraction is resilient — malformed tags are skipped, not crashed on.
- **External links:** Links to other domains are ignored by `seo.cross-lang-links.validate` — only same-origin links are checked.

### Template hardening

Page templates (`[...slug].template.astro` and `[lang]/[...slug].template.astro`) are updated to pass `canonicalUrl` explicitly to `BaseLayout`:

```astro
<BaseLayout
  canonicalUrl={data.semanticPage?.url ?? Astro.url.toString()}
  ...
>
```

This eliminates the `Astro.url.toString()` fallback in the layout, ensuring canonical URLs are always derived from `Astro.site` via `resolvePageRoute`.

## Rollout

- **Default behavior:** Both validators run in `SITES_CHECK_POSTBUILD_PIPELINE` and `build.post`. They fail the build on error-severity diagnostics.
- **Existing apps:** All existing sites should pass — if they don't, it indicates a real SEO issue that needs fixing. No grace period is needed because the validators catch real bugs.
- **New apps:** Automatically compliant from day one.
- **Integration point:** Added to `SITES_CHECK_POSTBUILD_PIPELINE` after `canonical.url.validate` (RFC-0317) and before `image.delivery.validate`.

## Alternatives considered

- **Extend `canonical.url.validate` instead of new command:** Rejected — `canonical.url.validate` is scoped to sitemap/feed/llms parity (RFC-0317). Domain-origin checking of rendered HTML is a different concern with different file access patterns. A separate command keeps each validator focused.
- **Runtime check via Cloudflare Worker:** Rejected for the canonical check — build-time is the right place. Runtime checks are addressed in RFC-0899 for access protection.
- **Check all internal links, not just cross-language:** Rejected — broken link checking is already handled by `seo.internal-linking.validate`. This RFC focuses specifically on the cross-language link class of errors.

## Risks

- **False positives on cross-language links:** Some links legitimately cross language boundaries (e.g., language switcher, "view in another language" links). The validator skips links with `hreflang` attribute on the `<a>` tag, and also skips links within `<nav>` elements that contain the language switcher.
- **Regex-based HTML parsing:** Using regex to extract URLs from HTML is less robust than a proper parser. However, the existing validators in this codebase use the same approach (e.g., `seo-meta.ts`, `canonical-url.ts`), and the HTML is generated by Astro (well-structured, predictable output).
- **Performance:** Scanning all HTML files in `dist/client/` adds to build time. For sites with hundreds of pages, this is a few hundred milliseconds — acceptable for a post-build validator.

## Acceptance criteria

- [ ] `seo.domain.validate` command registered in `05-seo-audit.ts` command table
- [ ] `seo.cross-lang-links.validate` command registered in `05-seo-audit.ts` command table
- [ ] Both commands added to `SITES_CHECK_POSTBUILD_PIPELINE`
- [ ] `SEO-DOMAIN-01` through `SEO-DOMAIN-05` rules implemented
- [ ] `SEO-XLANG-01` and `SEO-XLANG-02` rules implemented
- [ ] Page templates pass `canonicalUrl` explicitly to `BaseLayout`
- [ ] Unit tests for each rule (passing and failing cases)
- [ ] `rfc.validate` passes on this file before merging

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- The validators MUST scan `dist/client/` (post-build output), not `src/` source files.
- The dev/staging hostname patterns list is closed: `dev.`, `staging.`, `localhost`, `127.0.0.1`, `0.0.0.0`, `.local`. Adding new patterns requires amending this RFC.
