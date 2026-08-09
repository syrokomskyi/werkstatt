---
id: RFC-0049
title: "Generate hreflang sitemap from localized route registry"
status: implemented
# kind options: architecture | contract | command | policy | deprecation
kind: architecture
# scope options: app | workspace
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-05-14
updatedAt: 2026-06-18
implementedAt: 2026-05-15
closedAt:
supersedes: []
supersededBy:
amendedBy:
  - RFC-0185
  - RFC-0317
related:
  - DNA-22
  - DNA-25
  - RFC-0038
  - RFC-0047
  - RFC-0048
commands:
  proposed:
    - sitemap.generate
    - sitemap.validate
  added:
    - sitemap.generate
    - sitemap.validate
  changed:
    - app.contract.full
    - onboarding.scaffold
  removed: []
appsImpacted:
  - nicaragua-projekt
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - "@gogol/share"
  - "@gogol/site-kernel-checks"
successSignals:
  - "sitemap.xml is a sitemap index referencing sub-sitemaps (e.g., sitemap-content.xml, sitemap-legal.xml)."
  - "Every localized URL appears as a separate <url> entry with all language alternates listed via xhtml:link."
  - "A page missing a translation in one language is excluded from that language's alternates but keeps its own <url> entry."
  - "sitemap.validate confirms structural correctness and bidirectional hreflang symmetry across the index and all sub-sitemaps without a running server."
  - "Adding a new page to system.md pages[] automatically includes it in the appropriate sub-sitemap without extra configuration."
nonGoals:
  - "Do not use @astrojs/sitemap integration — the route registry already owns the source of truth and the integration cannot observe localized slugs."
  - "Do not crawl generated HTML to discover URLs at build time."
  - "Do not add per-language sitemap files (e.g., sitemap-de.xml / sitemap-en.xml) — the current category split is by page type, not language."
  - "Do not include changefreq or priority — Google ignores them."
  - "Do not include URLs from public/** static files or machine-readable endpoints (llms.txt, llms-full.txt)."
  - "Do not introduce cookies or server-side state."
  - "Do not hardcode page slugs or languages in the endpoint — all data flows from system.md."
---

# RFC-0049: Generate hreflang sitemap from localized route registry

## Context

`apps/nicaragua-projekt` is a statically generated multilingual site. RFC-0048 established a localized route registry in `src/content/system.md pages[].routes` that maps each stable `pageId` to language-keyed public slugs:

```yaml
pages:
  - pageId: privacyPolicy
    routes:
      de: datenschutz
      en: privacy
```

The site currently has no `sitemap.xml`. A sitemap is required for correct search-engine indexing, and for a multilingual site with different slugs per language — such as `/de/datenschutz` and `/en/privacy` — the standard form is a sitemap with `xhtml:link rel="alternate" hreflang` clusters: each localized URL appears as its own `<url>` entry, and every `<url>` lists all language variants including itself.

The existing Astro `@astrojs/sitemap` integration cannot observe the route registry because it discovers URLs from statically rendered output rather than from the localized route table. Attempting to add `hreflang` alternate links through the integration's `serialize()` hook requires post-hoc URL matching that is fragile and cannot reliably pair `/de/datenschutz` with `/en/privacy` when slugs differ per language.

The route registry in RFC-0048 already supplies the exact data structure needed: a `pageId` → `Record<lang, slug>` mapping is precisely the `PageCluster` from which hreflang sitemap entries are derived. The semantic layer in `src/semantic/` already has precedent for thin Astro endpoint generation (`llms.txt.ts`, `llms-full.txt.ts`).

## Problem

The unprotected invariants are:

> Every publicly indexable page must appear in `sitemap.xml` with all available language alternates linked bidirectionally via `hreflang`.

> The sitemap must be generated from a single source of truth so that adding a page to `system.md` automatically includes it in the sitemap without extra manual steps.

Current failure modes:

1. **No sitemap exists.** Search engines have no machine-readable page index.
2. **No hreflang signals.** Without `xhtml:link rel="alternate"` in the sitemap, Google may fail to associate `/de/datenschutz` and `/en/privacy` as siblings of the same logical page.
3. **`@astrojs/sitemap` cannot observe localized slugs.** The integration discovers URLs from generated output; it cannot read the route registry and cannot pair localized siblings when slugs differ.
4. **No validation guard.** Without a validation command, a sitemap can silently become structurally invalid or asymmetric after a route change.
5. **`<head>` lacks `<link rel="alternate" hreflang>`.** The layout currently emits only a `<link rel="canonical">`. For correct multilingual signals, the `<head>` of each page should also carry `hreflang` alternate links matching the sitemap clusters.

