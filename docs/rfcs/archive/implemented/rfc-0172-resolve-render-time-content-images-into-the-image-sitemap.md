---
id: RFC-0172
title: "Resolve render-time content images into the image sitemap"
status: implemented
kind: architecture
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-06-06
updatedAt: 2026-06-09
implementedAt: 2026-06-07
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0165
amendedBy:
  - RFC-0185
related:
  - RFC-0028
  - RFC-0049
  - RFC-0085
  - RFC-0143
  - RFC-0150
  - RFC-0152
  - RFC-0162
  - RFC-0165
  - RFC-0167
commands:
  proposed: []
  added:
    - dist.sitemap.images.generate
    - dist.sitemap.images.validate
  changed:
    - sitemap.generate
    - apps-check.run
  removed: []
appsImpacted:
  - apps/*
packagesImpacted:
  - packages/ui
  - packages/share
  - packages/os/site-kernel-checks
  - packages/os/site-kernel-astro
successSignals:
  - "A page whose hero declares a `leadImage` appears in the image sitemap with the real deployed image URL (the Astro content-hashed `/_astro/<hash>.webp`), with no author-declared `output.image` required."
  - "The image sitemap never advertises a synthetic RFC-0150 preview screenshot or a decorative hero background — only genuine content illustrations."
  - "Image:image emission has a single owner; authored `output.image` and rendered hero `leadImage` flow through the same path without two competing mechanisms."
nonGoals:
  - "Do not re-resolve image hashes outside the render — the build is the only authority on the final asset URL."
  - "Do not change the route/hreflang page sitemaps (RFC-0049) — this RFC only adds image entries."
  - "Do not introduce a runtime image-sitemap endpoint; the artifact is static, emitted at build."
---

# RFC-0172: Resolve render-time content images into the image sitemap

## Context

RFC-0165 opened the image-sitemap channel and RFC-0167 added the hero `leadImage` field (the page's lead/content illustration, distinct from the decorative `backgroundImage`). The intent of initiative A was that **authors get image-sitemap coverage for free by filling the hero** — no separate SEO bookkeeping.

That intent is only half-delivered. The current `image:image` emission lives in the **pre-build** `sitemap.generate` ([sitemap.ts](../../packages/os/site-kernel-checks/src/sitemap.ts)), which runs from `system.md` before Astro builds. It can therefore only emit an image URL it can know deterministically: the author-declared, absolute `output.image` projection (RFC-0143). The hero `leadImage` is a **content-collection asset token** (`"hero-1"`); its real served URL is the Astro **content-hashed** `/_astro/<hash>.webp` (or, with Cloudflare Image Transformations on, `/cdn-cgi/image/.../_astro/<hash>.webp` — see [image-optimization-and-cloudflare-transformations.md](../engineering/image-optimization-and-cloudflare-transformations.md)). That hash is produced by the build and is **not reproducible** by a pre-build CLI generator.

So today the only way to put a hero image in the sitemap is to also hand-author an absolute `output.image` — exactly the duplicate bookkeeping the design set out to avoid.

## Problem

- The hero `leadImage` (RFC-0167) renders an indexable `<img>` but never reaches the image sitemap, because its URL is only known **after** the render.
- A pre-build generator cannot resolve content-hashed asset URLs without re-implementing Astro/Vite hashing — a brittle second source of truth that RFC-0152 explicitly forbids (`do not hand-build /cdn-cgi/image or /_astro URLs`).
- There are now two latent `image:image` mechanisms (authored `output.image` inline at pre-build; hero images unreachable) with no single owner — drift risk as more section archetypes grow lead images (article-detail in RFC-0167).

## Decision

`image:image` emission moves to a **post-build, render-sourced** generator. The build is the single authority on final image URLs, so the image sitemap is derived from the **rendered HTML**, not re-resolved from content.

1. **Render-time signal (single contract).** Any section that owns the page's lead illustration marks the resolved `<img>` with a stable, machine-readable hook, `data-content-image` (a boolean attribute). The hero sets it on the `leadImage` `<img>`. Exactly one element per page carries it; the layout/section contract guarantees uniqueness. This is the deploy-correct URL (passthrough `/_astro/<hash>.webp` or the transform `/cdn-cgi/image/...` form), whatever the active Image Provider (RFC-0152) emitted.

2. **Post-build generator `dist.sitemap.images.generate`.** A new generator reads `dist/client/**/*.html` (the same surface `cloudflare.assets.validate` already scans), extracts each page's `data-content-image` URL, joins it to the page `<loc>` (canonical URL already in the document), and emits a dedicated **image sitemap** at `dist/client/sitemap-images.xml`. It runs in the post-build phase, alongside the established post-build dist emitters (`passport.emit`, RFC-0028). Pages with no content image contribute no entry; the file is always valid (possibly empty).

3. **Index reference.** `sitemap.generate` (pre-build, `public/sitemap.xml` index) gains a static reference to `sitemap-images.xml` so crawlers discover it. The route/hreflang page sitemaps (RFC-0049) are unchanged.

4. **Supersede the pre-build inline emission (amends RFC-0165).** The inline `image:image` block added to `sitemap-content.xml`/`sitemap-legal.xml` is removed; authored `output.image` reaches the image sitemap through the same render path (it is already in the rendered head as `og:image`/`primaryImageOfPage` when `contentImage: true`), so the two sources unify under one owner.

## Architectural fit

- **RFC-0152 Image Provider Port:** the generator consumes whatever URL the provider emitted; it never constructs `/cdn-cgi/image` or `/_astro` URLs. Provider swaps (CMS/DAM later) require no generator change.
- **RFC-0028 `passport.emit` / RFC-0085 post-build pipeline:** this is the same shape — a post-build step that reads/writes `dist/` artifacts. `dist/` is build output (gitignored), so RFC-0154 (build must not mutate **tracked** content) is not engaged.
- **RFC-0049 sitemap:** untouched for routes/hreflang; the image sitemap is additive.
- **RFC-0143 Generator Contract:** single-owner, idempotent, content-(here, render-)driven. The validator reads the project/dist artifact; the generator writes exactly one file.
- **RFC-0165/0167:** completes RFC-0165's image-sitemap criterion and makes RFC-0167's hero `leadImage` deliver SEO value automatically.

## Design

### CLI surface

```sh
pnpm exec werkstatt run dist.sitemap.images.generate --app nicaragua-projekt
pnpm exec werkstatt run dist.sitemap.images.validate --app nicaragua-projekt --json
pnpm exec werkstatt run dist.sitemap.images.validate --all --json
```

`dist.sitemap.images.generate` is **post-build** (requires `dist/client/`). `dist.sitemap.images.validate` joins `apps-check.run` (post-build phase).

### TypeScript contracts

```ts
// One resolved image entry harvested from rendered HTML.
export interface SitemapImageEntry {
  loc: string;        // absolute page URL (canonical, from the document)
  imageUrl: string;   // absolute; provider-emitted (/_astro/<hash> or /cdn-cgi/image/...)
  title?: string;     // from the <img alt>, when present
}

