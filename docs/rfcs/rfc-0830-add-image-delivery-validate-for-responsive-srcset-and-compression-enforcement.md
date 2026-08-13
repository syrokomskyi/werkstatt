---
id: RFC-0830
title: "Add image.delivery.validate for responsive srcset and compression enforcement"
status: draft
kind: architecture
scope: app
owners:
  - architecture
reviewers: []
createdAt: 2026-08-13
updatedAt: 2026-08-13
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
satisfies:
  - DNA-4
  - DNA-58
versionBump: minor
commands:
  proposed:
    - image.delivery.validate
  added: []
  changed:
    - image.variants.generate
  removed: []
appsImpacted: []
packagesImpacted:
  - werkstatt-site
successSignals:
  - "All <img> elements in rendered HTML have srcset with ≥2 width variants"
  - "No image exceeds 2× displayed dimensions at mobile viewport"
  - "LCP image file size < 200 KiB on mobile"
  - "Lighthouse LCP score ≥ 0.9 for sites passing image.delivery.validate"
  - "home-bg.webp compressed to < 300 KiB with responsive variants"
nonGoals:
  - "Does not replace image.variants.validate (manifest presence) — complements it with rendered HTML scanning"
  - "Does not handle CSS background-image delivery — only <img> elements in HTML"
  - "Does not generate variants — image.variants.generate owns generation"
  - "Does not validate SVG delivery (SVGs are vector, dimension rules do not apply)"
---

# RFC-0830: Add image.delivery.validate for responsive srcset and compression enforcement

## Context

The Lighthouse performance report for `warpgogol.com` (2026-08-13) shows **Performance score 0.67**, driven primarily by **LCP = 14.3 s (score 0)**. The LCP element is `hero-bg.D8HfZmEK.webp` (`<img>` in `.hero-decision-card__bg`).

Root cause analysis from the report:

| Image | Transfer size | Served dimensions | Displayed dimensions | Issue |
|---|---|---|---|---|
| `home-bg.webp` | 1.65 MB | 843×1684 | 1235×823 | Low compression (save 1.4 MB), wrong dimensions |
| `hero-bg.webp` | 303 KB | 1672×941 | 412×1254 | No srcset, 4× oversize for mobile |
| `promo/poster.webp` | 24 KB | 1920×1080 | 376×212 | 5× oversize for mobile |

Total page weight: **2,524 KiB**, of which **2,141 KiB (85%)** is images. On Slow 4G (~1.6 Mbps), the 1.65 MB `home-bg` + 303 KB `hero-bg` take ~10 s to download, both loading eagerly.

The existing `image.variants.generate` / `image.variants.validate` (RFC-0204) only handles content asset images in `src/content/**/assets/` when `PUBLIC_IMAGE_PROVIDER=build-portable`. Shell-level background images and hero images referenced directly in `.astro` component templates are **not covered** — they bypass the responsive variant pipeline entirely.

The existing `image.format.validate` (RFC-0043) checks file format (webp-only) but not delivery dimensions, compression, or srcset presence.

## Problem

Three specific invariants are unprotected:

1. **P1: Responsive srcset absence** — No validator checks that `<img>` elements in rendered HTML have `srcset` with width variants. Shell-level images (backgrounds, hero) and composite section images can ship at a single oversized resolution without detection.

2. **P2: Image compression budget** — No validator checks that image file sizes are within a reasonable compression budget for their dimensions. A 1.65 MB WebP at 843×1684 is grossly under-compressed but passes all existing checks.

3. **P3: Served-vs-displayed dimension ratio** — No validator checks that served image dimensions do not excessively exceed displayed dimensions. A 1672×941 image displayed at 412×1254 on mobile wastes bandwidth with no build-time gate.

Reference failure modes from the Lighthouse report:

- `home-bg.webp` — Lighthouse `image-delivery-insight` flagged 1,480 KB wasted bytes (compression + dimension ratio)
- `hero-bg.webp` — LCP element with no srcset, 4× oversize on mobile
- `promo/poster.webp` — 5× oversize for displayed dimensions

