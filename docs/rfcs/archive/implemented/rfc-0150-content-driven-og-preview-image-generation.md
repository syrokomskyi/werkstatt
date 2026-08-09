---
id: RFC-0150
title: "Adopt content-driven OG preview image generation"
status: implemented
kind: architecture
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-06-03
updatedAt: 2026-06-04
implementedAt: 2026-06-03
closedAt:
supersedes: []
supersededBy:
related:
  - RFC-0047
  - RFC-0053
  - RFC-0081
  - RFC-0087
  - RFC-0140
  - RFC-0141
  - RFC-0143
  - RFC-0149
commands:
  proposed:
    - preview.images.generate
    - preview.images.validate
  added:
    - preview.images.generate
    - preview.images.validate
  changed:
    - app.contract.full
    - apps-check.run
  removed: []
appsImpacted:
  - apps/*
packagesImpacted:
  - packages/share
  - packages/ontology
  - packages/os/site-kernel
  - packages/os/site-kernel-checks
  - packages/os/site-kernel-codegen
  - packages/os/site-kernel-content
  - packages/os/site-kernel-astro
  - packages/os/site-kernel-deploy
successSignals:
  - Every app resolves a committed `public/og-image.png` for the home-page preview.
  - Preview generation creates only missing PNG files and never overwrites existing human-authored or generated images.
  - Every routable page resolves a deterministic OG image URL, falling back to the home preview when page-specific output is absent.
  - Standard app pre-build validation fails when the home preview image is missing.
  - Preview templates are selected from thin-site content context and render in the site's visual style without app-local generation logic.
nonGoals:
  - Capturing screenshots of rendered pages as the initial generation mode.
  - Runtime-only OG image generation as the baseline correctness mechanism.
  - Replacing existing image resolution rules for normal content images.
  - Overwriting or mutating existing files in `public/` during preview generation.
  - Introducing cookie-based preview personalization or storage.
---

# RFC-0150: Adopt content-driven OG preview image generation

## Context

All apps under `apps/*` need durable social preview images for Open Graph and Twitter metadata. A single example exists at `apps/warpgogol-com/public/og-image.webp`, but the platform lacks a repository-wide contract for where preview images live, how they are generated, how pages resolve fallbacks, and how standard validation proves that every site is ready for deployment.

The current platform architecture treats apps as thin composition layers. Shared logic belongs in `packages/*`, app-authored intent belongs in `src/content/**`, generated app outputs must follow Site OS ownership rules, and public deployment artifacts must remain self-contained per app. Preview images therefore need a content-driven and Site OS-driven contract rather than per-site scripts or ad-hoc manual conventions.

This RFC defines a scalable baseline for thousands of sites: committed PNG preview assets in each app's `public/` directory, generated only when missing, selected from site-specific template presets declared through thin-site context, and validated before build.

## Problem

The system currently has no protected invariant that:

- every app has at least one social preview image;
- every page resolves a usable preview image URL;
- generated previews are reproducible but never overwrite client-authored files;
- preview metadata is derived from normalized site/page content instead of duplicated app-local code;
- standard app validation fails before deployment when the required home preview is missing;
- future Cloudflare deployment support can serve or cache previews without making dynamic rendering mandatory.

Without an RFC, agents may solve the problem locally by adding arbitrary `public/og-image.*` files, duplicating metadata logic in app routes, or building screenshot-based generators that are slow and brittle at ecosystem scale.

## Decision

The platform adopts content-driven OG preview image generation for all apps.

Every app MUST contain a committed home preview image at `public/og-image.png`. A new Site OS command, `preview.images.generate`, generates missing PNG preview images into `public/` from normalized site/page content and site-selected preset templates. The command MUST check whether the target file already exists before generation and MUST skip existing files. Existing files are treated as authoritative, whether human-authored or previously generated.

Every routable page MUST resolve a preview image. If a page-specific preview image does not exist, metadata resolution MUST fall back to the home preview image at `/og-image.png`. The standard pre-build app validation MUST include a fail-hard check for `public/og-image.png`.

The initial implementation supports exactly one generation family: build-time generation from a normalized site/page preview model. It MUST NOT capture screenshots of rendered pages. Cloudflare Worker/API support MAY be added as an optional serving and cache adapter, but static committed PNG files remain the baseline source of truth and correctness gate.

## Architectural fit

This decision aligns with the existing platform model:

- **Thin apps:** apps provide content context and committed public assets; generation and validation logic live in `packages/os` and shared packages.
- **CMS-friendly content surface:** preview configuration is declared through `src/content/system.md`, `site/{lang}/**`, or page frontmatter rather than code. If a page frontmatter specifies a static image (e.g. `preview.image: og-custom`) and the file exists in `public/` (e.g., `public/og-custom.png`), we resolve it directly without forcing configuration in `system.md` or executing generator code. This keeps `system.md` clean for custom-authored pages.
- **Image contract:** authored image references use stable names and shared resolution rules where content assets are referenced, while final social preview URLs point to public PNG deployment artifacts.
- **Generated-file governance:** generated binary files cannot carry inline generated markers, so ownership is expressed through command behavior and optional machine-readable generation reports, not by overwriting files.
- **Content-driven generation:** generator output is derived from content, routes, language, biome/site context, and selected templates.
- **Cloudflare deploy direction:** optional Worker/API behavior can be layered on top of committed public files and CDN caching without requiring runtime generation.
- **Caching and Headers:** All static preview assets in `public/` are served with long-cache headers (`Cache-Control: public, max-age=31536000, immutable`). Since files are never overwritten, any operational update requires deleting the target files and running regeneration, resulting in new deployments that invalidate CDN cache naturally.

The key boundary is that `public/preview/**/*.png` and `public/og-image.png` preview outputs are deployment artifacts committed with the site. They are not package-owned source logic, and they are not overwritten by generation.

## Design

### CLI surface

The Site OS gains two app-scoped commands:

```sh
pnpm exec werkstatt run preview.images.generate --app warpgogol-com
pnpm exec werkstatt run preview.images.validate --app warpgogol-com
pnpm exec werkstatt run preview.images.generate --app warpgogol-com --json
pnpm exec werkstatt run preview.images.validate --app warpgogol-com --json
```

`preview.images.generate`:

- discovers the app's supported languages and routable pages;
- builds a normalized preview model for the site home and each eligible page;
- selects a template preset from thin-site context;
- renders PNG via sharp from an SVG template that consumes brand tokens and page metadata;
- writes PNG files into `public/preview/[lang]/[pageId].png` only when the target path does not exist;
- always checks file existence immediately before writing;
- respects opt-out: if a file prefixed with `-` exists (e.g. `public/preview/de/-home.png`), the page is skipped and metadata falls back to `/og-image.png`;
- reports `generated`, `skipped-existing`, `skipped-optout`, `skipped-fallback`, and `failed` items;
- MUST NOT overwrite, delete, rename, or optimize existing preview images.

`preview.images.validate`:

- verifies `public/og-image.png` exists (as the ultimate site-wide fallback), unless `-og-image.png` opt-out is present;
- verifies every routable page resolves a preview image, using page-specific output under `public/preview/[lang]/[pageId].png` when present, or language-specific home preview, falling back to `/og-image.png` otherwise;
- treats an existing `-[pageId].png` opt-out file as a valid declaration that the page should fallback to the ultimate preview;
- verifies configured preview templates are known;
- verifies resolved public URLs use `.png`;
- fails hard when the ultimate home preview is missing and not opted-out;
- may warn, not fail, when a page-specific preview is absent but home fallback is valid.

The standard app pre-build validation pipeline, including `apps-check.run` and `app.contract.full`, MUST include the equivalent of `preview.images.validate`.

### TypeScript contracts

The exact package placement may be refined during implementation, but the shared contracts should be app-agnostic and reusable across OS commands, Astro metadata helpers, and optional deploy adapters.

```ts
export type PreviewImageStrategy = "generated" | "static";

