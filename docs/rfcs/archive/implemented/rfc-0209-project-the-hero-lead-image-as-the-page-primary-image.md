---
id: RFC-0209
title: "Project the hero lead image as the page primaryImage / og:image"
status: implemented
kind: contract
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-06-19
updatedAt: 2026-06-19
implementedAt: 2026-06-19
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0167
  - RFC-0207
amendedBy: []
related:
  - RFC-0150
  - RFC-0162
  - RFC-0163
  - RFC-0165
  - RFC-0166
  - RFC-0172
  - RFC-0152
  - RFC-0204
  - RFC-0193
successSignals:
  - "A page that declares a hero `leadImage` and no explicit `output.image` emits that image as og:image / twitter:image and as JSON-LD primaryImageOfPage — the real content photo, not the RFC-0150 preview screenshot."
  - "A Programmatic Surface industry×city page's og:image is the resolved city/industry photo (e.g. /_astro/elektriker.<hash>.webp or its provider URL), absolute, with the leadImage alt as og:image:alt."
  - "Pages with neither a leadImage nor an output.image still fall back to the preview screenshot, so og:image always has a value (no regression)."
  - "The image emitted in <head> matches the lead image harvested into sitemap-images.xml (RFC-0172) for the same page — head and image-sitemap agree."
nonGoals:
  - "Do not introduce a runtime image transform — the URL is the already-resolved build asset (astro:assets hash or the active Image Provider URL)."
  - "Do not change the RFC-0150 preview-screenshot fallback — it remains the last-resort og:image when no content image exists."
  - "Do not change RFC-0165 contentImage sitemap rules or RFC-0172 harvesting — this RFC only fixes the <head> primaryImage source."
  - "Do not require every page to carry a lead image — absence stays a warning (surface) / silent (authored), never a build failure."
---

# RFC-0209: Project the hero lead image as the page primaryImage / og:image

## Context

- RFC-0167 introduced the hero `leadImage` (`{src, alt}`) and stated it is "the default contributor to `SemanticPageModel.primaryImage` (og:image / JSON-LD primaryImageOfPage) unless the page overrides it via `output.image`."
- In practice that projection never happens. `resolvePageRoute` builds the semantic model in a **pre-render data pipeline** that cannot resolve a content-asset token to a URL (Astro content-hashing / the Image Provider Port run in the render layer). The handler says so directly and falls back: `semanticPage.primaryImage = semanticPage.output.image ?? <preview screenshot>` ([`page-handler.ts:698-710`](../../packages/share/src/astro/page-handler.ts)). So a page's og:image is the RFC-0150 preview screenshot unless an author hand-writes `output.image`.
- RFC-0207 gave Programmatic Surface pages a real hero `leadImage` (city/industry photo) that renders visually and is harvested into the image sitemap (RFC-0172), but its og:image / JSON-LD `primaryImage` is still the preview screenshot. RFC-0207 recorded this as a deferred as-built item (note 4).

## Problem

The hero `leadImage` — the page's genuine content image — never becomes the page's social/structured-data primary image, contradicting the RFC-0167 contract. The gap is architectural: the only place that currently knows the resolved asset URL is the **render layer** (where `resolveImage(contentAssetImages, …)` / the Image Provider Port run), but `primaryImage` is fixed earlier, in the framework-free pre-render handler. There is no seam that carries the resolved hero image into `SemanticPageModel.primaryImage`, so every page without a hand-authored `output.image` advertises a synthetic screenshot instead of its real photo — weaker social previews and a less accurate `primaryImageOfPage` for search/LLMs.

## Decision

`primaryImage` precedence gains the resolved hero `leadImage` between the explicit `output.image` and the preview-screenshot fallback:

```
output.image  →  resolved hero leadImage (RFC-0167)  →  RFC-0150 preview screenshot
```

The resolution happens where content assets resolve. A single shared seam resolves the page's hero `leadImage` token to its deployed URL via the same resolver the hero section uses (`resolveImage` over `contentAssetImages`, honoring the active Image Provider Port), prefixes the site origin to make it absolute, and assigns it to `semanticPage.primaryImage` (with `leadImage.alt` as the alt) when the page declares no explicit `output.image`. This works identically for authored pages and Programmatic Surface pages (whose baked hero already carries `leadImage`), so it closes RFC-0207's deferred item and finally honors RFC-0167.

## Architectural fit