## Decision

The platform introduces a sitemap generation endpoint and a validation command, both driven exclusively by the RFC-0048 route registry.

**Sitemap generation:** `sitemap.generate` is a site-kernel command (registered in `@gogol/site-kernel-checks`) that reads the route registry, builds `PageCluster[]`, groups them by `sitemapCategory`, and writes a sitemap index (`public/sitemap.xml`) plus sub-sitemap files (`public/sitemap-<category>.xml`) before the Astro build runs. The command is the delivery point; all generation logic lives in `@gogol/share`.

**Page head alternate links:** `apps/<app>/src/layouts/layout.astro` gains `<link rel="alternate" hreflang>` tags for all language siblings of the current page, sourced from the route registry. These parallel the sitemap hreflang clusters so that `<head>` and sitemap are always consistent.

**Shared generator:** `@gogol/share` exports `buildSitemapClusters(registry)` and `generateSitemapXml(clusters, siteUrl)` so the same logic is reusable across apps without app-local duplication.

**Validation command:** `sitemap.validate` reads the generated `sitemap.xml` and verifies structural correctness and bidirectional hreflang symmetry against the route registry, without requiring a running server.

**Cosmic passport and star-map pages** are excluded from the public sitemap because they are platform-internal overlay pages, not publicly indexable content pages. Their exclusion is declared in `system.md pages[].sitemapExclude: true`.

**Home page** uses an empty slug; its canonical URL is `/{lang}/` (or the site root redirecting to the default language). It is included in the sitemap.

## Architectural fit

**RFC-0048 / localized route registry.** The `LocalizedRouteEntry` type already carries `pageId` and `routes: Record<LanguageCode, string>`. `buildSitemapClusters` maps this directly to `PageCluster[]` without additional data sources. No new content schema is introduced.

**RFC-0047 / CMS-friendly surface.** System.md is the single content source that governs which pages exist and what their public URLs are. Adding `sitemapExclude: true` to a page entry is the only CMS-facing addition.

**RFC-0038 / language configuration.** The set of supported languages is read from `system.md i18n.supported`. The sitemap generator only emits hreflang entries for languages that appear in that list and have a non-empty route for the given `pageId`.

**DNA-25 / thin delivery.** The sitemap generator follows the same prepare-step pattern as `open-source.generate` and `icons.generate`: a site-kernel command writes a file into `public/` during `build.prepare`, and Astro copies it to `dist/` during the static build. All logic lives in `@gogol/share`; the command is a thin consumer.

**DNA-22 / no server state.** The sitemap is fully static. It is generated during `build.prepare` by the `sitemap.generate` command, written to `public/sitemap.xml`, and copied to `dist/sitemap.xml` by Astro's static build. No runtime fetch is needed.

**Package boundaries.** Sitemap generation logic lives in `@gogol/share`, not in the app. The app endpoint and layout are thin consumers. Packages must not import from `apps/*`.

**`@astrojs/sitemap` is not added.** The integration is purposely excluded because it cannot observe the route registry. Adding it alongside custom sitemap generation would produce a conflicting `/sitemap.xml` and `/sitemap-index.xml`.

## Design

### Data model

The generator uses `PageCluster`, a flat, app-agnostic view of a single logical page. It is derived from `LocalizedRouteEntry` (RFC-0048) by adding an absolute URL per locale and an optional `lastmod`:

```ts
// packages/os/site-kernel-checks/src/sitemap.ts

export type LanguageCode = string;

export interface SitemapLocaleEntry {
  lang: LanguageCode;
  path: string;   // e.g. /de/datenschutz
  url: string;    // absolute, e.g. https://example.com/de/datenschutz
}

export interface PageCluster {
  pageId: string;
  locales: SitemapLocaleEntry[];
}
```

The cluster is built from the route registry and the site base URL — nothing else. Home page routes produce `/de/` and `/en/` as absolute URLs. Pages with `sitemapExclude: true` in the registry entry are filtered out before cluster construction.

### Sitemap XML output