## Decision

The kernel gains an `image.delivery.validate` command that scans rendered HTML in `dist/client/` for all `<img>` elements and validates responsive delivery, compression, and dimension ratios.

Additionally, `image.variants.generate` is extended to cover shell-level images referenced in `.astro` component templates (not just content asset images).

## Architectural fit

- **DNA-4** (Canonical content in `src/content/`) — Shell-level images that appear in rendered HTML are part of the site's visual content surface. This RFC extends the image delivery contract to cover them.
- **DNA-58** (Generated-file content determinism) — The extended `image.variants.generate` produces deterministic responsive variants for shell-level images, same as it already does for content assets.
- **RFC-0204** (image.variants) — This RFC extends the variant generation pipeline to shell-level images. The manifest schema gains a new `source: "shell" | "content"` field.
- **RFC-0043** (image.format.validate) — Format validation remains the first gate; delivery validation runs after build and format validation.
- **RFC-0053** (image resolution contract) — Content asset resolution is unaffected; shell-level images use a different resolution path (direct import in `.astro`).

## Design

### CLI surface

```sh
pnpm exec werkstatt run image.delivery.validate --app warpgogol-com
pnpm exec werkstatt run image.delivery.validate --all --json
```

Post-build command. Scope: `app`. Runs after `astro build` produces `dist/client/`.

### TypeScript contracts

```ts
interface ImageDeliveryFinding {
  rule: "IMG-DELIVERY-01" | "IMG-DELIVERY-02" | "IMG-DELIVERY-03" | "IMG-DELIVERY-04";
  file: string;       // HTML file path in dist/client/
  line: number;
  src: string;        // image src URL
  severity: "error" | "warning";
  message: string;
  fixHint: string;
  data?: {
    servedWidth?: number;
    servedHeight?: number;
    displayedWidth?: number;
    displayedHeight?: number;
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

| Served dimensions | Budget |
|---|---|
| < 100×100 | 20 KiB |
| 100×100 – 500×500 | 80 KiB |
| 500×500 – 1000×1000 | 200 KiB |
| > 1000×1000 | 400 KiB |

The budget formula: `budget = max(20_000, min(400_000, servedWidth * servedHeight * 0.4))` (bytes per pixel threshold).

Severity: `error` for >2× budget, `warning` for 1.5–2× budget.

**IMG-DELIVERY-03: Served-vs-displayed dimension ratio**

Served image dimensions MUST NOT exceed 2× the displayed dimensions at the mobile viewport (412px width). Checked by reading the image file header (WebP VP8/VP8L dimensions) and comparing against the `boundingRect` from the rendered HTML parse.

Severity: `error` for >3× ratio, `warning` for 2–3× ratio.

**IMG-DELIVERY-04: LCP image optimization**

The LCP candidate image (largest image in the first viewport) MUST have:
- `fetchpriority="high"`
- `loading="eager"`
- `decoding="async"`

Severity: `error`

### File system responsibilities

| Path | Role |
|---|---|
| `dist/client/**/*.html` | Scanned for `<img>` elements |
| `dist/client/_astro/*.webp` | Read for dimension and file size checks |
| `dist/client/_img/**/*.webp` | Read for variant dimension checks |
| `src/image-variants.generated.yaml` | Manifest extended with shell-level image entries |
| `packages/werkstatt-site/src/checks/image-delivery.ts` | New validator module |
| `packages/werkstatt-site/src/checks/image-variants.ts` | Extended generate command |

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
      "fixHint": "Run image.variants.generate with --include-shell to produce srcset variants",
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

### image.variants.generate extension

The `image.variants.generate` command is extended with a `--include-shell` flag (default: `true` when `PUBLIC_IMAGE_PROVIDER=build-portable`). When enabled:

1. Scan `.astro` component files in `packages/werkstatt-site/src/domain/ui/` for `<img src={...}>` patterns that reference local image imports (not remote URLs, not `contentAssetImages`).
2. Resolve the image import to its source file.
3. Generate responsive width variants (same `TARGET_WIDTHS` ladder: 320, 480, 640, 768, 1024, 1280).
4. Write variants to `public/_img/<hash>/<width>.webp`.
5. Add entries to `src/image-variants.generated.yaml` with `source: "shell"`.

The manifest schema gains an optional `source` field:

```yaml
byOrigin:
  hero-bg:
    source: shell       # new field: "shell" | "content" (default: "content")
    origin: hero-bg.webp
    variants:
      - url: /_img/hero-bg/320.webp
        width: 320
      - url: /_img/hero-bg/480.webp
        width: 480
      # ...
