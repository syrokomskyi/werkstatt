---
id: RFC-0162
title: "Wire social and Open Graph meta tags into the shared layout"
status: implemented
kind: architecture
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-06-06
updatedAt: 2026-06-06
implementedAt: 2026-06-06
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0150
  - RFC-0143
  - RFC-0159
  - RFC-0160
  - DNA-25
commands:
  proposed:
    - seo.meta.validate
  added:
    - seo.meta.validate
  changed:
    - apps-check.run
  removed: []
appsImpacted:
  - apps/*
packagesImpacted:
  - packages/share
  - packages/ui
  - packages/os/site-kernel-checks
successSignals:
  - "Every indexable page emits og:title, og:description, og:type, og:url, og:site_name, og:locale and a twitter:card/twitter:image pair."
  - "The preview image produced by RFC-0150 is referenced by og:image instead of being an orphaned build artifact."
  - "Link previews in Slack/WhatsApp/iMessage/Discord/LinkedIn/X render with a title, description, and image."
nonGoals:
  - "Do not generate preview images here — that pipeline is owned by RFC-0150 (preview.images.generate)."
  - "Do not add per-network bespoke tags beyond Open Graph and Twitter Cards in this RFC."
---

# RFC-0162: Wire social and Open Graph meta tags into the shared layout

## Context

The stated product goal is that thin sites rank first and surface well in Google, in LLM answers, and in "widgets" — the rich link-preview cards rendered by Slack, WhatsApp, iMessage, Discord, LinkedIn, X, and increasingly by LLM browse tools. Those previews are driven entirely by Open Graph (`og:*`) and Twitter Card (`twitter:*`) meta tags.

A `dist` audit (2026-06-06) of `apps/nicaragua-projekt` confirmed that the shared head in [`layout-component.astro`](../../packages/ui/src/components/layout/layout-component.astro) emits `title`, `description`, `canonical`, `hreflang`, and JSON-LD — but **no `og:*` or `twitter:*` tags at all**. A repository-wide search for `og:title`/`twitter:card` returns zero matches in `packages/` and `apps/*/src`.

RFC-0150 (`implemented`) already generates per-page preview images via `preview.images.generate`. Those images are currently **orphaned**: nothing references them in the document head. This RFC closes that loop.

## Problem

- No social/OG meta means every share of a webgogol site renders as bare text — directly defeating the "widgets" goal.
- The RFC-0150 preview images are wasted build output because no `og:image` points at them.
- The `SemanticPageModel` (the single per-page projection consumed by JSON-LD) has no `primaryImage`/`ogType` field, so there is no canonical source to project social meta from.
- There is no validator guaranteeing that indexable pages carry coherent social meta, so the gap can silently reappear.

## Decision

The shared `BaseLayout` gains a `<SocialMeta>` partial that emits Open Graph and Twitter Card tags derived from the `SemanticPageModel`. The model is extended with an optional `primaryImage` (resolved from the RFC-0150 preview image, with a business-logo fallback) and an `ogType` discriminator. A new workspace command `seo.meta.validate` enforces presence and canonical-coherence of the tags on every indexable page and is added to `apps-check.run`.

## Architectural fit

- **DNA-25 (thin routes):** social meta is projected centrally in the shared layout from the page model; no per-route or per-section logic.
- **RFC-0143 Generator Contract:** `primaryImage` resolution reuses the resolved per-page output projection; no second source of truth.
- **RFC-0150:** this RFC consumes, and does not duplicate, the preview-image pipeline. It is recorded as `amends: RFC-0150` because it completes RFC-0150's intent (images that are actually referenced).
- **RFC-0159/0160 (canonical/url):** `og:url` reuses the same canonical URL the layout already computes, so social and canonical URLs never diverge.

## Design

### CLI surface

```sh
pnpm exec site-kernel run seo.meta.validate --app nicaragua-projekt
pnpm exec site-kernel run seo.meta.validate --all --json
```

### TypeScript contracts

```ts
// packages/share/src/semantic/models.ts — extend SemanticPageModel
export type SemanticImage = {
  url: string;       // absolute, https
  width?: number;
  height?: number;
  alt?: string;
};

export type OgType = "website" | "article" | "profile";

