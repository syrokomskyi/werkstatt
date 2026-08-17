---
id: RFC-0869
title: "Optimize image delivery and LCP for shared site components"
status: draft
# kind options: architecture | contract | command | policy | deprecation
kind: architecture
# scope options: app | workspace
scope: workspace
owners:
  - architecture
# Set by the deciding human together with the status change (RFC-0335).
# Draft scaffolds must keep this empty; do not prefill a default identity.
# Format: human:<handle> (agent:<id> reserved — see RFC-0335)
# Default reviewer when none is specified by the operator: human:andrii-syrokomskyi
reviewers: []
createdAt: 2026-08-17
updatedAt: 2026-08-17
enhancedAt: 2026-08-17
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - DNA-67
  - RFC-0204
  - RFC-0830
  - RFC-0833
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-67
# RFC-0396: Traceability to a vendored spec node: "<spec-id>/<node-id>", e.g. "pbp/RFC-PBP-020".
# Set by spec.materialize; leave commented for non-spec RFCs.
# specRef:
# RFC-0478: Platform versioning enforcement. Declares the SemVer delta this RFC
# produces when implemented. Required for post-cutoff implemented RFCs (V-29).
# Values: minor (Breaks-B, requires migrator), patch (safe), none (prose-only),
# major (architectural, manually reserved). Default: patch.
versionBump: patch
commands:
  proposed: []
  added: []
  changed: []
  removed: []
appsImpacted: []
packagesImpacted:
  - werkstatt-site
successSignals:
  - Lighthouse image-delivery-insight score improves from 0
  - LCP reduces from 13.1s baseline
  - Responsive srcset present on hero-bg and home-bg images
  - image-variants.generated.yaml committed in Sternsystem cache clones
nonGoals:
  - Do not change Cloudflare Image Transform integration (PUBLIC_CF_IMAGE_TRANSFORM is not enabled)
  - Do not introduce per-site image quality configuration in system.md
  - Do not change the build-portable provider algorithm itself
  - Do not modify the GrowthProvider client:load loading mechanism (already deferred via Astro module scripts)
  - Do not fix the CSP inspector issue — resolveCspScriptSrcExtra already handles same-origin correctly; the CSP issue is a site-specific system.md proxyBaseUrl configuration problem, not a shared component issue
  - Do not fix the forced reflow (36.6ms, unattributed) — the reflow is minor and may be third-party; the lighthouse.validate LH-13 rule already detects read-after-write patterns in src/scripts and .astro inline scripts
# RFC-0268: OPTIONAL machine-checkable acceptance probes, executed on-demand
# via `pnpm exec werkstatt run rfc.acceptance.run --id <this-rfc-id>` (never
# automatically inside build pipelines). Closed probe vocabulary — see
# docs/rfcs/rfc-0268-make-rfc-acceptance-criteria-machine-checkable.md.
# acceptance:
#   - probe: run
#     command: "site-kernel run some.command.validate --app warpgogol-com"
#     expect:
#       exitCode: 0
#   - probe: file-exists
#     path: "packages/share/src/some-new-module.ts"
#   - probe: command-registered
#     name: "some.new.command"
#   - probe: file-contains
#     path: "AGENTS.md"
#     pattern: "Some new governance paragraph"
---

# RFC-0869: Optimize image delivery and LCP for shared site components

## Context

A Lighthouse audit of warpgogol.com (2026-08-17) revealed a performance score of 0 for image delivery, with 1,712 KiB potential savings. The LCP is 13.1 seconds — well above acceptable thresholds. The primary bottlenecks are:

1. **home-bg.webp** (1,649 KB, 2528x1684) — served at full resolution and quality to all devices, despite being displayed at 1235x823. Wasted bytes: 1,480 KB.
2. **hero-bg.webp** (301 KB, 1672x941) — served at `quality="max"` (100). Wasted bytes: 252 KB.
3. **poster.webp** (21 KB, 1920x1080) — served at full size despite being displayed at 376x212.

The `build-portable` image provider (RFC-0204) is enabled via `PUBLIC_IMAGE_PROVIDER=build-portable`, but the `image-variants.generated.yaml` manifest is missing from the Sternsystem cache clone. Without this manifest, the provider falls back to serving the raw origin asset — no `srcset` is generated, and all devices receive the largest variant.