- **RFC-0167 (leadImage):** fulfills the originally-stated, never-implemented contract; this RFC amends it from intent to enforcement.
- **RFC-0207 (surface images):** closes deferred as-built note 4 — surface pages get their real photo as og:image with no per-page authoring.
- **Image Provider Port (RFC-0152) / build-portable variants (RFC-0204):** the URL is whatever the active provider resolves for the token (no new transform path); absolute via origin prefix.
- **RFC-0162 (OG/social meta) / RFC-0163 (per-page canonical URL):** `<SocialMeta>` and the JSON-LD builder already consume `semanticPage.primaryImage`; only its source changes.
- **RFC-0165 (image sitemap eligibility) / RFC-0172 (post-build harvest):** unchanged — but head and image-sitemap now agree because both point at the same resolved lead image.
- **RFC-0150 (preview screenshots):** unchanged as the final fallback; og:image still always has a value.

## Design

### primaryImage resolution seam

A shared helper (in `@gogol/ui` or the app render entry, where `contentAssetImages` is in scope) resolves the hero block's `leadImage` for the rendered page:

```ts
// pseudo-contract — runs in the render layer, where the content-asset glob is available
function resolveLeadImagePrimary(
  page: ResolvedPage,
  origin: string,
  lang: string,
): SemanticImage | undefined {
  const hero = page.blocks.find((b) => b.planetName === "Europa" /* hero */);
  const lead = hero?.props?.leadImage as { src: string; alt: string } | undefined;
  if (!lead) return undefined;
  const meta = resolveImage(contentAssetImages, lead.src, { lang }); // Image Provider Port
  if (!meta) return undefined;
  return { url: new URL(meta.src, origin).toString(), alt: lead.alt, width: meta.width, height: meta.height };
}
```

The route applies it after `resolvePageRoute`, only when `semanticPage.output?.image` is absent:

```ts
if (semanticPage && !semanticPage.output?.image) {
  const leadPrimary = resolveLeadImagePrimary(page, origin, lang);
  if (leadPrimary) semanticPage.primaryImage = leadPrimary;
}
```

