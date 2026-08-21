---
id: RFC-0898
title: "Canonical URL hardening and cross-language link validator"
status: implemented
kind: architecture
scope: workspace
owners:
  - architecture
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-08-21
updatedAt: 2026-08-21
enhancedAt: 2026-08-21
implementedAt: 2026-08-21
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0317
  - RFC-0162
  - DNA-61
satisfies:
  - DNA-57
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

1. **`seo.domain.validate`** — scans every rendered HTML file in `dist/client/` for `<link rel="canonical">`, `<meta property="og:url">`, `<link rel="alternate" hreflang>` hrefs, and all `url` properties in every `<script type="application/ld+json">` block (WebPage, Organization, BreadcrumbList, etc.). Checks that all origins match the `Astro.site` origin from `astro.config.mjs`. Also checks that no URL contains dev/staging hostname patterns (`dev.`, `staging.`, `localhost`, `127.0.0.1`, `0.0.0.0`, `.local`).

2. **`seo.cross-lang-links.validate`** — scans every rendered HTML file in `dist/client/` for internal `<a href>` links. For each page, determines the page's language from its path prefix (or default for unprefixed). Checks that internal links to same-site pages use the same language prefix. Links with an explicit `hreflang` attribute on the `<a>` tag are fully skipped — they are intentional cross-language links (language switcher, "view in another language"). Links within `<nav>` elements containing the language switcher are also skipped.

Additionally, page templates are hardened to pass `canonicalUrl` explicitly to `BaseLayout`, eliminating the `Astro.url.toString()` fallback. The `canonicalUrl` prop already exists on `BaseLayout` (RFC-0159) as an optional override; this change makes templates pass it unconditionally.

## Architectural fit

- **DNA-57 (Dev/prod egress parity):** Satisfies — by catching canonical domain drift at build time, the validator ensures that the published output uses the configured `Astro.site` origin, not the request host. This is the build-time enforcement arm of dev/prod parity: if `Astro.site` is misconfigured or a template falls back to `Astro.url.toString()`, the build fails before the wrong domain reaches production. The dev server itself is not modified (DNA-57's dev-mode arm is owned by RFC-0235's dev adapter), but the build-time arm is owned by this RFC.
- **DNA-61 (Resolved content regression gate):** Related — cross-language link errors are content regressions conceptually aligned with the regression gate, but this RFC does not mechanically extend DNA-61 (it does not use golden snapshots or the content regression check mechanism). The validators are standalone HTML scanners.
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
| --- | --- | --- |
| `SEO-DOMAIN-01` | error | Canonical URL origin does not match `Astro.site` origin |
| `SEO-DOMAIN-02` | error | `og:url` origin does not match `Astro.site` origin |
| `SEO-DOMAIN-03` | error | hreflang href origin does not match `Astro.site` origin |
| `SEO-DOMAIN-04` | error | JSON-LD `url` field origin does not match `Astro.site` origin |
| `SEO-DOMAIN-05` | error | Any SEO tag URL contains a dev/staging hostname pattern |
| `SEO-XLANG-01` | error | Internal link on a DE page points to `/uk/...` without `hreflang` attribute |

### File system responsibilities

| Path                    | Role                                                                 |
| ----------------------- | -------------------------------------------------------------------- |
| `dist/client/**/*.html` | Scanned for canonical, og:url, hreflang, JSON-LD, and internal links |
| `astro.config.mjs`      | Read for `site` property (via `readAstroSiteUrl`)                    |
| `src/content/system.md` | Read for i18n config (default language, supported languages)         |

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

The `canonicalUrl` prop already exists on `BaseLayout` (RFC-0159) as an optional override. Currently, templates do not pass it, so the layout falls back to `Astro.url.toString()` (which in SSR/hybrid mode reflects the request host, not the configured site).

Page templates (`[...slug].template.astro` and `[lang]/[...slug].template.astro`) are updated in two ways:

1. **Remove the `Astro.url.origin` fallback in `siteUrl` passed to `resolvePageRoute`:**

```astro
// Before:
siteUrl: Astro.site?.toString() ?? Astro.url.origin,
// After:
siteUrl: Astro.site?.toString(),
```

When `Astro.site` is undefined, `resolvePageRoute` receives `undefined` and `data.semanticPage.url` will be undefined — making the misconfiguration visible rather than silently falling back to the request host.

2. **Pass `canonicalUrl` to `BaseLayout` without a fallback:**

```astro
<BaseLayout
  canonicalUrl={data.semanticPage?.url}
  ...
>
```

The layout's own fallback (`canonicalUrlOverride ?? Astro.url.toString()`) remains as a last-resort safety net, but when the template passes `canonicalUrl`, the fallback is never hit. This ensures canonical URLs are always derived from `Astro.site` via `resolvePageRoute`.