The generator produces a **sitemap index** (`sitemap.xml`) plus one **sub-sitemap** per `sitemapCategory` (`sitemap-<category>.xml`). Each sub-sitemap contains `<url>` entries where every `<url>` lists all locales as `xhtml:link rel="alternate"` including itself. This is the bidirectional hreflang pattern required by Google.

Example sitemap index:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap>
    <loc>https://example.com/sitemap-content.xml</loc>
  </sitemap>
  <sitemap>
    <loc>https://example.com/sitemap-legal.xml</loc>
  </sitemap>
</sitemapindex>
```

Example sub-sitemap (`sitemap-content.xml`) for two pages and two languages:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset
  xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
  xmlns:xhtml="http://www.w3.org/1999/xhtml"
>
  <url>
    <loc>https://example.com/de/</loc>
    <xhtml:link rel="alternate" hreflang="de" href="https://example.com/de/" />
    <xhtml:link rel="alternate" hreflang="en" href="https://example.com/en/" />
  </url>
  <url>
    <loc>https://example.com/en/</loc>
    <xhtml:link rel="alternate" hreflang="de" href="https://example.com/de/" />
    <xhtml:link rel="alternate" hreflang="en" href="https://example.com/en/" />
  </url>
  <url>
    <loc>https://example.com/de/datenschutz</loc>
    <xhtml:link rel="alternate" hreflang="de" href="https://example.com/de/datenschutz" />
    <xhtml:link rel="alternate" hreflang="en" href="https://example.com/en/privacy" />
  </url>
  <url>
    <loc>https://example.com/en/privacy</loc>
    <xhtml:link rel="alternate" hreflang="de" href="https://example.com/de/datenschutz" />
    <xhtml:link rel="alternate" hreflang="en" href="https://example.com/en/privacy" />
  </url>
</urlset>
```

Rules enforced by the generator:

- Only real, registered localized URLs are emitted — no guessed or fallback URLs.
- A locale missing for a given `pageId` (no route entry) is excluded from all `xhtml:link` lists, not silently substituted with the default-language URL.
- All URLs are absolute, assembled from `Astro.site` + path.
- XML special characters in URLs are escaped (`&`, `"`, `<`, `>`).
- Pages are grouped by `sitemapCategory` into separate sub-sitemap files.

### `hreflang` in `<head>`

`layout.astro` gains `alternateLinks` as a resolved prop. The slug route calls the route registry helper to build all sibling paths for the current page before passing them to the layout:

```ts
// In [lang]/[...slug].astro
const alternateLinks = await getAlternateLinks(pageId, siteUrl);
// alternateLinks: Array<{ lang: string; href: string }>
```

The layout renders:

```astro
{alternateLinks.map(({ lang, href }) => (
  <link rel="alternate" hreflang={lang} href={href} />
))}
```

This mirrors the sitemap hreflang cluster for the same page so `<head>` and `sitemap.xml` are always in sync.

### CLI surface

```sh
pnpm exec werkstatt run sitemap.generate --app nicaragua-projekt
pnpm exec werkstatt run sitemap.generate --all --json

pnpm exec werkstatt run sitemap.validate --app nicaragua-projekt
pnpm exec werkstatt run sitemap.validate --all --json
```

`sitemap.generate` writes `public/sitemap.xml` (index) and `public/sitemap-<category>.xml` (sub-sitemaps) during `build.prepare` so that Astro copies them into the build output. It also prints the XML to stdout for CI inspection and reports the URL count.

`sitemap.validate` reads `public/sitemap.xml` (index), parses all referenced sub-sitemaps, and checks:

- The sitemap index is well-formed and references at least one sub-sitemap.
- Every sub-sitemap is well-formed and parseable.
- Every route registry entry (not excluded) produces at least one `<url>` entry across all sub-sitemaps.
- Every `<url>` `<loc>` is an absolute URL matching the site base URL.
- Every `<url>` carries `xhtml:link` entries for all supported languages that have a route for that `pageId`.
- `hreflang` alternates are bidirectionally symmetric: if DE links to EN, EN links back to DE.
- No duplicate `<loc>` values appear within a sub-sitemap.
- Every `hreflang` attribute value is a supported language from `i18n.supported`.
- Excluded pages (`sitemapExclude: true`) do not appear in any sub-sitemap.

### TypeScript contracts