// Harvest contract: read dist/client HTML → entries.
export interface HarvestImageSitemapInput {
  distClientDir: string;
  siteUrl: string;    // origin for absolutizing relative image src
}
export type HarvestImageSitemap = (i: HarvestImageSitemapInput) => Promise<SitemapImageEntry[]>;
```

The render-side contract is a single attribute, not a type: the lead `<img>` carries `data-content-image`. The hero sets it; future lead-bearing archetypes (article-detail) set it identically.

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/ui/src/sections/hero/hero-section.astro` | Emits `data-content-image` on the resolved `leadImage` `<img>` |
| `packages/os/site-kernel-checks/src/sitemap-images.ts` | `dist.sitemap.images.generate` / `dist.sitemap.images.validate` |
| `packages/os/site-kernel-checks/src/sitemap.ts` | Index gains static `sitemap-images.xml` reference; inline `image:image` removed |
| `apps/<app>/dist/client/sitemap-images.xml` | Generated post-build artifact (not committed) |

### Output format

```json
{
  "command": "dist.sitemap.images.generate",
  "app": "nicaragua-projekt",
  "status": "ok",
  "file": "dist/client/sitemap-images.xml",
  "entries": [
    { "loc": "https://nicaragua-projekt.org/", "imageUrl": "https://nicaragua-projekt.org/_astro/hero-1.a1b2c3.webp", "title": "Mädchen mit einem Karton voller Hilfsgüter" }
  ],
  "summary": { "pagesScanned": 18, "imagesFound": 6 }
}
```

```json
{
  "command": "dist.sitemap.images.validate",
  "app": "nicaragua-projekt",
  "status": "fail",
  "violations": [
    { "rule": "IMGSITEMAP-02", "severity": "error", "loc": "https://…/x", "message": "image src is relative or non-deployable" }
  ]
}
```

### Failure modes

- `IMGSITEMAP-01`: more than one `data-content-image` element on a page → fail (the lead image must be unique per page).
- `IMGSITEMAP-02`: a harvested image URL is relative-after-absolutize or points outside the deployable origin → fail.
- `IMGSITEMAP-03`: `dist/client/` missing → fail with "run build first" (post-build command).
- `IMGSITEMAP-04`: a `data-content-image` URL is a `/preview/*.png` (RFC-0150 screenshot) or a known decorative-background asset → fail (screenshots/backgrounds must not be content images).
- Empty result (no content images anywhere) is **valid**: emit an empty urlset, exit 0.

