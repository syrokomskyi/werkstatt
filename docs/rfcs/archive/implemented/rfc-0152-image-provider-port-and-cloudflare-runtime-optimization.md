---
id: RFC-0152
title: "Image Provider Port and Cloudflare runtime optimization"
status: implemented
# kind options: architecture | contract | command | policy | deprecation
kind: architecture
# scope options: app | workspace
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-06-04
updatedAt: 2026-06-04
implementedAt: 2026-06-04
closedAt:
supersedes: []
supersededBy:
related:
  - DNA-01
  - DNA-08
  - RFC-0104
  - RFC-0106
  - RFC-0141
  - RFC-0149
amends:
  - RFC-0149
amendedBy:
  - RFC-0204
commands:
  proposed:
    - cloudflare.assets.validate
  added:
    - cloudflare.assets.validate
  changed: []
  removed: []
appsImpacted:
  - nicaragua-projekt
  - warpgogol-com
packagesImpacted:
  - "@gogol/ui"
  - "@gogol/share"
  - "@gogol/site-kernel-astro"
  - "@gogol/site-kernel-checks"
successSignals:
  - "apps/nicaragua-projekt and apps/warpgogol-com build green with <Image>/responsive markup restored — no `generating optimized images` ENOENT, no <img> downgrade lingering as the final contract."
  - "Every authored image renders with a real responsive srcset; originals stay in-repo at maximum quality and are downscaled per-variant by the active provider, not shipped full-size."
  - "Image rendering goes through a single provider-agnostic <ResponsiveImage> primitive; switching optimization backend (Cloudflare runtime → CMS/DAM) is a provider/config change, not a component rewrite."
  - "A headless-CMS image (remote URL) flows through the same <ResponsiveImage> with a cms-native provider that builds srcset from the CMS/DAM URL params — no bespoke per-CMS image code in sections."
nonGoals:
  - "Do not build a custom runtime image resizer — sharp cannot run in workerd at request time (RFC-0149); any runtime resize MUST delegate to Cloudflare Image Resizing or a DAM."
  - "Do not introduce a concrete CMS content adapter — RFC-0141 owns the content-source port; this RFC only adds the image *rendering/optimization* port and its providers."
  - "Do not keep the post-build dist sync compatibility-layer idea (proven non-viable below); do not keep <img> as the final contract."
  - "Do not change where content assets live or the webp-only source policy (image.format.validate) — sources remain in-repo, webp, at max quality."
---

# RFC-0152: Image Provider Port and Cloudflare runtime optimization

## Context

- RFC-0149 unified deployment on Cloudflare Workers via `@astrojs/cloudflare`. Its stated decision preserves build-time `sharp` through the adapter's `imageService: compile`. The shipped `apps/*/astro.config.mjs` instead sets `imageService: "custom"` + `image.service = sharpImageService()` — a drift from RFC-0149's own success signal.
- RFC-0141 established the content-source port and decoupled asset _references_ (`resolveImage` resolves bare filenames to descriptors). It deliberately did **not** own image _rendering/optimization_.
- RFC-0104 / RFC-0106 made `section-image` the canonical image primitive (fades, parallax) wrapping Astro `<Image>`.
- The headless-CMS migration initiative requires images to come from remote sources (CMS/DAM URLs), not only in-repo assets.
- Source images are stored in-repo at maximum (unoptimized) quality on purpose, so per-variant downscaling and responsive `srcset` are load-bearing, not cosmetic.

## Problem

With `imageService: "custom"`, the adapter does not intervene (`@astrojs/cloudflare/dist/utils/image-config.js` → `case "custom": return {...config}`). Astro core then runs its build-time image generation and reads originals from `dist/_astro/<hash>.webp`. Under the Cloudflare adapter, Vite emits client assets to `dist/client/_astro/` instead. Result, reproduced on `apps/nicaragua-projekt` (Astro 6.4.3 + adapter 13.6.1):

```
[build] Unable to generate optimized image for /_astro/hero-bg.<hash>.webp:
  ENOENT: open '...\dist\_astro\hero-bg.<hash>.webp'
  at loadImage (astro/dist/assets/build/generate.js)
  → generatePages → build throws (exit 1)
```

The build fails during the `generating optimized images` phase; an empty `dist/_astro/` is created while the 1195 real assets sit in `dist/client/_astro/`. Consequences:

1. **Build is red** with `<Image>`. Bumping Astro/adapter to latest did not fix it (verified).
2. The interim mitigation replaced `<Image>` with raw `<img src={meta.src}>`, which **loses `srcset`/responsive downscaling** — unacceptable as the final contract given max-quality in-repo sources.
3. There is **no abstraction** for optimizing remote/CMS images, which the CMS initiative needs.

## Decision

Introduce an **Image Provider Port** — the rendering/optimization analogue of RFC-0141's content-source port — and route all authored images through a single provider-agnostic primitive.