Additionally, the `ResponsiveImage` component defaults to `quality="max"` (100), which prevents any compression savings for decorative images where visual fidelity at 100% is unnecessary.

DNA-67 (Pre-deploy Lighthouse parity gate, RFC-0833) requires every Lighthouse audit that can be deterministically checked at build time to have a build-time validator. The `image.delivery.validate` command (RFC-0830) already checks for responsive `srcset` presence and compression budgets, but the shared components themselves do not pass appropriate `widths`, `sizes`, and `quality` to the image provider.

## Problem

Three concrete gaps cause the Lighthouse image-delivery failures:

1. **ResponsiveImage default quality is `max` (100).** The component at `packages/werkstatt-site/src/domain/ui/components/responsive-image/responsive-image.astro` defaults to `quality="max"` when no quality prop is passed. This means every image — including decorative backgrounds — is served at 100% quality, maximizing file size with no visual benefit for background images.

2. **Shared components do not pass `widths` and `sizes`.** `hero-section.astro` and `site-background-component.astro` call `ResponsiveImage` without `widths` or `sizes` props. The `buildImageSources` function falls back to `DEFAULT_IMAGE_WIDTHS`, but without `sizes` the browser cannot select the correct variant from `srcset` — it defaults to assuming `100vw`, which may cause it to download a larger image than needed.

3. **`image-variants.generated.yaml` is not committed in the cache clone.** The `build-portable` provider (RFC-0204) requires a pre-generated manifest of image variants to construct `srcset` URLs. When the manifest is absent, the provider returns `{ src: descriptor.src }` — a single URL with no `srcset`. This defeats the entire responsive image pipeline.

4. **Video poster oversized.** `media.astro` calls `buildImageSources(authoredPoster, { quality: "max" })` without `widths` or `sizes`, serving a 1920x1080 poster to a 376x212 display.

5. **Content image call sites missing explicit `quality="max"`.** The default quality change from `"max"` to `90` affects all `ResponsiveImage` call sites that do not explicitly pass `quality`. Several content image call sites (footer photos, women-section image, section-card-grid images, footer-promo card images) do not currently pass `quality="max"` and would be affected by the default change.

## Decision

The shared `ResponsiveImage` component default quality changes from `"max"` (100) to `90`. Decorative background image call sites (`hero-section.astro`, `site-background-component.astro`) explicitly pass `widths` and `sizes` appropriate for their display dimensions. The video poster in `media.astro` passes `widths`, `sizes`, and `quality: 90` for responsive delivery. Content image call sites that do not currently pass `quality="max"` (`footer-component.astro`, `footer-promo-component.astro`, `section-card-grid.astro`, `women-section.astro`) are updated to explicitly pass `quality="max"` to preserve visual fidelity. The `image-variants.generated.yaml` manifest is generated by `image.variants.generate` during `build.prepare` and committed in Sternsystem cache clones via `mission.git.commit` so the `build-portable` provider can serve responsive `srcset`.

## Architectural fit

- **DNA-67 (Pre-deploy Lighthouse parity gate):** This RFC directly addresses the Lighthouse audits that score 0 — `image-delivery-insight` and `largest-contentful-paint`. By fixing the shared components, all sites using `werkstatt-site` benefit, not just warpgogol.com.
- **RFC-0204 (build-portable image provider):** This RFC ensures the provider has the manifest it needs to function as designed. The provider algorithm itself is unchanged.
- **RFC-0830 (image.delivery.validate):** The validator already checks for `srcset` presence (IMG-DELIVERY-01) and compression budgets (IMG-DELIVERY-02). This RFC makes the shared components pass those checks.
- **RFC-0833 (Lighthouse validators):** The `lighthouse.validate` LH-13 rule detects forced reflow patterns. The forced reflow fix is out of scope for this RFC (see nonGoals).

## Design

### ResponsiveImage default quality change

The `quality` default in `responsive-image.astro` changes from `"max"` to `90`:

```astro
const {
  // ...
  quality = 90,  // was "max"
} = Astro.props as Props;
```

Call sites that require maximum fidelity (e.g. content images, portraits) explicitly pass `quality="max"`.

### Hero section image