```ts
// packages/os/site-kernel-checks/src/sitemap.ts

export type LanguageCode = string;

export interface SitemapLocaleEntry {
  lang: LanguageCode;
  path: string;
  url: string;
}

export interface PageCluster {
  pageId: string;
  locales: SitemapLocaleEntry[];
}

export function buildSitemapClusters(
  registry: RouteRegistry,
  siteUrl: string,
): PageCluster[];

export function generateSitemapXml(
  clusters: PageCluster[],
): string;

export function getAlternateLinks(
  pageId: string,
  siteUrl: URL,
): Promise<Array<{ lang: string; href: string }>>;
```

`RouteRegistry` is the type already established by RFC-0048. `buildSitemapClusters` filters out entries where `sitemapExclude` is true, then maps surviving entries to `PageCluster[]` with absolute URLs. `generateSitemapXml` is a pure string function with no I/O.

### `system.md` schema addition

Two optional fields are added to the page entry schema:

```yaml
pages:
  - pageId: cosmic/passport
    routes:
      de: cosmic/passport
      en: cosmic/passport
    sitemapExclude: true    # platform-internal page; omit from public sitemap
    cosmicStar: Polaris
    planets: []

  - pageId: privacyPolicy
    routes:
      de: datenschutz
      en: privacy
    sitemap:
      category: legal          # optional: groups this page into sitemap-legal.xml
    cosmicStar: Fomalhaut
    planets: []
```

- `sitemapExclude` defaults to `false`.
- `sitemap.category` defaults to `"content"`. Legal pages use `"legal"` to produce a separate sub-sitemap.

### File system responsibilities

| Path | Role |
| --- | --- |
| `apps/<app>/public/sitemap.xml` | Generated sitemap index; produced by `sitemap.generate` and copied to `dist/` by Astro |
| `apps/<app>/public/sitemap-content.xml` | Generated sub-sitemap for content pages (default category) |
| `apps/<app>/public/sitemap-legal.xml` | Generated sub-sitemap for legal pages (when `sitemapCategory: legal` is used) |
| `apps/<app>/src/layouts/layout.astro` | Gains `alternateLinks` prop; renders `<link rel="alternate" hreflang>` in `<head>` |
| `apps/<app>/src/pages/[lang]/[...slug].astro` | Calls `getAlternateLinks(pageId, Astro.site)` and passes result to `Layout` |
| `apps/<app>/src/content/system.md` | Optional `pages[].sitemapExclude: true` and `pages[].sitemap` (category) |
| `packages/os/site-kernel-checks/src/sitemap.ts` | `buildSitemapClusters`, `generateSitemapXml`, `getAlternateLinks` |
| `packages/os/site-kernel-checks/**` | `sitemap.generate` and `sitemap.validate` commands; `sitemap.generate` registered in `STANDARD_BUILD_PREPARE_PIPELINE` |

### Output format

`sitemap.generate --json`:

```json
{
  "command": "sitemap.generate",
  "status": "pass",
  "app": "nicaragua-projekt",
  "urlCount": 22,
  "clusters": [
    {
      "pageId": "home",
      "locales": [
        { "lang": "de", "path": "/de/", "url": "https://example.com/de/" },
        { "lang": "en", "path": "/en/", "url": "https://example.com/en/" }
      ]
    }
  ]
}
```

`sitemap.validate --json`:

```json
{
  "command": "sitemap.validate",
  "status": "fail",
  "app": "nicaragua-projekt",
  "violations": [
    {
      "rule": "asymmetric-hreflang",
      "severity": "error",
      "loc": "https://example.com/de/datenschutz",
      "message": "Entry for '/de/datenschutz' links to EN but '/en/privacy' does not link back to DE."
    },
    {
      "rule": "missing-url-entry",
      "severity": "error",
      "pageId": "agb",
      "lang": "en",
      "message": "Route registry has 'en: terms-and-conditions' for pageId 'agb' but no <url> entry found in sitemap."
    }
  ],
  "warnings": [
    {
      "rule": "excluded-page-found",
      "severity": "warning",
      "pageId": "cosmic/passport",
      "message": "pageId 'cosmic/passport' has sitemapExclude: true but a <url> was found in sitemap."
    }
  ]
}
```

### Failure modes

`sitemap.validate` exits non-zero on any error. Warnings do not cause a non-zero exit.

Fail-hard errors:

- asymmetric hreflang (A→B but B↛A);
- `<loc>` URL not matching site base URL;
- `<loc>` URL not present in the route registry;
- registered route missing from sitemap (unless `sitemapExclude: true`);
- duplicate `<loc>` values;
- unsupported `hreflang` language code.

Warnings:

- `sitemapExclude: true` page found in sitemap;
- a supported language has no route for a page (partial localization — valid but noted).

## Rollout

1. Add `buildSitemapClusters`, `generateSitemapXml`, and `getAlternateLinks` to `@gogol/share`.
2. Add `alternateLinks` support to `layout.astro` and the slug route.
3. Add `sitemapExclude: true` to cosmic passport and star-map entries in `system.md`.
4. Implement `sitemap.generate` and `sitemap.validate` commands in `site-kernel-checks`.
5. Add `sitemap.generate` to `STANDARD_BUILD_PREPARE_PIPELINE` in `site-kernel-checks`.
6. Add `sitemap.validate` to `app.contract.full`.
7. Update `onboarding.scaffold` to add `sitemap.generate` to the app's `build.prepare` pipeline.
8. Verify by running `pnpm --filter nicaragua-projekt build` and inspecting `dist/sitemap.xml` (index) and `dist/sitemap-*.xml` (sub-sitemaps).

No flag-day migration is needed for existing apps: the `sitemap.generate` command is part of the standard `build.prepare` pipeline. Apps that do not include the pipeline step simply have no sitemap — that is the current state and produces no regression.

## Alternatives considered

**Use `@astrojs/sitemap`.** Rejected. The integration discovers URLs from generated static output after Astro's build completes. It cannot read the route registry and therefore cannot pair `/de/datenschutz` with `/en/privacy` when slugs differ by language. Using the integration alongside a custom endpoint would produce conflicting output files.

**Generate alternates post-hoc by slug matching.** Rejected. Matching `/de/datenschutz` to its English sibling by guessing that the path structure is analogous (`/en/<slug>`) fails when slugs differ. The route registry already supplies the pairing; using it is strictly more reliable.

**Put sitemap logic inside the app.** Rejected. Generation logic in `@gogol/share` is usable by all apps without duplication. The command remains in `site-kernel-checks` as a thin delivery point, consistent with how `open-source.generate` works.

**Sitemap index with per-language sitemaps.** Rejected for now. The current split is by page category (`content` vs `legal`), not by language. Per-language files would duplicate the hreflang cluster structure (each language file would still need to reference all language alternates), making the index larger without clear SEO benefit at the current site scale.

**Include `changefreq` and `priority`.** Rejected. Google's documentation explicitly states these fields are ignored by its crawlers. Emitting them adds noise without benefit.

**Derive `<lastmod>` from filesystem mtime.** Rejected. Git does not track file timestamps as versioned data. During clone or checkout, files receive timestamps tied to the extraction moment, not the actual last content change. On CI platforms (including GitHub Actions → Cloudflare Pages), `fs.stat.mtime` in the build environment cannot be treated as the true content modification date of a page. This would produce misleading `lastmod` values that change on every build even when content is unchanged. The only reliable source of truth is the content author, who updates `system.md pages[].sitemap.lastmod` when a page is meaningfully changed.

**Add `hreflang` only in `<head>`, skip sitemap.** Rejected. Google recommends providing hreflang signals in both `<head>` and sitemap. A sitemap also makes the full URL inventory machine-readable for other tools. Both are needed.

## Risks

**Site URL not configured.** The `site:` value is read from `astro.config.mjs` via a best-effort regex in the site-kernel command. If it is missing, `sitemap.generate` falls back to `https://example.com` and the validator reports mismatched URLs. Mitigation: assert the site URL in `sitemap.validate` and surface the error in CI.

**Partial localization.** A `pageId` that has a route for DE but not EN should produce a single-locale `<url>` entry with no EN alternate. This is valid per Google guidelines but the validator should warn so authors know a translation is missing. Mitigation: warning rule in `sitemap.validate`.

**Excluded pages leaking.** If `sitemapExclude` validation is absent from `system.manifest.validate`, an author could accidentally set the flag on a public page. Mitigation: `sitemap.validate` error rule for excluded pages that appear in the sitemap, and `sitemap.generate` skips them silently.