export type PreviewTemplateId =
  | "brand-card"
  | "editorial"
  | "hero-summary"
  | string;

export interface SitePreviewDefaults {
  strategy: PreviewImageStrategy;
  template: PreviewTemplateId;
  title: string;
  description?: string;
  imagePath: "/og-image.png";
}

export interface PagePreviewIntent {
  pageId: string;
  lang: string;
  route: string;
  title: string;
  description?: string;
  template?: PreviewTemplateId;
  outputPath?: string;
}

export interface NormalizedPreviewModel {
  site: {
    appId: string;
    domain?: string;
    name: string;
    lang: string;
    biomeId?: string;
  };
  page: PagePreviewIntent;
  template: PreviewTemplateId;
  outputPath: string;
  fallbackPath: "/og-image.png";
  format: "png";
}

export interface PreviewTemplateInput {
  pageTitle: string;
  pageDescription?: string;
  siteName: string;
  siteTagline?: string;
  lang: string;
  brandPrimary?: string;
  brandSecondary?: string;
}

export interface PreviewGenerationItem {
  pageId: string;
  lang: string;
  route: string;
  outputPath: string;
  status: "generated" | "skipped-existing" | "skipped-optout" | "skipped-fallback" | "failed";
  template: PreviewTemplateId;
  message?: string;
}

