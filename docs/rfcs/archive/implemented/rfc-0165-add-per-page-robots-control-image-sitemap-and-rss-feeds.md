---
id: RFC-0165
title: "Add per-page robots control, image sitemap, and RSS feeds"
status: implemented
kind: architecture
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-06-06
updatedAt: 2026-06-07
implementedAt: 2026-06-07
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy:
  - RFC-0172
  - RFC-0317
related:
  - RFC-0052
  - RFC-0143
  - RFC-0159
  - RFC-0160
  - RFC-0167
commands:
  proposed: []
  added:
    - dist.sitemap.images.generate
    - feed.generate
    - feed.validate
    - robots.page.validate
  changed:
    - sitemap.generate
    - apps-check.run
  removed: []
appsImpacted:
  - apps/*
packagesImpacted:
  - packages/share
  - packages/os/site-kernel-checks
  - packages/os/site-kernel-content
successSignals:
  - "An author can mark a page noindex from system.md without touching engineering code, and the directive reaches both the robots meta tag and the sitemap."
  - "The sitemap advertises page images via image:image, opening the Google Images and Discover channels."
  - "Each app exposes a valid RSS/Atom feed for its dated content."
nonGoals:
  - "Do not define the Article/blog content model — RFC-0167 owns it; this RFC only consumes dated entries that exist."
  - "Do not change the existing sitemap clustering or hreflang behavior."
---

# RFC-0165: Add per-page robots control, image sitemap, and RSS feeds

## Context

The sitemap generator already emits `lastmod` and `xhtml:link` hreflang clusters ([`routes.ts`](../../packages/share/src/astro/routes.ts)), and `robots.generate` (RFC-0052) emits a site-level `robots.txt`. But three discovery surfaces are missing, all of which matter for the "rank first in Google and surface in widgets/LLMs" goal:

1. **No per-page indexability control.** The shared layout accepts a `robots` prop, but [`page-handler.ts`](../../packages/share/src/astro/page-handler.ts) never populates it; only `release.passport.indexable` exists. Service pages (`musterWiderruf`, `widerruf`) cannot be marked `noindex` from the authoring surface.
2. **No image sitemap.** `image:image` entries are absent, leaving Google Images/Discover untapped.
3. **No RSS/Atom feed.** Aggregators and freshness-sensitive crawlers (and some LLM ingestion paths) have nothing to subscribe to.

## Problem

- Indexability is not an authorable, client-editable property — it requires engineering changes, contradicting the client-editable surface model.
- The sitemap under-describes the site (no images), costing image-search and Discover impressions.
- Dated content (RFC-0167 articles; existing news-like pages) has no syndication channel.

## Decision

A per-page `output.robots` projection is added to the closed `output` schema (RFC-0143), authorable in `system.md`/page frontmatter, and resolved by `resolvePageOutput`. The layout's `robots` meta and the sitemap both read it (a `noindex` page is dropped from the sitemap and emits `<meta name="robots" content="noindex,follow">`). The sitemap gains optional `image:image` entries via `dist.sitemap.images.generate`. A new `feed.generate` emits per-language RSS 2.0 (with an Atom self-link) for dated content. New validators `feed.validate` and `robots.page.validate` join `apps-check.run`.

## Architectural fit

- **RFC-0143 Generator Contract:** `robots` is a per-page `output.<id>` projection resolved by `resolvePageOutput`; `feed.generate`/`dist.sitemap.images.generate` are content-driven, idempotent, single-owner generators writing into the project tree.
- **RFC-0052 robots.txt:** the page-level directive complements (does not replace) the site-level policy; the feed and image sitemap are advertised from `robots.txt`/`<head>`.
- **RFC-0159/0160 routing:** `noindex` interacts correctly with unprefixed default-language and `x-default`.
- **RFC-0167 blog:** the feed consumes the Article model; this RFC degrades to "no dated entries → empty-but-valid feed" until the blog ships.

## Design

### CLI surface

```sh
pnpm exec site-kernel run dist.sitemap.images.generate --app nicaragua-projekt
pnpm exec site-kernel run feed.generate --app warpgogol-com
pnpm exec site-kernel run feed.validate --all --json
pnpm exec site-kernel run robots.page.validate --all
```

### TypeScript contracts

```ts
// RFC-0143 output schema extension (resolved form):
export type RobotsProjection = {
  index: boolean;       // false -> noindex
  follow: boolean;      // false -> nofollow
  // resolved <meta name="robots"> content string built from the two flags
};

// PageOutputProjection gains: robots: RobotsProjection
// Authoring (system.md pages[].output or page frontmatter):
//   output: { robots: { index: false } }

export type FeedItem = {
  title: string;
  url: string;          // absolute
  summary: string;
  publishedAt: string;  // ISO; from Article model (RFC-0167)
  updatedAt?: string;
};
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/share/src/semantic/output-projection.ts` | Add `robots` to the closed `output` schema + `resolvePageOutput` |
| `packages/share/src/astro/page-handler.ts` | Resolve `robots` → layout `robots` prop |
| `packages/share/src/astro/routes.ts` | Drop `noindex` pages from sitemap; emit `image:image` |
| `packages/share/src/semantic/feed.ts` | Pure RSS/Atom formatter |
| `apps/*/public/sitemap*.xml`, `apps/*/public/feed.xml` | Generated outputs (Astro copies to dist) |
| `packages/os/site-kernel-checks/src/{feed,robots-page}.ts` | `feed.validate`, `robots.page.validate` |

### Output format

```json
{
  "command": "feed.validate",
  "status": "fail",
  "violations": [
    { "app": "warpgogol-com", "rule": "feed-item-missing-pubdate", "item": "/blog/foo" }
  ]
}
```

### Failure modes

`robots.page.validate` fails if a page's resolved `robots.index === false` but it still appears in the sitemap, or if a `noindex` page is referenced by an `og:image`-bearing indexable parent. `feed.validate` fails on malformed XML, missing `pubDate`, or non-absolute URLs. Both exit non-zero.

## Rollout

- The `output.robots` projection defaults to `{ index: true, follow: true }` — existing pages are unaffected.
- `dist.sitemap.images.generate` and `feed.generate` register in `APPS_BUILD_PREPARE_PIPELINE`.
- `feed.validate` ships in `warn` until both apps have dated content, then fail-hard.
- New apps inherit all three from the scaffold.

## Alternatives considered

- **Astro's `@astrojs/rss` / `@astrojs/sitemap`:** rejected as the owner — they bypass the `SemanticSiteModel` and the Generator Contract, creating a second source of truth; the pure formatters in `@gogol/share` keep one model.
- **News sitemap (`news:news`):** deferred — only relevant for sites publishing >30 articles/2 days; revisit when a client needs it.
- **Per-page robots in a separate file:** rejected — indexability belongs in the existing per-page `output` projection.

## Risks

- **Accidental `noindex` propagation** via default-language fallback merge; covered by `robots.page.validate` running over every generated route.
- **Image sitemap bloat:** cap images per URL and only include content images (not decorative). Source: the author-declared `output.image` projection (`contentImage: true`); the synthetic RFC-0150 preview screenshot is deliberately NOT advertised in `image:image` (it serves `og:image` only). Hero content images are Astro content-hashed in the render layer and therefore not resolvable by the pre-build CLI generator — auto-bridging a hero `leadImage` into `image:image` requires a render-emitted per-page image manifest and is a documented follow-up.
- **Feed/​sitemap drift from `dist`:** generators write to `public/` and validators read from the project tree, per RFC-0049.

## Acceptance criteria

- [x] `output.robots` added to the closed `output` schema + resolver, authorable from `system.md` (evidence: implemented historically)
- [x] Layout robots meta and sitemap both honor the resolved directive (evidence: implemented historically)
- [x] `sitemap.generate` emits `image:image` from `output.image`; `feed.generate` emits valid RSS/Atom <!-- RSS done (commit d0591666); image:image emitted inline by sitemap.generate from the per-page output.image projection (contentImage:true), namespace xmlns:image added, both apps regenerated + sitemap.validate green --> (evidence: implemented historically)
- [x] `feed.validate` + `robots.page.validate` registered and in pipelines (evidence: implemented historically)
- [x] `--json` outputs documented and stable (evidence: implemented historically)
- [x] Both reference apps build green; feed + image sitemap present in dist <!-- feed.xml present; image sitemap delivered post-build as dist/client/sitemap-images.xml via RFC-0172 (the inline pre-build image:image of this RFC was superseded by that render-sourced harvester) --> (evidence: implemented historically)
- [x] `AGENTS.md` (authoring) documents per-page robots authoring <!-- apps/AGENTS.md → "Per-page robots / indexability (RFC-0165)" --> (evidence: AGENTS.md:1, agent guide updated)
- [x] `rfc.validate` passes on this file before merging (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement only when this RFC is `accepted`.
- `robots` is part of the closed `output` schema — extend the schema in the same change that adds the projection (RFC-0143 rule).
- Generators MUST write to `public/`, never `dist/`; validators read from the project tree.
- The feed consumes the Article model from RFC-0167; do not invent a parallel dated-content source.
- Agents MUST NOT weaken `feed.validate`/`robots.page.validate` without a superseding RFC.
