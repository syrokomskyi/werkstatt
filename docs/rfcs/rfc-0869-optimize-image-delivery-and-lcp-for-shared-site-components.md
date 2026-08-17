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
  - RFC-0305
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
  changed:
    - image.variants.generate
  removed: []
appsImpacted: []
packagesImpacted:
  - werkstatt-site
  - werkstatt-shared
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

Three concrete gaps cause the Lighthouse failures:

1. **ResponsiveImage default quality is `max` (100).** The component at `packages/werkstatt-site/src/domain/ui/components/responsive-image/responsive-image.astro` defaults to `quality="max"` when no quality prop is passed. This means every image — including decorative backgrounds — is served at 100% quality, maximizing file size with no visual benefit for background images.

2. **Shared components do not pass `widths` and `sizes`.** `hero-section.astro` and `site-background-component.astro` call `ResponsiveImage` without `widths` or `sizes` props. The `buildImageSources` function falls back to `DEFAULT_IMAGE_WIDTHS`, but without `sizes` the browser cannot select the correct variant from `srcset` — it defaults to assuming `100vw`, which may cause it to download a larger image than needed.

3. **`image-variants.generated.yaml` is not committed in the cache clone.** The `build-portable` provider (RFC-0204) requires a pre-generated manifest of image variants to construct `srcset` URLs. When the manifest is absent, the provider returns `{ src: descriptor.src }` — a single URL with no `srcset`. This defeats the entire responsive image pipeline.

4. **CSP inspector issue.** The Lighthouse report flags a Content Security Policy issue in Chrome DevTools. The current CSP in `_headers.template` includes `https://matomo-proxy.warpgogol.com` in `script-src`, but the Matomo proxy is served same-origin via `/_wg/analytics/matomo.js`. The extraneous cross-origin directive may trigger a CSP warning.

5. **Video poster oversized.** `media.astro` calls `buildImageSources(authoredPoster, { quality: "max" })` without `widths` or `sizes`, serving a 1920x1080 poster to a 376x212 display.

6. **Forced reflow (36.6ms, unattributed).** The Lighthouse report detects a forced reflow with no attributed source. The `lighthouse.validate` LH-13 rule detects read-after-write patterns in `src/scripts/**/*.ts` and `.astro` inline scripts, but the source may be in an inline script not covered by the current pattern.

## Decision

The shared `ResponsiveImage` component default quality changes from `"max"` (100) to `90`. Decorative background image call sites (`hero-section.astro`, `site-background-component.astro`) explicitly pass `widths` and `sizes` appropriate for their display dimensions. The video poster in `media.astro` passes `widths` and `sizes` for responsive delivery. The `image-variants.generated.yaml` manifest is generated and committed in Sternsystem cache clones so the `build-portable` provider can serve responsive `srcset`. The CSP in `_headers.template` is investigated and corrected to match the actual same-origin Matomo proxy path. The forced reflow source is identified and fixed.

## Architectural fit

- **DNA-67 (Pre-deploy Lighthouse parity gate):** This RFC directly addresses the Lighthouse audits that score 0 — `image-delivery-insight`, `largest-contentful-paint`, `inspector-issues`, `forced-reflow-insight`. By fixing the shared components, all sites using `werkstatt-site` benefit, not just warpgogol.com.
- **RFC-0204 (build-portable image provider):** This RFC ensures the provider has the manifest it needs to function as designed. The provider algorithm itself is unchanged.
- **RFC-0830 (image.delivery.validate):** The validator already checks for `srcset` presence (IMG-DELIVERY-01) and compression budgets (IMG-DELIVERY-02). This RFC makes the shared components pass those checks.
- **RFC-0833 (Lighthouse validators):** The `lighthouse.validate` LH-13 rule detects forced reflow patterns. This RFC includes investigating and fixing the unattributed reflow source.
- **RFC-0305 (Matomo first-party proxy):** The CSP fix aligns the `script-src` directive with the actual same-origin proxy path `/_wg/analytics/`.

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