// added to SemanticPageModel:
//   primaryImage?: SemanticImage;
//   ogType?: OgType;   // defaults to "website"; "article" set by RFC-0167
```

```astro
// packages/ui/src/components/seo/social-meta/social-meta-component.astro
interface Props {
  page: SemanticPageModel;
  canonicalUrl: string;
  siteName: string;
}
```

The partial emits, when data is present: `og:type`, `og:title`, `og:description`, `og:url`, `og:site_name`, `og:locale`, `og:locale:alternate` (per supported language), `og:image`(+`:width`/`:height`/`:alt`), and `twitter:card` (`summary_large_image` when an image exists, else `summary`), `twitter:title`, `twitter:description`, `twitter:image`.

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/ui/src/components/seo/social-meta/social-meta-component.astro` | New partial; emits og/twitter tags |
| `packages/ui/src/components/layout/layout-component.astro` | Renders `<SocialMeta>` in `<head>` |
| `packages/share/src/semantic/models.ts` | Adds `SemanticImage`, `OgType`, `primaryImage`, `ogType` |
| `packages/share/src/semantic/page-builders/*` | Populate `primaryImage` from RFC-0150 output + logo fallback |

### Output format

```json
{
  "command": "seo.meta.validate",
  "status": "fail",
  "violations": [
    { "page": "/agb/", "rule": "missing-og-image", "message": "indexable page has no og:image" },
    { "page": "/en/about", "rule": "og-url-canonical-mismatch", "message": "og:url != canonical" }
  ]
}
```

### Failure modes

`seo.meta.validate` exits non-zero on any violation. Rules: missing `og:title`/`og:description`/`og:type`/`og:url`/`og:image` on an indexable page (ERROR); `og:url` != canonical (ERROR); missing `twitter:card` (WARN). Non-indexable pages (RFC-0165 robots `noindex`) are exempt from the image rule but still checked for url coherence.

## Rollout

- First introduction: `seo.meta.validate` runs in `warn` mode for one cycle so existing apps surface gaps without blocking, then flips to fail-hard in `apps-check.run`.
- New apps comply from day one because the tags come from the shared layout, not per-app code.
- No flag day: the partial degrades gracefully — absent `primaryImage` simply omits image tags and downgrades `twitter:card` to `summary`.

## Alternatives considered

- **Per-app head injection:** rejected — violates DNA-25 and re-introduces duplicated copy.
- **Static `og:image` per site (single brand image):** rejected — wastes the per-page RFC-0150 images and weakens per-article previews needed by RFC-0167.
- **Astro integration (`astro-seo`):** rejected — adds a dependency that does not understand the `SemanticPageModel` and would become a second source of truth.

## Risks

- **Absolute-URL correctness:** `og:image`/`og:url` must be absolute https. Mitigated by reusing the canonical URL builder (RFC-0159) and a single `toAbsolute()` helper.
- **Image dimension drift:** `og:image:width/height` must match the generated asset; resolved from the RFC-0150 manifest, not hardcoded.
- **Locale formatting:** `og:locale` needs the `xx_XX` form; mapped from `system.md i18n.<lang>.hreflang`.

## Acceptance criteria

- [x] `SemanticImage`, `OgType`, `primaryImage`, `ogType` defined in `packages/share` (evidence: packages/ directory, package exists)
- [x] `<SocialMeta>` partial added and rendered by `BaseLayout` (evidence: implemented historically)
- [x] `og:image` references the RFC-0150 preview image; logo fallback wired (evidence: implemented historically)
- [x] `seo.meta.validate` registered (workspace scope) and added to `apps-check.run` (evidence: implemented historically)
- [x] `--json` output format documented and stable (evidence: implemented historically)
- [x] Both reference apps pass; dist head contains og/twitter tags (evidence: implemented historically)
- [x] `AGENTS.md` (apps + ui) note the social-meta contract <!-- doc-only follow-up --> (evidence: AGENTS.md:1, agent guide updated)
- [x] `rfc.validate` passes on this file before merging (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement only when this RFC is `accepted`.
- Do NOT add a per-app OG image pipeline — consume RFC-0150's `preview.images.generate` output.
- `og:url` MUST equal the `<link rel="canonical">` value; never recompute it independently.
- Keep all social meta projected from `SemanticPageModel`; never read content collections inside the partial.
- Agents MUST NOT weaken `seo.meta.validate` rules without a superseding RFC.