This keeps `page-handler.ts` framework-free (it still sets the screenshot fallback); the render-layer override runs where assets resolve. Equivalent placement options (a render-time `buildSemanticModel` step, or a small `@gogol/ui` layout hook) are acceptable as long as the resolution stays in the asset-aware layer and the precedence is exactly `output.image → leadImage → screenshot`.

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/share/src/astro/page-handler.ts` | Precedence comment updated; still sets the screenshot fallback; **as-built:** also ships the unresolved `leadImageToken` (see as-built note 1) |
| `packages/ui/src/components/layout/layout-component.astro` | **as-built:** the asset-aware seam — resolves `leadImageToken` and overrides `primaryImage` (chosen over the route entry to avoid per-app duplication; see as-built note 2) |
| `packages/share/src/semantic/models.ts` | `SemanticImage` reused; **as-built:** new `SemanticPageModel.leadImageToken` carrier field; the resolved lead image is **NOT** flagged `contentImage` (see as-built note 3) |

### As-built deltas (the implementation diverged from the design pseudocode above — read before changing)

1. **Token carrier, not a `ResolvedPage` lookup in the render layer.** `page-handler.ts` (which has the resolved blocks) finds the hero by **`leadImage` prop presence**, not by `planetName === "Europa"` — so authored heroes and baked Programmatic Surface heroes are matched identically, and no cosmic-name coupling leaks into the handler. It stashes the raw `{src, alt}` on `semanticPage.leadImageToken` (only when there is no `output.image`). The render layer never re-walks `page.blocks`.
2. **Seam lives in `layout-component.astro`, not the route entry.** The layout is the single asset-aware place every app's route already funnels through (it owns `<SocialMeta>` / `buildJsonLd`), so the override runs there before `<head>` renders — one implementation, no per-app `[...slug].astro` duplication. This is one of the "equivalent placement options" the Design section explicitly allows.
3. **The resolved lead image MUST NOT carry `contentImage: true`.** This corrects the File-system table row above. The hero already renders the lead image as `<img data-content-image>` in the body, which is the RFC-0172 image-sitemap harvest source. Flagging the `primaryImage` `contentImage` too makes `<SocialMeta>` emit a second `x-content-image` head signal for the same photo → the page now advertises two distinct content-image URLs → `dist.sitemap.images.generate` fails `IMGSITEMAP-01` ("expected exactly one"). og:image emits unconditionally regardless of the flag, so omitting it loses nothing.

### Output / validation

Optional `surface.validate` (or `dist.sitemap.images.validate`) tightening: for an indexable page whose hero declares a `leadImage`, assert the rendered `og:image` is the resolved lead image (not a `/preview/` URL). Advisory at first.

## Rollout

- Pure improvement, no flag day: pages with an explicit `output.image` are unchanged; pages with a `leadImage` upgrade from screenshot to real photo; pages with neither keep the screenshot.
- Land behind the existing render path so every app benefits at once; verify on `apps/webgogol-com` surface pages + an authored hero page, then confirm `pnpm build:check` stays green.
- No content migration required.

## Alternatives considered

- **Build-time token→URL manifest in the pre-render handler.** Resolve tokens in `page-handler.ts` from a generated content-asset URL map (like the RFC-0204 variants manifest). Rejected as heavier and provider-coupled — the render layer already resolves tokens; duplicating that map invites drift.
- **Post-build `<head>` rewrite.** Harvest the rendered lead image (as RFC-0172 does for the sitemap) and rewrite og:image in the built HTML. Rejected: fragile head-string rewriting, and it cannot feed JSON-LD `primaryImageOfPage` cleanly.
- **Require authors/baker to always set `output.image`.** Rejected: redundant with `leadImage`, easy to forget, and impossible to keep in sync for generated surface pages.

## Risks

- **Wrong-image precedence.** A page with both `output.image` and a `leadImage` must keep `output.image` — covered by the explicit precedence + a test.
- **Unresolvable token.** A missing asset must fall back to the screenshot (never emit a broken og:image) — `resolveImage` returns null ⇒ keep fallback.
- **Absolute-URL correctness.** og:image must be absolute (origin + hashed path); reuse the RFC-0163 page-origin so it is correct across languages.
- **Render-timing.** The override must run before `<head>`/`<SocialMeta>` renders; placing it in the route entry (before layout) guarantees ordering.

## Acceptance criteria

- [x] `primaryImage` precedence is `output.image → resolved hero leadImage → preview screenshot`, implemented in the asset-aware render layer (`layout-component.astro`; the framework-free `page-handler.ts` ships the raw `leadImageToken`) (evidence: implemented historically)
- [x] An authored page with a `leadImage` and no `output.image` emits that image as og:image / twitter:image / JSON-LD `primaryImageOfPage`, absolute, with the leadImage alt (verified: webgogol-com home → `/_astro/home-illustration.<hash>.webp`; nicaragua home → `/_astro/hero-1.<hash>.webp`) (evidence: original apps retired by RFC-0381, implemented historically)
- [x] A `website-local` surface industry×city page emits its resolved city/industry photo as og:image (not a `/preview/` URL) — verified `/website/elektriker` → og:image, og:image:alt, and JSON-LD `primaryImageOfPage` all = `/_astro/elektriker.<hash>.webp` (evidence: implemented historically)
- [x] Pages with neither a leadImage nor `output.image` still emit the preview screenshot (verified: `/impressum`, `/datenschutz` → `/preview/de/<slug>.png`) (evidence: implemented historically)
- [x] The `<head>` image agrees with the page's `sitemap-images.xml` entry (RFC-0172) — verified for `/website/elektriker` (both `/_astro/elektriker.<hash>.webp`); no second `x-content-image` signal, so the IMGSITEMAP-01 one-per-page contract holds (evidence: implemented historically)
- [x] `pnpm build:check` stays green (31/31); `rfc.validate` passes (195 RFCs, 0 errors) (evidence: implemented historically)
- [x] RFC-0167 as-built + RFC-0207 as-built note 4 reconciled (deferred item closed) (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted.
- Agents MUST NOT change status fields in any RFC.
- Agents MUST resolve the lead image through the existing `resolveImage` / Image Provider Port seam (RFC-0152/0204) — never `<img>`, `astro:assets`, or a new transform path.
- Agents MUST preserve the precedence `output.image → leadImage → screenshot` and keep the screenshot as the always-present fallback (og:image must never be empty).
- Agents MUST keep `page-handler.ts` framework-free; the token→URL resolution lives in the asset-aware render layer (`layout-component.astro`).
- Agents MUST NOT set `contentImage: true` on the resolved lead-image `primaryImage` — it double-marks the page and fails `IMGSITEMAP-01` (see as-built note 3). The hero's body `<img data-content-image>` is the sole image-sitemap source for the lead image.
- The hero block is identified by its `leadImage` prop, NOT by a block-type / cosmic name — keep it so when extending to other lead-image-bearing blocks.
- When implementing, agents MUST reference RFC-0209 and keep the affected `docs/*.xml` GRACE files synchronized.
