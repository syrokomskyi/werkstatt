---
id: RFC-0167
title: "Add a sellable Blog and Articles content module"
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
  - RFC-0208
  - RFC-0209
related:
  - RFC-0026
  - RFC-0047
  - RFC-0143
  - RFC-0161
  - RFC-0163
  - RFC-0165
  - RFC-0169
commands:
  proposed: []
  added:
    - blog.validate
  changed:
    - apps-check.run
  removed: []
appsImpacted:
  - apps/*
packagesImpacted:
  - packages/ui
  - packages/share
  - packages/ontology
  - packages/business
  - packages/os/site-kernel-checks
successSignals:
  - "A site can enable a Blog module that adds article list and detail pages with correct Article/BlogPosting JSON-LD, dates, author, and tags."
  - "Articles feed the RSS (RFC-0165) and per-page Markdown (RFC-0166) without bespoke code."
  - "The module is gated by an entitlement (RFC-0169) so it ships only to subscribers who paid for it."
nonGoals:
  - "Do not couple the blog to a specific CMS — content flows through the Content Source Provider (RFC-0141)."
  - "Do not build comments, search, or pagination beyond a simple list in the first cut."
---

# RFC-0167: Add a sellable Blog and Articles content module

## Context

The web studio wants to sell a Blog/Articles capability as a discrete, paid module. Today there is no article archetype: all long-form pages use `semanticType: content` and render as a bare `WebPage` (no `Article`/`BlogPosting`, no `datePublished`/`dateModified`/`author`/tags). That weakens Google freshness/Discover signals and LLM recency/attribution — and there is nothing to package and gate as a product.

The platform already has the building blocks: block-declarative pages (RFC-0026), the semantic content domains (RFC-0047), the Generator Contract (RFC-0143), feature governance (RFC-0161), corrected JSON-LD (RFC-0163), feeds/sitemap (RFC-0165), and Markdown twins (RFC-0166). The blog is their composition into a sellable unit.

## Problem

- No Article schema, dates, author entity, or tag taxonomy exists, so dated/editorial content is under-described for both Google and LLMs.
- There is no list/detail article archetype and no module boundary to enable/disable or sell.
- RSS (RFC-0165) and Markdown twins (RFC-0166) have no dated content model to consume.

## Decision

A Blog module is introduced as a new content archetype set plus a semantic `article` type. It adds: an `articles` content shape (front-matter with `title`, `summary`, `publishedAt`, `updatedAt`, `author`, `tags`, `heroImage`, prose body via `contentRef`), `article-list` and `article-detail` section/page archetypes, an `Article`/`BlogPosting` JSON-LD node (with `author` as `Person`/`Organization`, `datePublished`, `dateModified`, `image`, `articleSection`/`keywords`), and a tag taxonomy. The module is enable/disable as a feature (RFC-0161) gated by an entitlement (RFC-0169). `blog.validate` enforces the article contract and joins `apps-check.run`.

## Architectural fit

- **RFC-0026/0047:** articles are block-declarative pages in an `articles` content domain; no markdown body in page files (prose lives in `prose/` and is referenced).
- **RFC-0163:** the `Article` node is added to the corrected JSON-LD pipeline; `ogType: "article"` (RFC-0162) is set for article pages.
- **RFC-0165/0166:** articles are the dated source the RSS feed and Markdown twins consume.
- **RFC-0161/0169:** "blog" is a feature flag resolved from an entitlement; disabled sites compile no article routes.
- **Scaling Playbook:** the module adds a bounded archetype set; it does not alter core DNA.

## Design

### CLI surface

```sh
pnpm exec site-kernel run blog.validate --app webgogol-com --json
```

### TypeScript contracts

```ts
// packages/share — article semantic shape
export type SemanticArticle = {
  slug: string;
  title: string;
  summary: string;
  publishedAt: string;          // ISO date
  updatedAt?: string;           // ISO date; defaults to publishedAt
  author: SemanticPerson;       // reuses existing Person model
  tags: string[];
  heroImage?: SemanticImage;    // reuses RFC-0162 SemanticImage
  bodyRef: string;              // prose/{lang}/<slug>
};

// JSON-LD node (RFC-0163 pipeline)
//   "@type": ["Article","BlogPosting"], headline, datePublished, dateModified,
//   author{ @type:Person }, image, articleSection, keywords, mainEntityOfPage
export const SEMANTIC_TYPE_ARTICLE = "article" as const; // added to SemanticPageType
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/ui/src/sections/article-list/**` | List archetype (cards: title, date, summary, tag) |
| `packages/ui/src/sections/article-detail/**` | Detail archetype (hero, byline, prose, share) |
| `packages/ui/src/pages/blog-index-page.manifest.yaml`, `article-page.manifest.yaml` | Star-layer page archetypes |
| `packages/share/src/semantic/jsonld/article.ts` | `Article`/`BlogPosting` node |
| `apps/*/src/content/articles/{lang}/*.md` | Authored article front-matter (client-editable) |
| `packages/os/site-kernel-checks/src/blog.ts` | `blog.validate` |

### Output format

```json
{
  "command": "blog.validate",
  "status": "fail",
  "violations": [
    { "article": "de/digitale-souveraenitaet", "rule": "missing-publishedAt" },
    { "article": "en/foo", "rule": "unknown-author", "message": "author not in team/business" }
  ]
}
```

### Failure modes

`blog.validate` fails on: missing `publishedAt`, `updatedAt` earlier than `publishedAt`, unknown `author` (must resolve to a business/team person), empty `tags` when the biome requires them, or a `bodyRef` with no prose entry. Exits non-zero. When the blog feature is disabled for an app, `blog.validate` is a no-op pass.

## Rollout

- The module ships disabled by default; an app opts in via the feature flag (resolved by RFC-0169 entitlement).
- New article content domain registers in `content.surface.validate`'s allowed domains.
- `Article` JSON-LD, RSS items, and `.md` twins activate automatically once articles exist.
- The cosmic names for the new archetypes are reserved from the catalogs per the standard checklist.

## Alternatives considered

- **Reuse `semanticType: content` with optional dates:** rejected — conflates legal/info pages with editorial content and gives no module boundary to sell or gate.
- **External blogging platform embed (Medium/Ghost):** rejected — breaks the thin/own-your-content model and the same-origin SEO surface.
- **Tags as free strings:** rejected for the schema — tags resolve against a per-app taxonomy so `keywords`/`articleSection` stay coherent.

## Risks

- **Author identity duplication:** authors must resolve to the existing Person/business model, not a new parallel list; enforced by `blog.validate`.
- **Date provenance:** `publishedAt`/`updatedAt` are authored, not git-derived, to stay client-editable and deterministic; `updatedAt` defaults to `publishedAt`.
- **Index bloat / thin content:** list pagination and `noindex` for tag-archive pages (RFC-0165) prevent thin-content penalties.

## Acceptance criteria

- [x] `article` semantic type defined (`SemanticPageType`) + `articleMetadataSchema` (system.md `article:`). **Scope note:** the separate `articles` content domain and a dedicated `SemanticArticle` type were intentionally NOT introduced — an article is an ordinary block-declarative page carrying `semanticType: article` + `article:` frontmatter. This satisfies the module goals (Article JSON-LD, RSS, Markdown twins, image sitemap, list, entitlement gating) with no parallel content model. (evidence: original apps retired by RFC-0381, implemented historically)
- [x] `article-list` section archetype (cosmic name `Io`) auto-enumerates article pages (title/date/summary/tags, newest-first) via `getArticleSummaries`; article **detail** is an existing hero+markdown page carrying `article:` frontmatter (no separate detail archetype, per accepted scope) (evidence: implemented historically)
- [x] `Article`/`BlogPosting` JSON-LD with dates, author, tags emitted via the RFC-0163 pipeline (evidence: implemented historically)
- [x] Articles feed RSS (RFC-0165) and Markdown twins (RFC-0166) (evidence: implemented historically)
- [x] `blog` feature gated by entitlement (RFC-0169): when `blog` is absent from `entitlements.generated.json`, the route registry excludes `semanticType: article` pages (no article route compiles) and the sitemap + RSS feed omit them; fail-open when entitlements are unknown. Verified by a build smoke test (blog off → de+uk article routes gone, absent from sitemap/feed, home intact) (evidence: implemented historically)
- [x] `blog.validate` registered and in `apps-check.run` (author phase); no-op when blog not entitled; validates dates, tags, and author resolution against business content (evidence: implemented historically)
- [x] `AGENTS.md` documents the blog authoring surface (`apps/AGENTS.md` → "Blog and Articles"; lead-image contract in `packages/ui/AGENTS.md`) (evidence: AGENTS.md:1, agent guide updated)
- [x] `rfc.validate` passes on this file before merging (evidence: implemented historically)

## Primary image contract (shared with RFC-0162/0165)

Every page resolves a single `SemanticPageModel.primaryImage` that feeds `og:image`, JSON-LD `primaryImageOfPage`/`Article.image`, and (when it is a real content illustration) the image sitemap. Precedence:

1. **Author-declared `output.image`** (RFC-0143 projection; absolute https url) → tagged `contentImage: true`.
2. **Hero `leadImage`** — a new hero-section field (`{ src, alt }`, `src` a content-asset token, `alt` required) distinct from the decorative `backgroundImage`. It is the natural authoring home for the lead illustration. _Note:_ its token resolves only in the Astro render layer (content-hashing), so today it surfaces to SEO via `output.image`; an automatic hero→`output.image` bridge (render-emitted image manifest) is a follow-up.
3. **RFC-0150 preview screenshot** (`/preview/<lang>/<slug>.png`) — synthetic fallback; serves `og:image` only, never the image sitemap (`contentImage` unset).
4. Business logo (last-resort `og:image`).

`SemanticImage` carries a `contentImage?: boolean` flag; only `contentImage: true` images enter `image:image` (RFC-0165). Decorative hero backgrounds never become the primary image.

## Implementation notes for agents

- Agents MAY implement only when this RFC is `accepted`.
- The hero `leadImage` is the lead/content illustration; never source SEO images from `backgroundImage` (decorative).
- Articles are block-declarative; never add a markdown body to an article page file — reference prose.
- `author` MUST resolve to an existing business/team Person; do not create a parallel author list.
- Set `ogType: "article"` and emit `Article` JSON-LD only for the `article` semantic type.
- The blog module MUST be gate-able to nothing (disabled) without breaking a build.
- Agents MUST NOT weaken `blog.validate` without a superseding RFC.