The `image.variants.generate` command (RFC-0204) must run during `build.prepare` and the resulting `image-variants.generated.yaml` must be committed in the Sternsystem cache clone. The `build-portable` provider reads this manifest to construct `srcset` URLs.

If the manifest is missing, the provider falls back to `{ src: descriptor.src }` — no `srcset`. This is the current state in the warpgogol-com cache clone.

### CSP investigation and fix

The current CSP in `_headers.template` line 8:

```
script-src 'self' 'unsafe-inline' https://matomo-proxy.warpgogol.com
```

The Matomo proxy is served same-origin at `/_wg/analytics/matomo.js`. The `https://matomo-proxy.warpgogol.com` directive is added by `resolveCspScriptSrcExtra()` when the `proxyBaseUrl` in `system.md` growth config is a cross-origin URL. If the proxy is same-origin, this directive is unnecessary and may cause a CSP inspector warning.

The investigation must verify:

1. Whether `proxyBaseUrl` in the warpgogol-com `system.md` growth config is set to `https://matomo-proxy.warpgogol.com` or `/_wg/analytics/`.
2. If cross-origin, whether the CSP directive is correct but the proxy is not actually serving from that origin.
3. If same-origin, remove the extraneous directive from the generated `_headers`.

### Forced reflow investigation

The Lighthouse report shows 36.6ms forced reflow from `[unattributed]`. The `lighthouse.validate` LH-13 rule scans `src/scripts/**/*.ts` and `.astro` inline scripts for read-after-write layout patterns. The investigation must:

