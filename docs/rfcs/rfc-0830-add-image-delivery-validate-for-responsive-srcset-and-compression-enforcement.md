---
id: RFC-0830
title: "Add image.delivery.validate for responsive srcset and compression enforcement"
status: draft
kind: command
scope: app
owners:
  - architecture
reviewers: []
createdAt: 2026-08-13
updatedAt: 2026-08-13
enhancedAt: 2026-08-13
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0204
  - RFC-0043
  - RFC-0053
  - RFC-0172
  - DNA-4
  - DNA-58
satisfies: []
versionBump: minor
commands:
  proposed:
    - image.delivery.validate
  added: []
  changed: []
  removed: []
appsImpacted: []
packagesImpacted:
  - werkstatt-site
successSignals:
  - "All <img> elements in rendered HTML have srcset with ≥2 width variants"
  - "LCP image file size < 200 KiB on mobile"
  - "Lighthouse LCP score ≥ 0.9 for sites passing image.delivery.validate"
nonGoals:
  - "Does not replace image.variants.validate (manifest presence) — complements it with rendered HTML scanning"
  - "Does not handle CSS background-image delivery — only <img> elements in HTML"
  - "Does not generate variants — image.variants.generate owns generation"
  - "Does not validate SVG delivery (SVGs are vector, dimension rules do not apply)"
  - "Does not extend image.variants.generate — shell-level images are already content asset images resolved via contentAssetImages + resolveImage()"
  - "Does not check served-vs-displayed dimension ratio — requires CSS layout computation unavailable to static HTML parsing (Lighthouse covers this post-deploy)"
---

# RFC-0830: Add image.delivery.validate for responsive srcset and compression enforcement

## Context

The Lighthouse performance report for `warpgogol.com` (2026-08-13) shows **Performance score 0.67**, driven primarily by **LCP = 14.3 s (score 0)**. The LCP element is `hero-bg.D8HfZmEK.webp` (`<img>` in `.hero-decision-card__bg`).

Root cause analysis from the report:

| Image | Transfer size | Served dimensions | Displayed dimensions | Issue |
| --- | --- | --- | --- | --- |
| `home-bg.webp` | 1.65 MB | 843×1684 | 1235×823 | Low compression (save 1.4 MB), wrong dimensions |
| `hero-bg.webp` | 303 KB | 1672×941 | 412×1254 | No srcset, 4× oversize for mobile |
| `promo/poster.webp` | 24 KB | 1920×1080 | 376×212 | 5× oversize for mobile |

Total page weight: **2,524 KiB**, of which **2,141 KiB (85%)** is images. On Slow 4G (~1.6 Mbps), the 1.65 MB `home-bg` + 303 KB `hero-bg` take ~10 s to download, both loading eagerly.

The existing `image.variants.generate` / `image.variants.validate` (RFC-0204) handles content asset images in `src/content/**/assets/` when `PUBLIC_IMAGE_PROVIDER=build-portable`. Shell-level background and hero images are also content asset images — resolved via `contentAssetImages` + `resolveImage()` — so they are already within the variant generation pipeline's scope. However, no validator checks the **rendered HTML output** to confirm that `srcset` is actually present, that file sizes are within compression budgets, or that LCP images have the correct loading attributes.

The existing `image.format.validate` (RFC-0043) checks file format (webp-only) but not delivery dimensions, compression, or srcset presence.

## Problem

Two specific invariants are unprotected:

1. **P1: Responsive srcset absence** — No validator checks that `<img>` elements in rendered HTML have `srcset` with width variants. Images can ship at a single oversized resolution without detection, even when the variant pipeline is active.

2. **P2: Image compression budget** — No validator checks that image file sizes are within a reasonable compression budget for their dimensions. A 1.65 MB WebP at 843×1684 is grossly under-compressed but passes all existing checks.

Reference failure modes from the Lighthouse report:

- `home-bg.webp` — Lighthouse `image-delivery-insight` flagged 1,480 KB wasted bytes (compression + dimension ratio)
- `hero-bg.webp` — LCP element with no srcset, 4× oversize on mobile
- `promo/poster.webp` — 5× oversize for displayed dimensions

## Decision

The kernel gains an `image.delivery.validate` command that scans rendered HTML in `dist/client/` for all `<img>` elements and validates responsive delivery (srcset presence), compression budgets, and LCP image optimization attributes.

## Architectural fit

