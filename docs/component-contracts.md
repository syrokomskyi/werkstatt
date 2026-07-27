# Component Contracts

This document defines the component class taxonomy and structural contracts for Astro components across the monorepo. It is referenced by RFC-0019.

> **RFC-0047 / RFC-0108 update:** Shared sections and components live in `packages/ui/src/{sections,components}/`. Apps consume them via `@warpgogol/ui` imports. App-local `src/components/` is forbidden (enforced by `app.layout.validate`). The Mirror Quintet (DNA-17) governs the package-side file structure.

---

## Component classes

Components are assigned a class based on their structural role in the page hierarchy.

### Class 1 · Layout shell

**Examples:** `layout.astro`, `base-layout.astro`

- Wraps the full page (head, body, global scripts)
- Instantiated once per route at the top level
- Not part of the visitor-facing page body section tree
- Not governed by the page hierarchy contract (PC-2 / PC-3)

### Class 2 · Global shell

**Examples:** `header.astro`, `footer.astro`

- Renders site-wide chrome outside `<main>`
- Instantiated at route level, not inside sections
- Governed by their own RFC contracts (e.g. RFC-0013 for footer)
- Visibility may be controlled through shared component feature declarations

### Class 3 · Section component

**Examples:** `hero-section.astro`, `markdown-section.astro`, `faq-section.astro`

- Lives in `packages/ui/src/sections/<name>/`
- Direct child of `<main>` in a route, dispatched by `buildPage()`
- Groups one or more Class 4 / Class 5 child components
- Must carry a `cosmicName` from `PlanetCatalog` in its `manifest.yaml` (DNA-23)
- Renders via `<SectionShell>` + `<SectionHeader>` + body component + `<SectionCta>` (RFC-0108)

### Class 4 · Content component

**Examples:** `glass-panel.astro`, `section-header.astro`, `section-body-list.astro`

- Lives in `packages/ui/src/components/<name>/`
- Rendered inside a section component
- Receives canonical content via props from the section dispatcher
- Must have a corresponding `manifest.yaml` when content-driven (Mirror Quintet, DNA-17)
- Must not be rendered directly by a route (PC-2 violation)

### Class 5 · Navigation component

**Examples:** `breadcrumbs.astro`, `language-switcher.astro`

- Renders page-local or site-wide navigation UI
- Must be rendered inside a Class 3 section component
- Must not be imported or rendered directly by a route after the RFC-0019 migration

### Class 6 · Utility / primitive component

**Examples:** `button.astro`, `step-number.astro`, `transparent.astro`

- Stateless, generic building blocks with no content ownership
- May be used by any higher-class component
- Not subject to the section hierarchy contract

---

## Naming convention

| Location | Required suffix | Enforced by |
| --- | --- | --- |
| `packages/ui/src/sections/` | `-section.astro` | `manifest.contract.validate` |
| `packages/ui/src/components/` | `-component.astro` | `manifest.contract.validate` |
| `apps/*/src/pages/` | no `-component` / `-section` suffix | `naming.pages.lint` |

Cosmic names (`StarCatalog`, `PlanetCatalog`, `MoonCatalog`) are manifest/YAML fields only — never used in filenames, import paths, or directory names (DNA-23).

---

## `navigation-section` contract (RFC-0019)

The shared breadcrumbs section component from `@warpgogol/ui`:

- accepts `lang`, `items`, `showPdf?`, `showMd?`, `pageOverride?` props
- renders breadcrumbs inside a standard `<section>` shell
- is placed as the **first child** of `<main>` in any route that displays breadcrumbs
- must not be duplicated; at most one navigation section per page

Routes that previously imported breadcrumb components directly must migrate to the shared section as part of the RFC-0019 compliance requirement.

---

## Image rendering (RFC-0152)

Every **authored image** is rendered through one canonical primitive, `<ResponsiveImage>` (`@warpgogol/ui`), never a raw `<img>` or Astro `<Image>`. The primitive owns no optimization logic: it passes the resolved image (the output of `resolveImage`) to the active **Image Provider** (`@warpgogol/share`), which returns `src` + a responsive `srcset`. This is the rendering/optimization analogue of the RFC-0141 content-source port — the optimization backend is swappable without editing any component, so the same primitive serves in-repo assets today and headless-CMS / DAM images later.

- **Provider (default): `cloudflare-runtime`.** Safe by default it serves the raw in-repo origin asset (max-quality webp, `image.format.validate`) with no resize. Once Cloudflare Image Transformations are enabled on the zone and `PUBLIC_CF_IMAGE_TRANSFORM=on` is set for the build, it emits `/cdn-cgi/image/…/<origin>` URLs with a responsive `srcset` (downscaled per width, no upscaling past the intrinsic width), resized at request time. Note: `/cdn-cgi/image` URLs 404 when the feature is off — there is no `onerror` fallback for that case, which is why the default stays passthrough.
- **Adapter setting.** Apps run the `@astrojs/cloudflare` adapter with `imageService: "cloudflare"` (RFC-0152 amends RFC-0149). The previous `imageService: "custom"` + build-time sharp is forbidden: sharp reads originals from `dist/_astro` while the adapter emits them to `dist/client/_astro`, which fails the build in the `generating optimized images` phase.
- **Exceptions.** Genuinely non-resizable images — SVG logos and `data:` URLs (e.g. the donation QR code) — may use a plain `<img>`.
- **Guard.** `cloudflare.assets.validate` (post-build, in `APPS_CHECK_POSTBUILD_PIPELINE`) fails the build if rendered HTML references an `/_astro/*` asset missing from `dist/client`.

See RFC-0152 for the full contract, `docs/engineering/image-optimization-and-cloudflare-transformations.md` for the deployment/operator runbook, and `packages/ui/AGENTS.md` / `packages/share/AGENTS.md` for agent rules.

---

## Component location

All shared Astro components live in `packages/ui/src/{sections,components}/`. Apps consume them via `@warpgogol/ui` imports. App-private component folders under `apps/*/src/components/` are forbidden (enforced by `app.layout.validate`). Icons live in `packages/ui/src/icons/` and are imported via `@warpgogol/ui/icons`.