1. Run a Chrome DevTools Performance trace on warpgogol.com to identify the JavaScript causing the reflow.
2. Check inline scripts in `layout-component.astro` (print-mode detection, site-config) for read-after-write patterns.
3. Check `src/scripts/**/*.ts` for patterns not caught by LH-13.
4. Fix the identified source by wrapping layout reads in `requestAnimationFrame` or batching DOM writes.

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/werkstatt-site/src/domain/ui/components/responsive-image/responsive-image.astro` | Default quality changed from `"max"` to `90` |
| `packages/werkstatt-site/src/domain/ui/sections/hero/hero-section.astro` | Add `widths` and `sizes` props |
| `packages/werkstatt-site/src/domain/ui/components/site-background/site-background-component.astro` | Add `widths` and `sizes` props |
| `packages/werkstatt-site/src/domain/ui/components/media/media.astro` | Add `widths`, `sizes`, and `quality` to poster `buildImageSources` call |
| `packages/werkstatt-site/src/codegen/templates/app-boilerplate/public/_headers.template` | CSP fix (if needed) |
| `packages/werkstatt-site/src/codegen/app-boilerplate.ts` | `resolveCspScriptSrcExtra` fix (if needed) |
| `systems-cache/{id}/src/image-variants.generated.yaml` | Generated and committed by `image.variants.generate` |
| `packages/werkstatt-shared/src/share/image-provider.ts` | No changes — provider algorithm is unchanged |

## Rollout

1. **ResponsiveImage default quality change** — applies immediately to all sites using `werkstatt-site`. The default changes from `"max"` (100) to `90`. Sites that require `quality="max"` for specific images (hero, portraits, content images) must explicitly pass `quality="max"`. The hero section already passes `quality="max"` explicitly.

2. **Hero and site-background `widths`/`sizes`** — applies to all sites using these shared components. No per-site configuration needed.

3. **Video poster `widths`/`sizes`** — applies to all sites using `media.astro`.

4. **`image-variants.generated.yaml` manifest** — the `image.variants.generate` command must run during `build.prepare` and the manifest must be committed in the cache clone. Existing sites without the manifest will continue to fall back to raw origin URLs (no `srcset`), but will produce a warning. New missions will generate and commit the manifest automatically.

5. **CSP fix** — applies to all sites via `_headers.template`. The fix is in the template and the `resolveCspScriptSrcExtra` function.

6. **Forced reflow fix** — applies to the specific inline script identified during investigation.

7. **Validation** — `image.delivery.validate` (RFC-0830) and `lighthouse.validate` (RFC-0833) already run in the build pipeline. After these changes, they should pass for the affected images.

## Alternatives considered

1. **Per-site image quality config in `system.md`** — rejected. Adds configuration burden for every site. A sensible global default (90) with explicit overrides at call sites is simpler and sufficient.

2. **Global default change to `quality="high"` (80)** — rejected. 80 is too aggressive for content images. 90 provides a good balance between file size reduction and visual fidelity as a default, with `"max"` available for images where fidelity matters.

3. **RFC scope limited to components only, excluding manifest** — rejected. Without the `image-variants.generated.yaml` manifest, the `build-portable` provider cannot generate `srcset` regardless of what `widths` and `sizes` the components pass. The manifest is a prerequisite for responsive images to work.

4. **CSP as separate RFC** — rejected. The CSP issue is directly caused by the Matomo proxy configuration and is part of the same Lighthouse audit failure. Fixing it in the same RFC ensures a coherent performance improvement.

## Risks

1. **Quality regression for content images.** Changing the `ResponsiveImage` default from `"max"` to `90` affects all images that do not explicitly pass `quality`. Content images (portraits, lead images, prose images) may show visible compression artifacts. Mitigation: audit all `ResponsiveImage` call sites and add `quality="max"` where fidelity matters.

2. **Manifest generation timing.** If `image.variants.generate` does not run before the build, the manifest will be absent and the provider will fall back to raw URLs. Mitigation: ensure the command runs in `build.prepare` and validate manifest presence in the pipeline.

3. **CSP fix may break Matomo tracking.** If the `proxyBaseUrl` is genuinely cross-origin, removing it from CSP would block the Matomo script. Mitigation: investigate the actual proxy configuration before changing the CSP.

4. **Forced reflow source may be in third-party code.** If the reflow is caused by Matomo or another third-party script, the fix may be limited. Mitigation: the reflow is 36.6ms — minor. The investigation may conclude that no fix is possible without third-party changes.

5. **Agent misinterpretation.** Agents may assume all images should use `quality={90}`. The RFC specifies that content images should use `quality="max"` explicitly. The implementation notes clarify this.

## Acceptance criteria

- [ ] `ResponsiveImage` default quality changed from `"max"` to `90` in `responsive-image.astro`
- [ ] `hero-section.astro` passes `widths` and `sizes="100vw"` to `ResponsiveImage` for `heroBgImage`
- [ ] `site-background-component.astro` passes `widths` and `sizes="100vw"` to `ResponsiveImage` for background images
- [ ] `media.astro` passes `widths`, `sizes`, and `quality` to `buildImageSources` for video poster
- [ ] `image-variants.generated.yaml` is generated and committed in the warpgogol-com cache clone
- [ ] CSP issue in `_headers` is investigated and fixed (or documented as non-actionable)
- [ ] Forced reflow source is identified and fixed (or documented as third-party)
- [ ] `image.delivery.validate` passes for hero-bg, home-bg, and poster images in warpgogol-com
- [ ] `rfc.validate` passes on this file before merging

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `rfc.supersede.propose --id RFC-0869 --reason "..." --invariant "DNA-N" instead of working around it (RFC-0334).
- When auditing `ResponsiveImage` call sites for the quality default change, agents MUST check every `.astro` file that uses `ResponsiveImage` and add `quality="max"` where the image is content (not decorative). Decorative images (backgrounds, overlays) MAY use the new default (90).
- The `widths` arrays specified in this RFC are starting points. Agents MAY adjust them based on actual display dimensions measured in Lighthouse reports, but MUST include at least 3 widths covering mobile, tablet, and desktop.
- The `image-variants.generated.yaml` manifest MUST be committed in the cache clone, not in the workpiece. It is a generated artifact that belongs in the Sternsystem's tracked files.
- The CSP investigation MUST verify the actual `proxyBaseUrl` in `system.md` before changing the CSP template. If the proxy is genuinely cross-origin, the CSP directive is correct and the issue is elsewhere.