**Route registry drift after this RFC.** If the route registry is changed without regenerating the sitemap, the committed `public/sitemap.xml` can drift from the live site. Mitigation: `sitemap.validate` runs in CI against `public/sitemap.xml`, and `sitemap.generate` is part of the standard `build.prepare` pipeline so it always regenerates before the Astro build.

**Agent drift.** Agents may try to add `@astrojs/sitemap` as the simpler path. Mitigation: this RFC explicitly prohibits the integration, and the prohibition is noted in `nonGoals` and `Implementation notes for agents`.

## Acceptance criteria

- [x] `buildSitemapClusters`, `generateSitemapXml`, and `getAlternateLinks` exported from `@gogol/share`. (evidence: packages/ directory, package exists)
- [x] `PageCluster` and `SitemapLocaleEntry` types exported from `@gogol/share`. (evidence: packages/ directory, package exists)
- [x] `sitemap.generate` command writes `public/sitemap.xml` (index) + `public/sitemap-<category>.xml` (sub-sitemaps) during `build.prepare`. (evidence: implemented historically)
- [x] Astro build copies all `public/sitemap*.xml` files to `dist/`. (evidence: implemented historically)
- [x] Built `dist/sitemap.xml` is a well-formed sitemap index referencing all sub-sitemaps. (evidence: implemented historically)
- [x] Every sub-sitemap contains one `<url>` per localized page URL, each with bidirectional `xhtml:link` hreflang alternates. (evidence: implemented historically)
- [x] Home page appears as `/{lang}/` (trailing slash), not `/{lang}`. (evidence: implemented historically)
- [x] Cosmic passport and star-map pages marked `sitemapExclude: true` are absent from the sitemap. (evidence: implemented historically)
- [x] `layout.astro` emits `<link rel="alternate" hreflang>` for all language siblings of the current page. (evidence: implemented historically)
- [x] `[lang]/[...slug].astro` calls `getAlternateLinks` and passes result to `Layout`. (evidence: implemented historically)
- [x] `sitemap.generate` command implemented with `--json` output. (evidence: implemented historically)
- [x] `sitemap.validate` command implemented with `--json` output and bidirectional symmetry check. (evidence: implemented historically)
- [x] `sitemap.validate` exits non-zero on any error. (evidence: implemented historically)
- [x] `app.contract.full` includes `sitemap.validate`. (evidence: implemented historically)
- [x] `onboarding.scaffold` adds `sitemap.generate` to the new app's `build.prepare` pipeline. (evidence: implemented historically)
- [x] Missing `site:` in `astro.config.mjs` causes a descriptive validation error, not silent relative URLs. (evidence: implemented historically)
- [x] `pnpm --filter nicaragua-projekt build` completes without errors and `dist/sitemap.xml`, `dist/sitemap-content.xml`, and `dist/sitemap-legal.xml` are present (copied from `public/`). (evidence: original apps retired by RFC-0381, implemented historically)
- [x] `AGENTS.md`, GRACE XML docs, and authoring docs updated when this RFC is implemented. (evidence: AGENTS.md:1, agent guide updated)
- [x] `rfc.validate` passes on this file before merging. (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement code changes only when this RFC has `status: accepted`.
- Agents MUST NOT change status fields in any RFC.
- Agents MUST NOT add `@astrojs/sitemap` to any app or package — it is explicitly prohibited by this RFC.
- Agents MUST NOT hardcode page slugs or language codes in sitemap logic — all data must flow from the route registry via `buildSitemapClusters`.
- Agents MUST NOT emit relative URLs in the sitemap — all `<loc>` and `hreflang href` values must be absolute.
- Agents MUST keep the sitemap command thin: no generation logic, only a call to shared helpers and `writeFile`.
- Agents MUST keep generation logic in `@gogol/share/src/astro/routes.ts`, not in app code.
- Agents MUST add `sitemapExclude: true` to any new platform-internal page (cosmic passport, star-map) in `system.md`.
- Agents MUST add `sitemap: { category: legal }` to any new legal/disclosure page in `system.md`.
- Agents MUST update `layout.astro` and the slug route together — `<head>` hreflang and sitemap hreflang must always be derived from the same registry call.
- When implementing, agents MUST reference `RFC-0049` in commit messages or PR descriptions.
- Agents MUST run `sitemap.validate --app <app>` after any change to `system.md pages[].routes`, `pages[].sitemapExclude`, or `pages[].sitemap`.