1. **`<ResponsiveImage>` primitive** in `@gogol/ui`: takes a resolved image _descriptor_ (`{ src, width, height, kind: "local-asset" | "remote-url" }` from `resolveImage`) plus presentation props (alt, loading, sizes, fade, parallax). It owns no optimization logic; it asks the active **image provider** for `src` + `srcset`. `section-image`, `hero`, footer, cards, etc. compose it instead of touching `<Image>`/`<img>` directly.

2. **`ImageProvider` port** (`@gogol/share`): `buildSources(descriptor, { widths, sizes, quality, format }) → { src, srcset, sizes }`. Providers:
   - **`cloudflare-runtime`** (default): emits `/cdn-cgi/image/<opts>/<origin-path>` URLs; Cloudflare Image Resizing transforms at request time. Works for in-repo hashed assets **and** remote CMS URLs.
   - **`cms-native`** (CMS phase): builds `srcset` from the CMS/DAM image API URL params (Cloudinary/imgix/Sanity/Contentful) — no self-hosted resize.
   - **`build-portable`** (deferred, optional): Astro build-time `sharp`, gated behind the `dist/_astro`→`dist/client/_astro` workaround; only if/when host-portability is reprioritized.

3. **Adapter mode**: set `imageService: "cloudflare"` in the app `astro.config.mjs` (generated). This removes Astro core's build-time generation phase entirely (no `dist/_astro` read) and makes `<Image>`/`getImage` emit `/cdn-cgi/image/...` markup. **This amends RFC-0149's image sub-decision** (build-time `compile`/`custom` → runtime `cloudflare`). Verified: with this single change and the hero still on `<Image>`, `nicaragua-projekt` builds green and emits `…/cdn-cgi/image/…,width=…,format=webp/_astro/hero-bg.<hash>.webp`.

4. **`cloudflare.assets.validate`** (`@gogol/site-kernel-checks`): a post-build check that fails if rendered HTML references an `/_astro/*` origin asset that is absent from the deployable directory (`dist/client`). Guards against silent 404s regardless of provider.

## Architectural fit

- Mirrors RFC-0141: a thin port + swappable providers; apps stay composition-only (DNA thin-app).
- Keeps the webp-only, max-quality, in-repo source policy (`image.format.validate`) untouched.
- Optimization concern lives in `@gogol/ui` + `@gogol/share` (port) and the OS/deploy layer (validate), not in app scripts.
- The same primitive serves static assets today and CMS/DAM images later — the CMS initiative changes the _provider_, not the sections.

## Design

### Provider port (sketch)

```ts
// @gogol/share
export interface ImageRequest {
  widths?: number[];          // responsive variants; default from a preset ladder
  sizes?: string;             // <img sizes>
  quality?: number | "auto";  // NUMERIC for Cloudflare; see Risks (no "max")
  format?: "webp" | "avif" | "auto";
}
export interface ImageSources { src: string; srcset: string; sizes?: string; }
export interface ImageProvider {
  readonly id: "cloudflare-runtime" | "cms-native" | "build-portable";
  buildSources(d: ImageDescriptor, req: ImageRequest): ImageSources;
}
```

`cloudflare-runtime.buildSources` maps each width to `/cdn-cgi/image/onerror=redirect,width=<w>,quality=<q>,format=<f>/<descriptor.src>` and joins them into `srcset`. Remote descriptors pass their absolute URL as the origin path (Cloudflare resizes remote URLs).

### Provider selection

App-level config (or deploy-target) selects the default provider; `<ResponsiveImage>` may also pick `cms-native` automatically when `descriptor.kind === "remote-url"` and a CMS provider is configured. No hardcoding in sections.

### Migration of components

Revert the interim `<img>` edits in `@gogol/ui` (hero, section-image, footer/-promo, cards, site-background, founder/decision/women sections) to compose `<ResponsiveImage>`, regaining `srcset`.

## Rollout

1. Land the unblock: flip `imageService: "custom" → "cloudflare"` in both apps' generated configs; update the RFC-0149 image comment; confirm green builds. Ship `<ResponsiveImage>` wrapping the current behavior.
2. Add `ImageProvider` port + `cloudflare-runtime` provider; migrate `@gogol/ui` components off raw `<img>`/`<Image>`.
3. Add `cloudflare.assets.validate` to the check pipeline.
4. Ship safe-by-default: the `cloudflare-runtime` provider serves the **raw origin asset** (no `/cdn-cgi/image`, no srcset) unless `PUBLIC_CF_IMAGE_TRANSFORM=on`. This keeps images working on a zone that has not enabled Transformations.
5. Enable Cloudflare Image Transformations on each zone, then set `PUBLIC_CF_IMAGE_TRANSFORM=on` for that app's build; verify real `/cdn-cgi/image` variants are served (HTTP 200, `content-type: image/*`).
6. Repeat for `warpgogol-com`.