- **RFC-0204** (image.variants) — This RFC complements the variant generation pipeline with a rendered-HTML validator. `image.variants.generate` and `image.variants.validate` remain unchanged.
- **RFC-0043** (image.format.validate) — Format validation remains the first gate; delivery validation runs after build and format validation.
- **RFC-0053** (image resolution contract) — Content asset resolution is unaffected. All images (including shell-level backgrounds and hero images) resolve through `contentAssetImages` + `resolveImage()`.
- **RFC-0172** (content-image sitemap) — The `data-content-image` attribute on `<img>` elements is used by the sitemap harvester. `image.delivery.validate` does not interfere with this contract.

## Design

### CLI surface

```sh
pnpm exec werkstatt run image.delivery.validate --site warpgogol-com
pnpm exec werkstatt run image.delivery.validate --all --json
```

Post-build command. Scope: `app`. Runs after `astro build` produces `dist/client/`.

### TypeScript contracts

```ts
interface ImageDeliveryFinding {
  rule: "IMG-DELIVERY-01" | "IMG-DELIVERY-02" | "IMG-DELIVERY-04";
  file: string;       // HTML file path in dist/client/
  line: number;
  src: string;        // image src URL
  severity: "error" | "warning";
  message: string;
  fixHint: string;
  data?: {
    servedWidth?: number;
    servedHeight?: number;
    fileSizeBytes?: number;
    budgetBytes?: number;
  };
}

interface ImageDeliveryResult {
  command: "image.delivery.validate";
  status: "pass" | "fail";
  findings: ImageDeliveryFinding[];
  checkedImages: number;
}
```

### Rules

**IMG-DELIVERY-01: Responsive srcset required**

Every `<img>` element in rendered HTML MUST have a `srcset` attribute with at least 2 width variants (using `w` descriptors). Exceptions:

- SVG images (vector format, no width variants needed)
- Images with `width` ≤ 64px (icons, pixels, decorative)
- Images with `loading="lazy"` and `decoding="async"` that are below the fold (data attribute marker)

Severity: `error`

**IMG-DELIVERY-02: Compression budget**

Image file size MUST be within a compression budget based on served dimensions:

| Served dimensions   | Budget  |
| ------------------- | ------- |
| < 100×100           | 20 KiB  |
| 100×100 – 500×500   | 80 KiB  |
| 500×500 – 1000×1000 | 200 KiB |
| > 1000×1000         | 400 KiB |

The budget formula: `budget = max(20_000, min(400_000, servedWidth * servedHeight * 0.4))` (bytes per pixel threshold).

Severity: `error` for >2× budget, `warning` for 1.5–2× budget.

**IMG-DELIVERY-04: LCP image optimization**

The LCP candidate image (largest image in the first viewport) MUST have:

- `fetchpriority="high"`
- `loading="eager"`
- `decoding="async"`

Severity: `error`

### File system responsibilities

| Path                                                   | Role                                    |
| ------------------------------------------------------ | --------------------------------------- |
| `dist/client/**/*.html`                                | Scanned for `<img>` elements            |
| `dist/client/_astro/*.webp`                            | Read for dimension and file size checks |
| `dist/client/_img/**/*.webp`                           | Read for variant dimension checks       |
| `<app>/src/image-delivery.config.yaml`                 | Optional override config (escape hatch) |
| `packages/werkstatt-site/src/checks/image-delivery.ts` | New validator module                    |

### Output format

```json
{
  "command": "image.delivery.validate",
  "status": "fail",
  "findings": [
    {
      "rule": "IMG-DELIVERY-01",
      "file": "dist/client/de/index.html",
      "line": 42,
      "src": "/_astro/hero-bg.D8HfZmEK.webp",
      "severity": "error",
      "message": "<img> without srcset — serve responsive width variants",
      "fixHint": "Ensure ResponsiveImage is used with build-portable provider to produce srcset variants",
      "data": {
        "servedWidth": 1672,
        "servedHeight": 941,
        "fileSizeBytes": 302848
      }
    }
  ],
  "checkedImages": 28
}
```

### Failure modes

- Any `error`-severity finding → `exitCode: 1`, build fails.
- `warning`-severity findings → logged, `exitCode: 0`.
- Missing `dist/client/` → skip with `status: "pass"` (no build output to check).
- Corrupt image file (cannot read dimensions) → `warning`, skip that image.
- `--json` flag → machine-readable output, same exit code.

### image-delivery.config.yaml (escape hatch)

Optional file at `<app>/src/image-delivery.config.yaml`. Allows per-image overrides for intentionally oversized images or specific rule skips.