## Rollout

1. Add `data-content-image` to the hero `leadImage` `<img>`; document the attribute in `packages/ui/AGENTS.md` as the lead-image contract for archetypes.
2. Implement the pure harvester + XML formatter in `@gogol/share` (unit-testable on HTML fixtures, no build needed).
3. Implement `dist.sitemap.images.generate`/`validate`; add the validator to `apps-check.run` post-build phase in `warn` for one cycle, then fail-hard.
4. Wire `dist.sitemap.images.generate` into the post-build pipeline next to `passport.emit`.
5. Add the static `sitemap-images.xml` reference to the index in `sitemap.generate`; remove the inline pre-build `image:image` emission (RFC-0165 amend).
6. New apps inherit all of the above from the scaffold; no per-app code.

## Alternatives considered

- **Astro `astro:build:done` integration emitting a per-page image manifest:** rejected as the first cut — it adds an integration and a manifest artifact, while the rendered HTML already contains the resolved URL and is already scanned post-build by `cloudflare.assets.validate`. The manifest may be revisited if HTML scraping proves fragile, but the `data-content-image` hook makes scraping a stable contract, not a guess.
- **Reproduce Astro/Vite content hashing pre-build:** rejected — brittle, duplicates the bundler, and forbidden by RFC-0152.
- **Augment the existing `sitemap-content.xml`/`-legal.xml` in `dist` post-build:** rejected — it would make the committed `public/` sitemaps diverge from the served `dist/` ones (RFC-0049 drift). A dedicated, additive image sitemap keeps each file single-purpose.
- **Keep authoring `output.image` per page:** rejected as the primary path — it is the duplicate bookkeeping this initiative set out to remove. `output.image` remains valid as an explicit override; it simply flows through the same render→harvest path.

## Risks

- **HTML scraping fragility:** mitigated by the explicit `data-content-image` contract and `IMGSITEMAP-01` uniqueness check; the generator never guesses by CSS class.
- **Transform-flag dependence:** when `PUBLIC_CF_IMAGE_TRANSFORM=on`, harvested URLs are `/cdn-cgi/image/...`; the generator stores them verbatim. If the zone later disables Transformations those URLs 404 — but that is the same site-wide failure RFC-0152 already documents, not specific to the sitemap.
- **Post-build ordering:** the generator MUST run after Astro build and after image emission; enforced by pipeline placement (post-build, with `passport.emit`).
- **Stale image sitemap on partial builds:** the file is regenerated each build from the current `dist/`, so it cannot drift from the deployed assets.

## Acceptance criteria

- [x] `data-content-image` emitted on the hero `leadImage` `<img>` (via `<ResponsiveImage>` pass-through); contract documented in `packages/ui/AGENTS.md` (evidence: AGENTS.md:1, agent guide updated)
- [x] Pure HTML→entries harvester + image-sitemap XML formatter in `@gogol/share` with unit tests (9 tests) (evidence: packages/ directory, package exists)
- [x] `dist.sitemap.images.generate` writes `dist/client/sitemap-images.xml`; idempotent; empty-but-valid when no content images (evidence: implemented historically)
- [x] `dist.sitemap.images.validate` registered, in `apps-check.run` post-build phase (`apps-check.postbuild` green, 14 steps) (evidence: implemented historically)
- [x] `sitemap.generate` index references `sitemap-images.xml`; inline pre-build `image:image` removed (RFC-0165 amend) (evidence: implemented historically)
- [x] Both reference apps build green; the nicaragua hero `leadImage` appears in `sitemap-images.xml` with the real `/_astro/hero-1.<hash>.webp` URL and no `output.image` authored (evidence: original apps retired by RFC-0381, implemented historically)
- [x] `AGENTS.md` (ui) documents the lead-image → image-sitemap contract (evidence: AGENTS.md:1, agent guide updated)
- [x] `rfc.validate` passes on this file before merging (evidence: implemented historically)
- [x] `x-content-image` head signal unifies authored `output.image` into the same harvester (single owner) (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement only when this RFC is `accepted`.
- The build is the only authority on final image URLs — NEVER reconstruct `/_astro` or `/cdn-cgi/image` URLs; harvest them from rendered HTML.
- Exactly one `data-content-image` element per page; adding a lead image to a new archetype means setting the same attribute, never a parallel mechanism.
- The image sitemap is a `dist/` artifact — never write it into `public/` or any tracked path (RFC-0154).
- Screenshots (RFC-0150 `/preview/*.png`) and decorative hero backgrounds MUST NOT be marked `data-content-image`.
- Agents MUST NOT weaken `dist.sitemap.images.validate` rules without a superseding RFC.