## Future phases (informative, non-binding)

- `cms-native` provider + descriptor `kind: "remote-url"` wiring, alongside the RFC-0141 CMS content adapter.
- Optional `build-portable` provider (sharp + `dist/_astro` symlink hook) if host-portability is reprioritized — would resurrect a corrected version of the build-time path.

## Alternatives considered

- **Post-build `dist/client/_astro → dist/_astro` sync (expert proposal).** Rejected, proven non-viable: the failure occurs _during_ `astro build`'s image-generation phase, so a post-build copy runs too late (the derivatives are never produced and the build already exited 1); and deploy serves from `dist/client`, so syncing _into_ `dist/_astro` targets a directory that is never deployed. Right altitude, wrong mechanism (timing + direction).
- **Custom runtime resize API / "own Image" that resizes.** Rejected: sharp cannot run in workerd at request time (RFC-0149); any runtime resizer must call `/cdn-cgi/image/` or a DAM anyway — i.e. it re-implements the `cloudflare` mode. A thin provider-aware _component_ is kept; a self-hosted _resizer_ is not.
- **Keep `<img>` (current hotfix) as final.** Rejected: loses `srcset`; with max-quality in-repo originals this ships oversized images.
- **`build-portable` (sharp) with a symlink workaround now.** Deferred: preserves host-portability but adds workaround code over an adapter bug and does not resize remote CMS images; not aligned with the chosen Cloudflare-native direction.

## Risks

- **Cloudflare Image Transformations are a per-zone toggle and `/cdn-cgi/image` does NOT gracefully degrade when off.** Correction to an earlier draft assumption: when the feature is disabled, `/cdn-cgi/image/...` URLs return **404** — `onerror=redirect` only applies when the feature is enabled but a specific transform errors. Verified live: a new-build deploy showed 404s on every `/cdn-cgi/image/.../_astro/*` request. Mitigation (shipped): the provider is **safe-by-default** — it emits the raw origin asset (always 200) unless `PUBLIC_CF_IMAGE_TRANSFORM=on`. Responsive `srcset` is therefore opt-in and only enabled after Transformations are confirmed on the zone.
- **`quality="max"` is not a valid Cloudflare param.** Current components pass `quality="max"`; the `cloudflare-runtime` provider must map to a numeric quality (e.g. 90–100) or omit it, else the transform errors and falls back to the original. Audit `quality` call sites.
- **Local `wrangler dev` / preview** does not run the production `/cdn-cgi/image` transform identically; verify on a deployed preview, not only locally.
- **Vendor coupling**: URLs are Cloudflare-specific (accepted trade-off per the chosen direction; the port keeps escape hatch to `build-portable`/`cms-native`).

## Acceptance criteria

- [x] Both apps build green with responsive `<Image>`/`<ResponsiveImage>` markup; no `generating optimized images` ENOENT; no empty `dist/_astro` (verified 2026-06-04, astro check 0/0/0). (evidence: implemented historically)
- [x] Rendered HTML for authored images contains a multi-width `srcset` produced by the active provider (verified with `PUBLIC_CF_IMAGE_TRANSFORM=on` → `/cdn-cgi/image/...` srcset; safe-by-default serves raw origin until Cloudflare Transformations are enabled per zone — see commit `80ff1c46`). (evidence: implemented historically)
- [x] Removing/disabling the provider config switches optimization backend with no section-level code change (provider port in `@gogol/share`; `<ResponsiveImage>` is provider-agnostic). (evidence: packages/ directory, package exists)
- [x] `cloudflare.assets.validate` fails a build whose HTML references a missing `/_astro/*` origin asset (registered in `site-kernel-checks` APPS_CHECK_POSTBUILD; validated 72/58 refs). (evidence: implemented historically)
- [x] No raw `<img>` for authored images remains in `@gogol/ui` (11 components migrated; donation-card QR `data:` URL intentionally left raw). (evidence: packages/ directory, package exists)

## Implementation notes for agents

- `astro.config.mjs` is GENERATED — change the image-service value via the onboarding/codegen template, not by hand-editing per app.
- Reproduction harness: `imageService: "custom"` + `<Image>` → ENOENT (red); `imageService: "cloudflare"` + `<Image>` → green, `/cdn-cgi/image/...` srcset (both verified 2026-06-04 on nicaragua-projekt).
- Deploy serves from `dist/client` (adapter-generated `dist/client/wrangler.json` → `assets.directory: "."`); validate against that directory.
- Operator + agent runbook (enable Transformations, the `PUBLIC_CF_IMAGE_TRANSFORM` flag, live `curl` diagnostics, troubleshooting): `docs/engineering/image-optimization-and-cloudflare-transformations.md`.