```yaml
overrides:
  - srcPattern: "**/hero-bg.*.webp"  # glob pattern matched against img src
    rules: [IMG-DELIVERY-02]           # rules to skip for matching images
    reason: "Hero background requires high-fidelity source for parallax effect"
  - srcPattern: "**/promo/poster.*.webp"
    rules: [IMG-DELIVERY-01, IMG-DELIVERY-02]
    reason: "Promo poster is intentionally single-resolution for CRT effect"
```

Schema:

- `overrides[]` — list of override entries
  - `srcPattern` — glob pattern matched against the image `src` URL in rendered HTML (e.g. `**/hero-bg.*.webp`)
  - `rules` — array of rule IDs to skip (`IMG-DELIVERY-01`, `IMG-DELIVERY-02`, `IMG-DELIVERY-04`)
  - `reason` — human-readable explanation for the override (required, non-empty)

The validator loads this file via `requireAstroSitePaths(ctx)`. If the file is absent, no overrides are applied. Malformed YAML or missing required fields produce a `warning` finding with rule `IMG-DELIVERY-CONFIG-01`.

## Rollout

- **Default behavior**: `image.delivery.validate` runs in `SITES_CHECK_POSTBUILD_PIPELINE` after `cloudflare.assets.validate` (line 56) and before `dist.generated-marker.validate` (line 58). This placement ensures all `/_astro/*` assets are confirmed present before dimension/file-size checks read them.
- **Existing apps**: First run will flag all non-responsive images. Sites must either:
  1. Ensure `PUBLIC_IMAGE_PROVIDER=build-portable` is set and `ResponsiveImage` is used for all content images, OR
  2. Add `loading="lazy"` + `decoding="async"` to below-the-fold images, OR
  3. Add a per-image override in `image-delivery.config.yaml` (escape hatch for intentionally oversized images).
- **New apps**: Same pipeline integration. No additional setup needed beyond the standard build-portable provider configuration.
- **Deprecation**: None. `image.variants.validate` (manifest presence) continues to run. `image.delivery.validate` (rendered HTML scanning) is complementary.

## Alternatives considered

- **Extend `image.variants.validate` to scan rendered HTML** — Rejected. `image.variants.validate` checks manifest-to-disk parity (file existence). Scanning rendered HTML for srcset/dimension/compression is a different concern and belongs in a separate command for single-responsibility.

- **Post-deploy Lighthouse CI only** — Rejected. The user's requirement is to catch these issues pre-deploy, at build time. Post-deploy Lighthouse catches them too late (after the site is live).

- **Astro `<Image>` component enforcement only** — Rejected. Composite sections (hero, hero-decision-card) use `ResponsiveImage` which renders raw `<img>` tags. Source-pattern enforcement cannot verify the rendered output (srcset, loading attributes). A validator must scan rendered HTML.

- **Cloudflare Image Transformations** — Rejected for build-portable sites. The `build-portable` provider exists specifically to avoid runtime image transformation dependencies. This RFC validates build-time output instead.

## Risks

- **False positives on intentionally large images** — Mitigated by `image-delivery.config.yaml` escape hatch with per-image rule overrides.
- **Build time increase** — Scanning rendered HTML and reading image headers adds ~2–5s per site. Acceptable for a post-build validator.
- **Agent confusion** — Agents may try to fix IMG-DELIVERY violations by adding `srcset` manually instead of ensuring `ResponsiveImage` + build-portable provider is used. Mitigated by the `fixHint` in findings pointing to the provider configuration.

## Acceptance criteria

- [ ] `image.delivery.validate` command registered in command table with scope `app`
- [ ] IMG-DELIVERY-01, IMG-DELIVERY-02, IMG-DELIVERY-04 rules implemented with correct severity
- [ ] `image.delivery.validate` integrated into `SITES_CHECK_POSTBUILD_PIPELINE` after `cloudflare.assets.validate`
- [ ] `--json` output format documented and stable
- [ ] `image-delivery.config.yaml` escape hatch schema implemented and documented
- [ ] Unit tests for each rule (fixture HTML + fixture images)
- [ ] `warpgogol.com` passes `image.delivery.validate` after fixing home-bg, hero-bg, promo/poster
- [ ] `rfc.validate` passes on this file before merging
- [ ] `AGENTS.md` updated with image delivery contract

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- For RFCs created on or after 2026-07-07 with acceptance probes: before stamping `implemented`, run `pnpm exec werkstatt run rfc.verification.emit --id RFC-0830` and commit the evidence file in the same commit.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0830 --reason "..." --invariant "DNA-N"` instead of working around it.
- Implementation order: implement `image.delivery.validate` validator module first, then integrate into `SITES_CHECK_POSTBUILD_PIPELINE`, then fix `warpgogol.com` images.