**Workpiece migration:** Existing materialized workpieces have copies of the old templates in `missions/<id>/workpiece/src/pages/`. These workpieces need re-materialization (or manual template updates) to benefit from the hardening. The `mission.materialize` command copies template files from the package, so the next materialization cycle picks up the hardened templates automatically.

## Rollout

- **Default behavior:** Both validators run in `SITES_CHECK_POSTBUILD_PIPELINE` and `build.post`. They fail the build on error-severity diagnostics.
- **Existing apps:** All existing sites should pass — if they don't, it indicates a real SEO issue that needs fixing. No grace period is needed because the validators catch real bugs.
- **New apps:** Automatically compliant from day one.
- **Integration point:** Both validators are added to `SITES_CHECK_POSTBUILD_PIPELINE` immediately after `canonical.url.validate` (RFC-0317). The intervening validators between `canonical.url.validate` and `image.delivery.validate` (`passport.verify`, `lighthouse.budget.check`, `mobile.layout.check`, `generated.marker.validate`, `need.markers.validate`, `dist.content-references.validate`, `cloudflare.assets.validate`) remain in their current positions.

## Alternatives considered

- **Extend `canonical.url.validate` instead of new command:** Rejected — `canonical.url.validate` is scoped to sitemap/feed/llms parity (RFC-0317). Domain-origin checking of rendered HTML is a different concern with different file access patterns. A separate command keeps each validator focused.
- **Runtime check via Cloudflare Worker:** Rejected for the canonical check — build-time is the right place. Runtime checks are addressed in RFC-0899 for access protection.
- **Check all internal links, not just cross-language:** Rejected — broken link checking is already handled by `seo.internal-linking.validate`. This RFC focuses specifically on the cross-language link class of errors.

## Risks

- **False positives on cross-language links:** Some links legitimately cross language boundaries (e.g., language switcher, "view in another language" links). The validator fully skips links with `hreflang` attribute on the `<a>` tag, and also skips links within `<nav>` elements that contain the language switcher. There is no `SEO-XLANG-02` warning rule — links with `hreflang` are intentionally cross-language and are not flagged at any severity.
- **Regex-based HTML parsing:** Using regex to extract URLs from HTML is less robust than a proper parser. However, the existing validators in this codebase use the same approach (e.g., `seo-meta.ts`, `canonical-url.ts`), and the HTML is generated by Astro (well-structured, predictable output).
- **Performance:** Scanning all HTML files in `dist/client/` adds to build time. For sites with hundreds of pages, this is a few hundred milliseconds — acceptable for a post-build validator.

## Acceptance criteria

- [x] `seo.domain.validate` command registered in `05-seo-audit.ts` command table (evidence: packages/werkstatt-site/src/checks/command-tables/05-seo-audit.ts:237-246)
- [x] `seo.cross-lang-links.validate` command registered in `05-seo-audit.ts` command table (evidence: packages/werkstatt-site/src/checks/command-tables/05-seo-audit.ts:247-255)
- [x] Both commands added to `SITES_CHECK_POSTBUILD_PIPELINE` (evidence: packages/werkstatt-site/src/checks/pipelines/sites-check-postbuild.ts:46-49)
- [x] `SEO-DOMAIN-01` through `SEO-DOMAIN-05` rules implemented (evidence: packages/werkstatt-site/src/checks/audit/validators/seo-domain.ts:117-195)
- [x] `SEO-XLANG-01` rule implemented (evidence: packages/werkstatt-site/src/checks/audit/validators/seo-cross-lang-links.ts:183-194)
- [x] Page templates pass `canonicalUrl` explicitly to `BaseLayout` (no `Astro.url.toString()` fallback) (evidence: packages/werkstatt-site/src/codegen/templates/app-boilerplate/src/pages/[...slug].template.astro:59,94 and packages/werkstatt-site/src/codegen/templates/app-boilerplate/src/pages/[lang]/[...slug].template.astro:75,123)
- [x] `docs/verification-plan.xml` updated with verification mappings for `SEO-DOMAIN-*` and `SEO-XLANG-01` rules (evidence: docs/verification-plan.xml:537-540)
- [x] `packages/werkstatt-site/AGENTS.md` updated with `seo.domain.validate` and `seo.cross-lang-links.validate` entries in Check commands section (evidence: packages/werkstatt-site/AGENTS.md:97-98)
- [x] Unit tests for each rule (passing and failing cases) (evidence: packages/werkstatt-site/src/checks/tests/seo-domain.test.ts:1-175, packages/werkstatt-site/src/checks/tests/seo-cross-lang-links.test.ts:1-174)
- [x] `rfc.validate` passes on this file before merging (evidence: rfc.validate run after stamping)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- The validators MUST scan `dist/client/` (post-build output), not `src/` source files.
- The dev/staging hostname patterns list is closed: `dev.`, `staging.`, `localhost`, `127.0.0.1`, `0.0.0.0`, `.local`. Adding new patterns requires amending this RFC.