```

## Rollout

- **Default behavior**: `image.delivery.validate` runs in `SITES_CHECK_POSTBUILD_PIPELINE` after `cloudflare.assets.validate` and before `lighthouse.budget.check`.
- **Existing apps**: First run will flag all non-responsive images. Sites must either:
  1. Run `image.variants.generate` with `--include-shell` to produce variants, OR
  2. Add `loading="lazy"` + `decoding="async"` to below-the-fold images and accept the warning, OR
  3. Add a per-image override in `image-delivery.config.yaml` (escape hatch for intentionally oversized images).
- **New apps**: `image.variants.generate --include-shell` runs automatically in `SITES_BUILD_PREPARE_PIPELINE` when `PUBLIC_IMAGE_PROVIDER=build-portable`.
- **Grace period**: `IMG-DELIVERY-02` (compression) and `IMG-DELIVERY-03` (dimension ratio) start as `warning` severity for 2 weeks after merge, then escalate to `error`. `IMG-DELIVERY-01` (srcset) and `IMG-DELIVERY-04` (LCP) are `error` from day one.
- **Deprecation**: None. `image.variants.validate` (manifest presence) continues to run. `image.delivery.validate` (rendered HTML scanning) is complementary.

## Alternatives considered

- **Extend `image.variants.validate` to scan rendered HTML** — Rejected. `image.variants.validate` checks manifest-to-disk parity (file existence). Scanning rendered HTML for srcset/dimension/compression is a different concern and belongs in a separate command for single-responsibility.

- **Post-deploy Lighthouse CI only** — Rejected. The user's requirement is to catch these issues pre-deploy, at build time. Post-deploy Lighthouse catches them too late (after the site is live).

- **Astro `<Image>` component enforcement only** — Rejected. Shell-level images in composite sections (hero, background) use raw `<img>` tags intentionally (RFC-0104 `ALLOWED_RAW_IMAGE_USERS`). A validator must scan rendered HTML, not just source patterns.

- **Cloudflare Image Transformations** — Rejected for build-portable sites. The `build-portable` provider exists specifically to avoid runtime image transformation dependencies. This RFC extends that provider to cover shell-level images.

## Risks

- **False positives on intentionally large images** — Mitigated by `image-delivery.config.yaml` escape hatch and the 2-week grace period for compression/dimension rules.
- **Build time increase** — Scanning rendered HTML and reading image headers adds ~2–5s per site. Acceptable for a post-build validator.
- **Variant generation disk usage** — Shell-level image variants add to `public/_img/` disk usage. Mitigated by the existing source-hash invalidation in `image.variants.generate` (only regenerates changed images).
- **Agent confusion** — Agents may try to fix IMG-DELIVERY violations by adding `srcset` manually instead of running `image.variants.generate`. Mitigated by the `fixHint` in findings pointing to the generate command.

## Acceptance criteria

- [ ] `image.delivery.validate` command registered in command table with scope `app`
- [ ] IMG-DELIVERY-01..04 rules implemented with correct severity
- [ ] `image.variants.generate --include-shell` produces variants for shell-level images
- [ ] Manifest schema extended with `source` field
- [ ] `image.delivery.validate` integrated into `SITES_CHECK_POSTBUILD_PIPELINE`
- [ ] `--json` output format documented and stable
- [ ] `image-delivery.config.yaml` escape hatch documented
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
- Implementation order: extend `image.variants.generate` first, then implement `image.delivery.validate`, then fix `warpgogol.com` images, then integrate into pipeline.
