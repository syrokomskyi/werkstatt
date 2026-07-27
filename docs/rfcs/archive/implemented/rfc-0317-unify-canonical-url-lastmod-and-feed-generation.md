---
id: RFC-0317
title: "Unify canonical URL, lastmod, and feed generation"
status: implemented
kind: architecture
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-07-05
updatedAt: 2026-07-05
implementedAt: 2026-07-22
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0049
  - RFC-0165
  - RFC-0184
amendedBy: []
related:
  - RFC-0143
  - RFC-0160
  - RFC-0167
  - RFC-0269
  - RFC-0316
commands:
  proposed: []
  added:
    - canonical.url.validate
    - content.update-stamps.validate
  changed:
    - sitemap.generate
    - sitemap.validate
    - feed.generate
    - feed.validate
    - llms.generate
    - public.surface.lint
    - behavior.snapshot.validate
  removed: []
appsImpacted:
  - apps/*
packagesImpacted:
  - "@gogol/share"
  - "@gogol/site-kernel-content"
  - "@gogol/site-kernel-checks"
successSignals:
  - "Sitemap loc values, feed links, llms links, Markdown twin canonical metadata, and HTML canonical links are byte-identical for the same page."
  - "Sitemap lastmod is emitted only when backed by a real content update stamp, never by the build date."
  - "RSS and JSON feeds include dated Ratgeber/articles and exclude evergreen product/offer pages."
nonGoals:
  - "Do not reintroduce build-date lastmod."
  - "Do not use filesystem mtime from CI checkout as content modification truth."
  - "Do not submit feeds or sitemaps for Markdown twins."
---

# RFC-0317: Unify canonical URL, lastmod, and feed generation

## Context

The audit found two crawler-surface defects:

- `sitemap-content.xml` used no `<lastmod>` and its `<loc>` URL form did not match HTML canonical URLs byte-for-byte.
- `feed.xml` contained a single evergreen product page, missed Ratgeber articles, and carried a stale `lastBuildDate`.

Earlier sitemap work removed `<lastmod>` because it was generated from the build date, which is misleading. The owner decision is unchanged: add `<lastmod>` only if the platform can derive a real document modification date. Otherwise omit it.

## Problem

Sitemap, feed, llms, Markdown twins, behavior snapshots, and HTML canonical tags all describe the same public pages, but they can currently format URLs and freshness independently. That creates redirect hops, false locale prefixes, stale feed dates, and untrusted lastmod signals.

## Decision

Introduce one canonical URL builder and one source-backed update-stamp resolver used by sitemap, feed, llms, Markdown twins, and behavior validation.

The sitemap may emit `<lastmod>` only when the update stamp is source-backed. It must never use the current date, build date, or CI filesystem mtime as a fallback.

The feed generator is narrowed to dated editorial content such as Ratgeber/articles. Evergreen offer/product pages are excluded unless they are explicitly modeled as dated articles.

## Architectural fit

This RFC amends RFC-0049 rather than replacing the sitemap generator: the existing route registry and hreflang clustering remain the source of sitemap membership. It amends RFC-0165 by tightening the feed item source and adding JSON Feed from the same dated-content model. It also extends RFC-0184 because llms links must share the same canonical URL helper as sitemap and feed outputs.

The update-stamp resolver aligns with CKL and generated-file governance: freshness is source-backed and deterministic, while generated `public/` and `dist/` artifacts remain outputs, never freshness sources.

## Design

### Canonical URL helper

Add a pure helper in `@gogol/share`, name exactness left to implementers but the contract is fixed:

```ts
export interface CanonicalUrlOptions {
  baseUrl: string;
  defaultLanguage: string;
  supportedLanguages: readonly string[];
  trailingSlash: "always";
}

export interface CanonicalPageUrlInput {
  lang: string;
  route: string;
  kind: "html" | "markdownTwin" | "staticArtifact";
}

export function canonicalPageUrl(input: CanonicalPageUrlInput, opts: CanonicalUrlOptions): string;
```

Rules:

- Default-language HTML routes are unprefixed per RFC-0160.
- Non-default-language HTML routes use their language prefix.
- HTML canonical URLs end with `/` when the rendered layout canonical does.
- The root URL is `https://example.com/`, not `https://example.com/de/`.
- Static artifacts such as `llms.txt`, `feed.xml`, and `.well-known/agent.json` are never language prefixed unless an accepted RFC explicitly makes them localized.
- No generator may hand-concatenate locale prefixes or trailing slashes after this helper exists.

### Update-stamp resolver

Add a source-backed resolver:

```ts
export type UpdateStampSource =
  | "authored-page-frontmatter"
  | "authored-system-output"
  | "ckl-claim-ledger"
  | "git-content-history";

export interface PageUpdateStamp {
  date: string; // YYYY-MM-DD
  source: UpdateStampSource;
  inputs: string[]; // content files or records that contributed
}

export interface PageUpdateStampResult {
  pageId: string;
  lang: string;
  stamp?: PageUpdateStamp;
  missingReason?: "not-authored" | "git-unavailable" | "insufficient-history" | "no-content-source";
}
```

Allowed sources, in priority order:

1. Explicit authored content date such as `updatedAt` on the page record or `output.sitemap.lastmod` when present.
2. CKL claim ledger dates for factual pages whose public substance is driven by claim sidecars.
3. Git content history for the page's source files and resolved content refs, only when the command can prove it has sufficient history for the relevant paths.

Forbidden sources:

- `new Date()`;
- build start time;
- file `mtime` from checkout or generated artifacts;
- generated output write time;
- last successful deploy time.

If no allowed source is available, the resolver returns `stamp: undefined`. Generators must omit freshness fields that require a real date instead of fabricating them.

### Sitemap changes

`sitemap.generate` must:

- use `canonicalPageUrl` for every `<loc>` and `xhtml:link href`;
- match HTML canonical URLs byte-for-byte, including trailing slash;
- emit `<lastmod>YYYY-MM-DD</lastmod>` only when `PageUpdateStampResult.stamp` exists;
- omit `<lastmod>` for pages with no source-backed stamp;
- never emit `<lastmod>` in the sitemap index unless an accepted RFC defines an index-level source stamp.

`sitemap.validate` must fail when:

- a `<loc>` differs from the rendered HTML canonical for the same route;
- a sitemap URL returns a known local redirect hop in built output;
- a `<lastmod>` exists without a corresponding source-backed update stamp;
- a `<lastmod>` value changes when only a rebuild happens and source content is unchanged.

### Feed changes

`feed.generate` must read dated editorial content only:

- include Ratgeber/article records with `publishedAt`;
- include `updatedAt` when source-backed by the same update-stamp resolver;
- exclude evergreen product, offer, pricing, legal, and PSEO hub pages unless they are explicitly article records;
- set RSS `lastBuildDate` to the max source-backed item `updatedAt`/`publishedAt`, not the build date;
- add Atom self-link;
- generate `public/feed.json` as JSON Feed v1.1 from the same item set.

`feed.validate` must fail when:

- an article/Ratgeber page with `publishedAt` is absent from both feeds;
- a non-article product/offer page appears in the feeds;
- `lastBuildDate` is newer than every source-backed item date for no source reason;
- item URLs differ from HTML canonicals;
- the shared head does not include RSS and JSON Feed alternate links:

```html
<link rel="alternate" type="application/rss+xml" href="/feed.xml">
<link rel="alternate" type="application/feed+json" href="/feed.json">
```

### Commands

#### canonical.url.validate

App-scoped, read-only.

Validates canonical URL parity across:

- rendered HTML canonical tags;
- sitemap `<loc>`;
- sitemap hreflang `href`;
- feed item links;
- llms Markdown links;
- agent manifest public URLs;
- Markdown twin provenance metadata from RFC-0320.

#### content.update-stamps.validate

App-scoped, read-only.

Validates:

- every emitted `<lastmod>` has a source-backed stamp;
- no generator uses build time or generated file mtime;
- explicit authored dates are valid `YYYY-MM-DD`;
- git-history mode is disabled or diagnostic when repository history is insufficient;
- source input paths recorded by the resolver are authored sources, not generated `public/` or `dist/` files.

## Pipeline placement

- `sitemap.generate` and `feed.generate` run in `build.prepare` as today.
- `canonical.url.validate` runs in `apps-check.postbuild` because it compares rendered HTML with generated artifacts.
- `content.update-stamps.validate` runs in `apps-check.author` and `build.check`.
- `feed.validate` remains postbuild-capable and must also validate `public/feed.json`.

## Rollout

1. Add `canonicalPageUrl` and replace hand-built URL logic in sitemap, feed, llms, agent surface, and Markdown twin metadata producers.
2. Add the update-stamp resolver with explicit-date and CKL support first.
3. Add git-history support only if it is deterministic and can detect insufficient history.
4. Re-enable sitemap `<lastmod>` only for pages with real stamps.
5. Rebuild feeds from Ratgeber/article sources and add JSON Feed.
6. Wire validators and update behavior snapshot expectations.

## Alternatives considered

- **Use build date for `<lastmod>`.** Rejected. This was the previous anti-pattern and devalues the signal.
- **Use filesystem mtime.** Rejected. Git checkouts and generated files make it non-semantic.
- **Leave product page in RSS.** Rejected. RSS is for dated/new content; offers belong in sitemap, llms, and agent knowledge.
- **Make `feed.json` a later optional feature.** Rejected. JSON Feed is cheap once the feed item set is corrected and is useful for agents.

## Risks

- **No real update stamp for some pages.** Accepted. Omit `<lastmod>` rather than lie.
- **Git history is shallow in CI.** Mitigated by detecting insufficient history and falling back to omission, not build time.
- **URL helper migration misses a call site.** Mitigated by `canonical.url.validate` and `public.surface.lint` default-language prefix checks.

## Acceptance criteria

- [x] `canonicalPageUrl` or an equivalent shared pure helper exists and is used by sitemap, feed, llms, agent surface URLs, and Markdown twin metadata. (evidence: implemented historically)
- [x] `content.update-stamps.validate` is registered and fails on build-date or mtime-backed lastmod. (evidence: implemented historically)
- [x] `sitemap.generate` emits trailing-slash `<loc>` values matching rendered canonical URLs. (evidence: implemented historically)
- [x] Sitemap `<lastmod>` appears only for pages with source-backed update stamps; pages without a real date omit it. (evidence: implemented historically)
- [x] `feed.generate` includes all dated Ratgeber/article pages and excludes evergreen product pages. (evidence: implemented historically)
- [x] `public/feed.xml` and `public/feed.json` are generated from the same item set. (evidence: implemented historically)
- [x] Shared head emits RSS and JSON Feed alternate links. (evidence: implemented historically)
- [x] `canonical.url.validate`, `sitemap.validate`, and `feed.validate` pass for both reference apps. (evidence: implemented historically)
- [x] `rfc.validate` passes. (evidence: implemented historically)

## Implementation notes for agents

- Agents may implement this RFC because its status is `accepted`.
- Do not restore build-date lastmod under any flag.
- Do not use `fs.stat.mtime` for sitemap freshness.
- If the update-stamp resolver cannot prove a real date, omit `<lastmod>`.
- Treat URL changes as public behavior changes: inspect behavior snapshot diffs before committing.