`hero-section.astro` passes `widths` and `sizes` for the hero background image:

```astro
<ResponsiveImage
  image={heroBgImage}
  alt=""
  class="hero__bg-image"
  quality="max"
  loading="eager"
  fetchpriority="high"
  widths={[480, 768, 1024, 1280, 1536, 1920]}
  sizes="100vw"
/>
```

The hero image is the LCP element and uses `quality="max"` for visual fidelity. The `widths` cover common viewport sizes up to 1920px. `sizes="100vw"` is correct because the hero is full-bleed.

### Site background image

`site-background-component.astro` passes `widths` and `sizes`:

```astro
<ResponsiveImage
  image={layer.imageMeta}
  alt=""
  class={...}
  loading={loadingMode}
  fetchpriority={loadingMode === "eager" ? "high" : undefined}
  widths={[480, 768, 1024, 1280, 1536, 1920]}
  sizes="100vw"
  data-parallax-speed={...}
  lang={lang}
/>
```

Site backgrounds are decorative and full-bleed. They inherit the new default `quality={90}`.

### Video poster

`media.astro` passes `widths` and `sizes` for the poster:

```astro
const posterSources = authoredPoster
  ? buildImageSources(authoredPoster, {
      quality: 90,
      widths: [320, 480, 640, 768, 1024],
      sizes: "(max-width: 768px) 100vw, 400px",
    })
  : null;
```

The poster is displayed in a feature video frame (max ~400px wide on desktop, full width on mobile).

### image-variants.generated.yaml manifest

The `image.variants.generate` command (RFC-0204) already runs during `build.prepare` (`packages/werkstatt-site/src/checks/pipelines/build-prepare.ts:133`) and writes `src/image-variants.generated.yaml` plus `public/_img/**/*.webp` variants. The `.gitignore` template (`onboarding/templates/runtime/gitignore.template:33`) already excludes `public/_img/` but explicitly commits the manifest: `# The manifest (src/image-variants.generated.yaml) IS committed for drift detection (RFC-0834).`

The manifest is generated in the workpiece during `build.prepare`, then committed to the cache clone via `mission.git.commit` or `mission.close` (which commits generated artifacts). The `generator-ownership.ts` registry (`packages/werkstatt-site/src/checks/generator-ownership.ts:692-698`) already lists `public/_img/**/*.webp` as owned by `image.variants.generate` with `markerPolicy: "registry-only"`. The manifest file `src/image-variants.generated.yaml` is not in the ownership registry but is tracked by `image.variants.validate` which checks its presence.

If the manifest is missing, the provider falls back to `{ src: descriptor.src }` — no `srcset`. This is the current state in the warpgogol-com cache clone.

### Content image call-site audit

The default quality change from `"max"` to `90` affects every `ResponsiveImage` call site that does not explicitly pass `quality`. The following table lists all 13 `.astro` files that use `ResponsiveImage` and their required action:

| File | Current quality | Image type | Action |
| --- | --- | --- | --- |
| `responsive-image.astro` | `"max"` (default) | Component definition | Change default to `90` |
| `hero-section.astro` (hero bg) | `quality="max"` | Decorative (LCP) | Keep `quality="max"`, add `widths` + `sizes` |
| `hero-section.astro` (portrait) | `quality="max"` | Content | Keep `quality="max"`, no change needed |
| `hero-section.astro` (inline lead) | `quality="max"` | Content | Keep `quality="max"`, no change needed |
| `hero-decision-card-section.astro` (bg) | `quality="max"` | Decorative | Change to `quality={90}`, add `widths` + `sizes` |
| `hero-decision-card-section.astro` (lead) | `quality="max"` | Content | Keep `quality="max"` |
| `site-background-component.astro` | No quality prop | Decorative | Inherit new default `90`, add `widths` + `sizes` |
| `section-shell.astro` (bg image) | No quality prop | Decorative | Inherit new default `90`, add `widths` + `sizes` |
| `footer-component.astro` (photo) | No quality prop | Content | Add `quality="max"` |
| `footer-component.astro` (bg) | No quality prop | Decorative | Inherit new default `90` |
| `footer-promo-component.astro` | No quality prop | Content | Add `quality="max"` |
| `section-card-grid.astro` | No quality prop | Content | Add `quality="max"` |
| `women-section.astro` | No quality prop | Content | Add `quality="max"` |
| `credits-gallery-section.astro` | `quality="high"` | Content | Change to `quality="max"` |
| `brand-label-component.astro` | No quality prop | Content (logo) | Add `quality="max"` |
| `section-image.astro` | `quality="max"` (default) | Content (configurable) | Keep `quality="max"` default |
| `live-photo.astro` | `quality="max"` (default) | Content | Keep `quality="max"` default |
| `person-profile-component.astro` | `quality="max"` | Content | Keep `quality="max"` |
| `media.astro` (authored poster) | `quality: "max"` | Decorative (video poster) | Change to `quality: 90`, add `widths` + `sizes` |

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/werkstatt-site/src/domain/ui/components/responsive-image/responsive-image.astro` | Default quality changed from `"max"` to `90` |
| `packages/werkstatt-site/src/domain/ui/sections/hero/hero-section.astro` | Add `widths` and `sizes` props to hero bg |
| `packages/werkstatt-site/src/domain/ui/components/site-background/site-background-component.astro` | Add `widths` and `sizes` props |
| `packages/werkstatt-site/src/domain/ui/components/section-shell/section-shell.astro` | Add `widths` and `sizes` props to bg image |
| `packages/werkstatt-site/src/domain/ui/sections/hero-decision-card/hero-decision-card-section.astro` | Change bg to `quality={90}`, add `widths` + `sizes` |
| `packages/werkstatt-site/src/domain/ui/components/media/media.astro` | Add `widths`, `sizes`, and `quality: 90` to poster `buildImageSources` call |
| `packages/werkstatt-site/src/domain/ui/components/footer/footer-component.astro` | Add `quality="max"` to photo call sites |
| `packages/werkstatt-site/src/domain/ui/components/footer-promo/footer-promo-component.astro` | Add `quality="max"` |
| `packages/werkstatt-site/src/domain/ui/components/section-body/cards/section-card-grid.astro` | Add `quality="max"` |
| `packages/werkstatt-site/src/domain/ui/sections/women/women-section.astro` | Add `quality="max"` |
| `packages/werkstatt-site/src/domain/ui/sections/credits-gallery/credits-gallery-section.astro` | Change `quality="high"` to `quality="max"` |
| `packages/werkstatt-site/src/domain/ui/components/brand-label/brand-label-component.astro` | Add `quality="max"` |
| `systems-cache/{id}/src/image-variants.generated.yaml` | Generated by `image.variants.generate` in `build.prepare`, committed via `mission.git.commit` |

## Rollout

1. **ResponsiveImage default quality change** — applies immediately to all sites using `werkstatt-site`. The default changes from `"max"` (100) to `90`. Content image call sites that need maximum fidelity must explicitly pass `quality="max"`. The call-site audit table lists all affected files and their required actions.

2. **Hero, hero-decision-card, site-background, and section-shell `widths`/`sizes`** — applies to all sites using these shared components. No per-site configuration needed.

3. **Video poster `widths`/`sizes`/`quality`** — applies to all sites using `media.astro`.

4. **Content image call-site `quality="max"` additions** — applies to `footer-component.astro`, `footer-promo-component.astro`, `section-card-grid.astro`, `women-section.astro`, `credits-gallery-section.astro`, `brand-label-component.astro`. These call sites must add `quality="max"` to preserve visual fidelity after the default changes.

5. **`image-variants.generated.yaml` manifest** — the `image.variants.generate` command already runs in `build.prepare`. The manifest must be committed in the cache clone via `mission.git.commit`. Existing sites without the manifest will continue to fall back to raw origin URLs (no `srcset`), but will produce a warning. New missions will generate and commit the manifest automatically.

6. **Validation** — `image.delivery.validate` (RFC-0830) and `lighthouse.budget.check` (RFC-0833) already run in the build pipeline. After these changes, they should pass for the affected images.

## Alternatives considered

1. **Per-site image quality config in `system.md`** — rejected. Adds configuration burden for every site. A sensible global default (90) with explicit overrides at call sites is simpler and sufficient.

2. **Global default change to `quality="high"` (80)** — rejected. 80 is too aggressive for content images. 90 provides a good balance between file size reduction and visual fidelity as a default, with `"max"` available for images where fidelity matters.

3. **RFC scope limited to components only, excluding manifest** — rejected. Without the `image-variants.generated.yaml` manifest, the `build-portable` provider cannot generate `srcset` regardless of what `widths` and `sizes` the components pass. The manifest is a prerequisite for responsive images to work.

4. **Include CSP fix in this RFC** — rejected. The CSP issue is a site-specific `system.md` `proxyBaseUrl` configuration problem, not a shared component issue. `resolveCspScriptSrcExtra` already handles same-origin correctly. Fixing it here would mix site-specific config with shared component changes.

5. **Include forced reflow fix in this RFC** — rejected. The reflow is 36.6ms (minor) and may be third-party. The `lighthouse.validate` LH-13 rule already detects read-after-write patterns. A separate investigation is needed to identify the source.

## Risks

1. **Quality regression for content images.** Changing the `ResponsiveImage` default from `"max"` to `90` affects all images that do not explicitly pass `quality`. Content images (portraits, lead images, prose images) may show visible compression artifacts. Mitigation: the call-site audit table lists all 13 files and their required actions — content image call sites must add `quality="max"` explicitly.

2. **Manifest generation timing.** If `image.variants.generate` does not run before the build, the manifest will be absent and the provider will fall back to raw URLs. Mitigation: the command already runs in `build.prepare` (`build-prepare.ts:133`); `image.variants.validate` checks manifest presence in the pipeline.

3. **Agent misinterpretation.** Agents may assume all images should use `quality={90}`. The RFC specifies that content images should use `quality="max"` explicitly. The call-site audit table and implementation notes clarify this.

4. **Cross-site impact.** All Sternsystemen using `werkstatt-site` will have image quality change from 100 to 90 for images without explicit `quality`. The call-site audit ensures content images are explicitly marked `quality="max"` in the shared components, so no site should experience visible degradation.

## Acceptance criteria

- [ ] `ResponsiveImage` default quality changed from `"max"` to `90` in `responsive-image.astro`
- [ ] `hero-section.astro` passes `widths` and `sizes="100vw"` to `ResponsiveImage` for `heroBgImage`
- [ ] `hero-decision-card-section.astro` bg image changed to `quality={90}` with `widths` + `sizes`
- [ ] `site-background-component.astro` passes `widths` and `sizes="100vw"` to `ResponsiveImage` for background images
- [ ] `section-shell.astro` passes `widths` and `sizes` to `ResponsiveImage` for bg image
- [ ] `media.astro` passes `widths`, `sizes`, and `quality: 90` to `buildImageSources` for video poster
- [ ] `footer-component.astro` adds `quality="max"` to photo call sites
- [ ] `footer-promo-component.astro` adds `quality="max"`
- [ ] `section-card-grid.astro` adds `quality="max"`
- [ ] `women-section.astro` adds `quality="max"`
- [ ] `credits-gallery-section.astro` changes `quality="high"` to `quality="max"`
- [ ] `brand-label-component.astro` adds `quality="max"`
- [ ] `image-variants.generated.yaml` is generated and committed in the warpgogol-com cache clone
- [ ] `image.delivery.validate` passes for hero-bg, home-bg, and poster images in warpgogol-com
- [ ] `rfc.validate` passes on this file before merging

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `rfc.supersede.propose --id RFC-0869 --reason "..." --invariant "DNA-N" instead of working around it (RFC-0334).
- The call-site audit table in the Design section is the authoritative list of all `ResponsiveImage` call sites. Agents MUST follow it exactly — content image call sites MUST add `quality="max"`, decorative call sites inherit the new default `90`.
- The `widths` arrays specified in this RFC are starting points. Agents MAY adjust them based on actual display dimensions measured in Lighthouse reports, but MUST include at least 3 widths covering mobile, tablet, and desktop.
- The `image-variants.generated.yaml` manifest MUST be committed in the cache clone, not in the workpiece. It is a generated artifact that belongs in the Sternsystem's tracked files. The `.gitignore` template already excludes `public/_img/` but commits the manifest.
- The `image.variants.generate` command already runs in `build.prepare` and its code is unchanged. The issue is operational (manifest not committed), not a code change.