export interface PreviewValidationViolation {
  rule: string;
  severity: "error" | "warning";
  file?: string;
  route?: string;
  message: string;
}
```

Generation templates MUST be implemented in shared package code or template assets under `packages/os/**`, not inside app folders. Thin-site content may select among approved presets and provide text/context, but it MUST NOT embed rendering logic.

### File system responsibilities

| Path | Role |
| --- | --- |
| `apps/<site>/public/og-image.png` | Ultimate site-wide required fallback preview image. |
| `apps/<site>/public/-og-image.png` | Opt-out marker: tells the generator and validator to skip the ultimate fallback. |
| `apps/<site>/public/preview/[lang]/[pageId].png` | Generated or human-authored page-specific preview images (e.g. `public/preview/de/home.png`, `public/preview/uk/home.png`, `public/preview/de/impressum.png`). |
| `apps/<site>/public/preview/[lang]/-[pageId].png` | Opt-out marker: tells the generator and validator that this page should fallback to `public/og-image.png`. |
| `apps/<site>/src/content/system.md` | Canonical site manifest and possible source for preview defaults. |
| `apps/<site>/src/content/site/{lang}/**` | Thin-site context for site labels, brand text, and template selection. |
| `apps/<site>/src/content/pages/{lang}/**.md` | Page metadata source for normalized preview models. |
| `packages/os/site-kernel-codegen` or a dedicated OS generator package | Owns build-time PNG generation command implementation. |
| `packages/os/site-kernel-checks` | Owns validation rules and app pipeline integration. |
| `packages/share` / `packages/ontology` | Own shared preview schemas, normalized model helpers, and template id contracts if needed. |
| `packages/os/site-kernel-deploy` | May integrate optional Cloudflare serving/cache adapter behavior. |

Binary preview outputs in `public/` are committed with the site. The generator's no-overwrite rule is the ownership boundary: deleting a target image from `public/` is the explicit operator action that allows regeneration.

If implementation needs a machine-readable report, it MAY write a non-authoritative report such as `public/preview/preview-images.generated.json` or a Site OS report artifact. Such a report MUST NOT be required for runtime metadata resolution.

### Output format

`preview.images.generate --json` returns a stable result envelope:

```json
{
  "command": "preview.images.generate",
  "app": "warpgogol-com",
  "status": "ok",
  "format": "png",
  "requiredFallback": "/og-image.png",
  "items": [
    {
      "pageId": "home",
      "lang": "de",
      "route": "/de/",
      "outputPath": "public/preview/de/home.png",
      "status": "skipped-existing",
      "template": "brand-card"
    },
    {
      "pageId": "about",
      "lang": "de",
      "route": "/de/ueber-uns",
      "outputPath": "public/preview/de/about.png",
      "status": "generated",
      "template": "hero-summary"
    },
    {
      "pageId": "agb",
      "lang": "de",
      "route": "/de/agb",
      "outputPath": "public/preview/de/agb.png",
      "status": "skipped-optout",
      "template": "brand-card"
    }
  ],
  "summary": {
    "generated": 1,
    "skippedExisting": 1,
    "skippedOptout": 1,
    "skippedFallback": 0,
    "failed": 0
  }
}
```

`preview.images.validate --json` returns violations:

```json
{
  "command": "preview.images.validate",
  "app": "warpgogol-com",
  "status": "fail",
  "requiredFallback": "/og-image.png",
  "violations": [
    {
      "rule": "PREVIEW-01",
      "severity": "error",
      "file": "public/og-image.png",
      "message": "Required home preview image is missing."
    }
  ]
}
```

### Failure modes

Validation rules:

- `PREVIEW-01`: `public/og-image.png` MUST exist. Fail hard.
- `PREVIEW-02`: every routable page MUST resolve a preview image URL. Fail hard only when fallback is unavailable.
- `PREVIEW-03`: configured preview template ids MUST be known. Fail hard.
- `PREVIEW-04`: resolved social preview outputs MUST use `.png`. Fail hard for configured outputs; warn for legacy files not referenced by metadata.
- `PREVIEW-05`: generation MUST skip existing target files. A write attempt to an existing file is a command bug and MUST fail.
- `PREVIEW-06`: screenshot capture MUST NOT be used by the initial generation command. Fail hard if a site config requests screenshot strategy before a superseding RFC or accepted extension enables it.
- `PREVIEW-07`: an existing `-` prefixed file (e.g. `public/preview/de/-agb.png`) MUST silence warnings for the corresponding non-prefixed preview. It is treated as an explicit operator opt-out.

Generation failure behavior:

- Missing `public/og-image.png` is not automatically overwritten if absent and a home generation target can be produced; the command may generate it because it is missing.
- Existing `public/og-image.png` is never overwritten.
- An existing `public/-og-image.png` opt-out marker causes the generator to skip ultimate fallback generation with status `skipped-optout`.
- If a page-specific image exists, it is skipped.
- If a page-specific image is missing and an opt-out marker (`-[pageId].png`) exists, it is skipped with status `skipped-optout`.
- If a page-specific image is missing and generation is disabled for that page, metadata still falls back to `/og-image.png` when present.
- If rendering a page-specific preview fails, the command reports the item as `failed` and exits non-zero unless a documented `--continue-on-error` mode is later added.

### Optional Cloudflare Worker/API layer

Cloudflare support is allowed only as an optional adapter and MUST NOT replace committed static PNG files as the correctness baseline.

A future implementation MAY add an API such as:

```text
/og/:lang/:pageId.png
```

or reuse static public paths behind Worker routing, but it MUST obey these constraints:

- first try to serve the committed `public/` PNG asset;
- use CDN/Cache API/R2/KV only as an acceleration or fallback layer;
- use content-hash or deploy-version-aware cache invalidation if dynamic generation is introduced;
- never require cookies;
- never make social crawlers depend on uncached expensive rendering for normal pages;
- keep local static build behavior first-class for non-Cloudflare hosting.

If dynamic generation becomes more than an optional adapter, it requires a follow-up RFC.

## Rollout

1. Introduce shared preview schemas and resolution helpers.
2. Implement `preview.images.validate` and integrate it into standard app pre-build validation as fail-hard for `public/og-image.png`.
3. Implement `preview.images.generate` with PNG output and no-overwrite semantics.
4. Integrate `preview.images.generate` into `APPS_BUILD_PREPARE_PIPELINE` so missing previews are auto-generated before Astro build.
5. Add at least one preset template family and allow thin-site context to select from approved presets.
6. Update onboarding/scaffold so new apps start with a valid preview context and can generate `public/og-image.png`.
7. Migrate existing apps by committing `public/og-image.png`; existing `.webp` examples may remain only as unused assets or be manually replaced by PNG.
8. Add optional page-specific generation paths under `public/preview/**/*.png` after the home fallback invariant is green.
9. Consider a Cloudflare Worker/API adapter only after static generation and validation are stable.

Existing apps may adopt in two steps: first commit `public/og-image.png`, then opt into page-specific generation. New apps should comply from day one through onboarding output and app validation.

## Alternatives considered

### Keep one manually authored image per site only

Rejected as the only architecture because it does not scale to page-specific previews or template-driven client customization. It remains supported as the fallback baseline.

### Screenshot actual pages at build time

Rejected for the initial implementation. It is slower, more brittle, and more sensitive to animation, lazy loading, viewport differences, fonts, and browser behavior. Template-driven rendering from a normalized model is more deterministic for thousands of sites.

### Generate dynamically on Cloudflare for every request

Rejected as baseline correctness. Social crawlers need reliable and fast assets, and not every deployment target should require Worker-compatible image rendering. Dynamic serving may be useful as an optional cache-backed adapter.

### Store generated previews outside `public/`

Rejected because social metadata needs stable public URLs, and apps should remain self-contained deployable workspaces. Source intent may live in content; final social assets live in `public/`.

### Overwrite generated files on every build

Rejected because clients may manually replace images. The explicit operator workflow is: delete the image from `public/`, then rerun generation.

## Risks

- **Template drift:** generated cards may diverge from the live site style if templates do not consume stable biome/design tokens.
- **Binary review noise:** committed PNG files add binary diffs. This is accepted because deployment correctness and manual client control are prioritized.
- **Stale previews:** no-overwrite semantics mean content changes do not automatically refresh existing images. Operators must delete targeted files to regenerate them.
- **Path collisions:** output path rules must be deterministic across localized routes and page IDs.
- **False confidence from fallback:** a page without a specific preview is still valid due to home fallback. Reports should make fallback usage visible.
- **Cloudflare overreach:** agents may try to implement dynamic rendering first. This RFC explicitly forbids making it the baseline.

## Acceptance criteria

- [x] Shared preview metadata and normalized model contracts are defined in the relevant package. (evidence: implemented historically)
- [x] `preview.images.generate` is registered as an app-scoped Site OS command. (evidence: implemented historically)
- [x] `preview.images.generate` renders real 1200x630 PNG images via sharp SVG rasterization using brand-aware templates. (evidence: implemented historically)
- [x] `preview.images.generate` writes PNG files into `public/` only when missing and never overwrites existing files. (evidence: implemented historically)
- [x] `preview.images.validate` respects `-` prefixed opt-out files and suppresses warnings for opted-out pages. (evidence: implemented historically)
- [x] `preview.images.validate` is registered and has stable `--json` output. (evidence: implemented historically)
- [x] Standard app pre-build validation fails when `public/og-image.png` is missing. (evidence: implemented historically)
- [x] Every page metadata resolver falls back to `/og-image.png` when a page-specific image is absent. (evidence: implemented historically)
- [x] At least one site-style-aware preset template family is available and selectable through thin-site context. (evidence: implemented historically)
- [x] Screenshot-based generation is not implemented as part of this RFC. (evidence: implemented historically)
- [x] Existing apps either commit `public/og-image.png` or have a documented migration path. (evidence: implemented historically)
- [x] Optional Cloudflare/API behavior, if implemented, serves committed public assets first and remains non-required. (evidence: original apps retired by RFC-0381, implemented historically)
- [x] `AGENTS.md` and relevant GRACE docs are updated if implementation changes agent behavior, app contracts, or verification policy. (evidence: AGENTS.md:1, agent guide updated)
- [x] `rfc.validate` passes on this file before merging. (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted.
- Agents MUST NOT change status fields in any RFC unless explicitly instructed by a maintainer.
- Agents MUST implement generation and validation in `packages/os/**` and shared packages, not as app-local scripts.
- Agents MUST preserve the no-overwrite contract: existing files in `public/` are authoritative.
- Agents MUST generate `.png` outputs for social preview metadata.
- Agents MUST keep apps thin: app content may select templates and provide text/context, but rendering logic belongs in packages.
- Agents MUST integrate the required `public/og-image.png` check into standard app pre-build validation.
- Agents MUST NOT implement screenshot capture as part of this RFC.
- Agents MUST NOT make Cloudflare Worker/API rendering mandatory for static build correctness.
- Agents MUST NOT use cookies for preview routing, personalization, or caching.
- When implementing, agents MUST update affected GRACE documents and nearest applicable `AGENTS.md` files if contracts or verification rules change.
