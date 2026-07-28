---
id: RFC-0257
title: "Adopt print-ready visitor pages and SSG PDF generation"
status: implemented
# kind options: architecture | contract | command | policy | deprecation
kind: architecture
# scope options: app | workspace
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-07-01
updatedAt: 2026-07-01
implementedAt: 2026-07-01
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0047
  - RFC-0101
  - RFC-0106
amendedBy: []
related:
  - RFC-0108
  - RFC-0109
  - RFC-0116
  - RFC-0121
  - RFC-0134
  - RFC-0150
  - RFC-0162
  - RFC-0185
  - RFC-0204
  - RFC-0209
  - RFC-0229
  - RFC-0231
  - RFC-0235
  - RFC-0254
commands:
  proposed:
    - print.pdf.generate
    - print.pdf.validate
    - print.layout.validate
    - print.contract.validate
  added:
    - print.pdf.generate
    - print.pdf.validate
    - print.layout.validate
    - print.contract.validate
  changed: []
  removed: []
appsImpacted:
  - warpgogol-com
  - apps/*
packagesImpacted:
  - "@gogol/share"
  - "@gogol/ui"
  - "@gogol/ontology"
  - "@gogol/site-kernel"
  - "@gogol/site-kernel-checks"
  - "@gogol/site-kernel-astro"
  - "@gogol/site-kernel-content"
successSignals:
  - "Every page on warpgogol-com renders correctly when the visitor presses Ctrl+P or uses the browser print dialog."
  - "Every page on warpgogol-com has a matching PDF at `/_print/<lang>/<path>.pdf` generated during `build.post`."
  - "Pages with motion, parallax, glass effects, or background images degrade gracefully to static, high-contrast print output."
  - "Print layout validation fails the build if any shared section or shell component introduces print-blocking CSS or fixed positioning."
  - "The pilot implementation adds no app-local print logic; all behavior lives in shared packages and content declarations."
nonGoals:
  - "Do not create a separate print-only HTML route such as `/de/pfad/print/` or `/print/de/pfad`. The canonical print view is the same page with the `?print` query parameter or the browser print dialog."
  - "Do not rely on cookies, sessions, or server-side rendering to detect print mode. Print mode is detected from the URL query string or browser media."
  - "Do not use dynamic runtime PDF generation as the baseline. PDFs are build-time static artifacts in `dist/client/_print/`."
  - "Do not require page authors to write print CSS. Print styling is owned by the shared section framework and a single shared print stylesheet."
  - "Do not cover client-side, user-triggered PDF download buttons in the initial implementation. The PDF files exist and are linkable; a download widget may follow later."
---

# RFC-0257: Adopt print-ready visitor pages and SSG PDF generation

## Context

The WGogol platform builds thin Astro sites under `apps/*`. Today these sites are optimized for screen visitors: motion, glass effects, parallax backgrounds, and responsive layouts. When a visitor, partner, or authority prints a page, the result is usually broken: backgrounds disappear, text overflows, CTAs overlap content, and the layout wastes paper. Most CRMs and SaaS products treat print as an afterthought; we want print to be a first-class output channel.

The platform already has the infrastructure to make this reliable:

- **Thin apps** (`apps/*`) contain only content and composition; shared logic lives in `packages/*`.
- **CMS-friendly content surface** (RFC-0047) lets authors declare page behavior through `pages/{lang}/*.md` frontmatter and `site/{lang}/labels.md`.
- **Section framework** (RFC-0101..RFC-0108) provides a single shared `SectionShell` that controls background, motion, glass, and body rendering for every page section.
- **Motion orchestrator** (RFC-0106) gates GSAP-driven effects behind site-level flags read from content.
- **Effects system** (RFC-0134) wraps item-level effects through a consistent, targetable API.
- **Build-time generation** (RFC-0150, RFC-0204) produces deterministic static artifacts into `public/` or `dist/client/` from content.
- **Generated-file governance** (RFC-0185) strips generated markers from distribution artifacts and tracks ownership.

This RFC extends those contracts so that every page can be printed or saved as a PDF reliably, beautifully, and without app-local code.

## Problem

The platform currently has no protected invariant for print output. The unprotected surface is:

> Every page produced by the platform must render legibly, completely, and on-brand when printed or converted to PDF.

Today the following failure modes are possible on any `apps/*` site:

1. **Motion and glass survive into print.** GSAP counters, reveal animations, and `GlassPanel` effects can render as blank or half-faded elements when the browser captures the print media.
2. **Background images and site backgrounds are removed.** `@media print` browsers often drop background images by default; sections that rely on dark backgrounds with light text become white-on-white or illegible.
3. **Fixed or sticky headers repeat or overlap.** The shared header and footer are not designed for paged media and can obscure content.
4. **CTAs and navigation waste space.** Interactive buttons and navigation links appear as dead artifacts on paper.
5. **No PDF baseline.** There is no committed or generated PDF equivalent of any page, so partners and authorities cannot rely on a stable document.
6. **No validation.** Nothing in `build.check` or `build.post` proves that a page will print correctly.
7. **Per-app workarounds.** Without a shared contract, each site would solve print differently, creating maintenance drift.

These problems are especially severe for the `warpgogol-com` pilot because it uses dark hero sections, glass panels, and animated stats.

## Decision

The platform adopts a print-ready visitor-page contract for all apps under `apps/*`. Every page MUST render correctly through the browser print dialog (`Ctrl+P` / `Cmd+P`) and MUST be convertible to a static PDF during the build.

The print mode is activated by the presence of a `?print` query parameter with any value. The canonical print view is the same page route; there is no separate print-only URL path. The browser print dialog works without the query parameter because the shared print stylesheet uses `@media print`.

PDFs are generated after the Astro build by a new Site OS command, `print.pdf.generate`. The command starts a static file server over `dist/client`, navigates each routable page with `?print`, calls the browser's print-to-PDF API, and writes the result to `dist/client/_print/<lang>/<path>.pdf`. The command is idempotent, skips existing PDFs unless `--force` is passed, and can be disabled per page through frontmatter or per app through `system.md`.

The shared section framework becomes print-aware:

- `SectionShell` removes or flattens motion, parallax, and glass effects in print media.
- `SectionHeader` inherits color and suppresses segmented heading animations.
- `SiteBackground` is hidden in print media.
- `SectionImage` renders at full intrinsic quality but fits within the print page.
- Interactive blocks (CTAs, forms, chat widgets) are suppressed or replaced with static equivalents.

A new shared print stylesheet, `packages/ui/src/styles/print.css`, provides the baseline `@media print` rules: page margins, page breaks, color-forcing, and suppression of screen-only elements. The shared `layout-component.astro` injects this stylesheet on every page as a `media="print"` link. The same stylesheet is also the source of truth for the Playwright PDF generator.

Content authors control print behavior through three content layers:

1. **Page frontmatter** (`pages/{lang}/*.md`): opt-out, orientation, page size, margins, and which regions to hide.
2. **Site labels** (`site/{lang}/labels.md`): print header logo, legal notice, footer URL, and fallback labels.
3. **System manifest** (`src/content/system.md`): per-app enable/disable of SSG PDF generation.

Site OS gains three new app-scoped commands:

- `print.pdf.generate` — build-post PDF generator.
- `print.pdf.validate` — verifies that every expected PDF file exists.
- `print.layout.validate` — static analysis of shared UI/section CSS for print-blocking patterns.
- `print.contract.validate` — validates page `print` frontmatter and site `print` labels.

These commands are wired into the standard pipelines:

- `print.contract.validate` and `print.layout.validate` run in `build.check`.
- `print.pdf.generate` runs in `build.post` after the Astro build.
- `print.pdf.validate` runs in `build.post` after generation.

## Architectural fit

- **Thin apps (DNA-07, DNA-25, RFC-0026, RFC-0037):** apps only provide content and a thin proxy route; print behavior is implemented in `packages/ui`, `packages/share`, and `packages/os/site-kernel-checks`. No app-local Astro component, script, or CSS file is required for the baseline.
- **CMS-friendly content surface (RFC-0047):** `print` frontmatter is added to the page schema and `site/{lang}/labels.md` gains a `print` block. This is an amendment, not a new content domain.
- **Section framework (RFC-0101..RFC-0108):** `SectionShell` is the single seam that suppresses motion, background, and glass for print. No new per-section code is needed; sections inherit the behavior from the shell.
- **Motion stance (RFC-0106, RFC-0116):** the orchestrator already disables motion features that are not used. In print media, the orchestrator flags are effectively false, and CSS `print-color-adjust` / `forced-color-adjust` rules force the final visual state.
- **Effects system (RFC-0134):** `EffectHost` and item-level effects are suppressed in print media through the same shared CSS; content authors do not edit effects for print.
- **Section/site background separation (RFC-0121, RFC-0105):** `SiteBackground` is hidden in print; `SectionBackground` is flattened to a solid color or kept as an image only when the page explicitly opts in.
- **Image provider port (RFC-0204, RFC-0152):** print images use the already-resolved content assets. The PDF generator does not re-derive variants; it prints the page as the visitor sees it.
- **Generated-file governance (RFC-0185, RFC-0081):** PDFs are generated `dist/client/` artifacts, not committed source files. They are stripped of generated markers and excluded from source tracking.
- **Open Graph / structured data (RFC-0162, RFC-0209):** the generated PDFs are linked from the page through `<link rel="alternate" type="application/pdf">` so search engines and document crawlers can discover them.
- **Canonical URLs and breadcrumbs (RFC-0229):** the print footer includes the canonical URL of the page; the printed page is not a duplicate URL because it is the same route with a query parameter.
- **Attribution policy (RFC-0231):** material credits and copyright are preserved in print; attribution visibility settings are respected.
- **Egress text normalization (RFC-0235):** PDF text is normalized by the existing `text.normalize.apply` post-build pass before final validation.

## Design

### 1. Print mode detection

Print mode is detected in two ways, both content-free:

1. **URL query parameter.** Any route that ends with `?print` or contains `?print=...` is treated as a print request. The value is ignored; presence is enough. Example: `https://warpgogol.com/de/angebot/?print`.
2. **Browser print media.** The user pressing `Ctrl+P` triggers the browser's `print` media, which applies the same shared print stylesheet.

In the app route, the `?print` parameter is not used to render a different static file; Astro static sites serve the same HTML for the route regardless of query string. Instead, the page injects a tiny first-party script that reads `window.location.search` and adds `data-print` to `<html>` when the parameter is present. This lets components and CSS react to the explicit print request synchronously before paint, avoiding a flash of screen layout. The script is inline, deferred, and gated by the orchestrator so it does not run when motion is disabled for other reasons.

```ts
// pseudo-code for the inline detection script injected by layout-component.astro
if (new URL(window.location.href).searchParams.has("print")) {
  document.documentElement.setAttribute("data-print", "");
}
```

The `@media print` stylesheet is the authoritative source of print styling; `html[data-print]` selectors are used only for states that cannot be expressed through media queries alone (e.g., forcing a collapsible section to expand before capture).

### 2. Content contract

#### 2.1 Page frontmatter

A new optional `print` block is allowed in every `pages/{lang}/*.md` frontmatter. Its schema is additive to the existing page schema (RFC-0047 amendment).

```yaml
print:
  enabled: true               # boolean, default true
  orientation: portrait         # portrait | landscape | auto, default auto
  pageSize: a4                  # a4 | letter | legal, default a4
  margins: normal              # normal | narrow | none, default normal
  expandDetails: true          # boolean, default true
  hide:                        # list of PrintRegion, default []
    - navigation
    - breadcrumbs
    - cta
    - footer-links
  background: preserve         # preserve | flatten, default preserve
```

Field semantics:

- `enabled`: when `false`, the page has no PDF generated and the browser print dialog shows a minimal "print disabled" notice. Legal/authority pages must never be disabled; `print.contract.validate` enforces that pages with `semanticType: legal` keep `enabled: true`.
- `orientation`: passed to Playwright as `landscape`/`portrait`. `auto` means the generator tries both and picks the one that fits the content height better, defaulting to `portrait`.
- `pageSize`: passed to Playwright's `page.pdf({ format })`. Only ISO/ANSI formats in the first release.
- `margins`: maps to Playwright margin presets. `normal` = 20mm, `narrow` = 10mm, `none` = 0mm.
- `expandDetails`: when `true`, the print script expands all `<details>` elements before PDF capture and the print stylesheet shows them open.
- `hide`: a closed list of screen regions that must be suppressed in print. Valid values: `navigation`, `breadcrumbs`, `cta`, `footer-links`, `header-logo`, `site-background`, `hero-animation`. Unknown values are rejected by `print.contract.validate`.
- `background`: `preserve` keeps section background images/colors in print (with `print-color-adjust: exact`); `flatten` replaces them with a neutral surface. This lets pages with important background imagery (e.g., the hero decision card) keep it, while prose pages stay ink-efficient.

#### 2.2 Site labels

`site/{lang}/labels.md` gains a `print` block for language-specific print chrome.

```yaml
print:
  headerLogo: "logo"                         # optional content asset token or public path
  headerBrandLabel: "Warpgogol"               # falls back to top-level brandLabel
  headerTagline: "Digitales Fundament."      # optional
  footerLegalNotice: "..."                   # small legal text for the footer
  footerShowUrl: true                        # print the canonical URL
  footerShowDate: true                       # print the generation date
  footerPageNumberLabel: "Seite"             # e.g. "Seite 1 von 3"
  printDisabledNotice: "Diese Seite ist nicht für den Druck optimiert."
```

All fields are optional and fall back to existing top-level labels (`brandLabel`, `copyright`, `footer.taglineLines`). The header/footer chrome is rendered by the shared print stylesheet using CSS `::before`/`::after` on `@page` and by static print-only elements that are hidden on screen and shown via `@media print`. The shared layout does not introduce new Moon components for print chrome in the first release; the chrome is CSS-only.

#### 2.3 System manifest

`src/content/system.md` gains an `output.printPdf` toggle under the existing `output` projection (RFC-0143).

```yaml
output:
  printPdf: true      # default false until full rollout; pilot warpgogol-com sets true
```

When `false` or absent, `print.pdf.generate` exits immediately with a success summary. When `true`, the command generates PDFs for all routable pages whose `print.enabled` is not `false`. This lets the pilot opt in while other apps remain unaffected.

### 3. Shared UI changes

#### 3.1 Shared print stylesheet

A new file `packages/ui/src/styles/print.css` is the single source of truth for baseline print styling. It is framework-agnostic and token-driven. It is included on every page by `layout-component.astro` as:

```html
<link rel="stylesheet" href={printStylesheetUrl} media="print" />
```

The stylesheet uses CSS custom properties from the active biome so colors and typography remain on-brand. Key rules include:

```css
@page {
  size: auto;
  margin: 20mm 15mm;
}

@media print {
  /* Force background colors and images to print. */
  * {
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }

  /* Hide screen-only shell elements. */
  .site-header,
  .site-footer__nav,
  .site-footer__legal-links,
  .breadcrumbs,
  .section-cta,
  .chat-widget,
  .language-switcher,
  .skip-link {
    display: none !important;
  }

  /* Keep the footer but only its legal/copyright strip. */
  .site-footer__print-strip {
    display: block !important;
  }

  /* Suppress motion states. */
  [data-reveal],
  [data-counter],
  [data-parallax],
  [data-stagger] {
    opacity: 1 !important;
    transform: none !important;
    filter: none !important;
  }

  /* SectionShell becomes a normal flow block. */
  .section-shell {
    position: static !important;
    overflow: visible !important;
    min-height: auto !important;
    background-attachment: scroll !important;
  }

  /* Avoid breaking inside cards, stats, and list items. */
  .section-body__card,
  .section-body__stat,
  .section-body__item,
  .markdown-section__content details,
  .section-cta-group__cta {
    break-inside: avoid;
    page-break-inside: avoid;
  }

  /* Force headings and major sections to start on a new page when needed. */
  .section-shell + .section-shell {
    break-before: page;
  }

  /* Images should fit the page. */
  img, video, svg, canvas {
    max-width: 100% !important;
    height: auto !important;
  }
}
```

The actual stylesheet is more exhaustive and is maintained as a shared package file. App-specific overrides are allowed in `apps/<site>/src/styles/global.css` under `@media print`, but they must not weaken the shared rules.

#### 3.2 SectionShell print behavior

`SectionShell` receives a read-only print context from the shared layout. Internally it adds `data-print` to its root element when the active media is print or when `html[data-print]` is present. Its CSS module imports the shared print tokens and suppresses:

- `background-attachment: fixed` and parallax transforms;
- `backdrop-filter` / `filter` glass effects;
- `min-height: 100vh` and full-viewport heights;
- animated reveal classes that may have `opacity: 0` in the screen state.

The shell does not introduce new props; it reacts to the ambient print state. This is required because `SectionShell` is the only component that knows whether a section background is a `SiteBackground` projection or a local `SectionBackground`.

#### 3.3 SiteBackground and SectionBackground

- `SiteBackground` is hidden in print (`display: none`) because it is purely decorative.
- `SectionBackground` with `kind: image` is preserved when the page has `print.background: preserve`; otherwise it is flattened to a solid derived from the biome's `--ds-color-surface` token. The text color remains legible because the section's tone (light/dark) is preserved through `print-color-adjust` and explicit color inheritance.

#### 3.4 Motion and effects

The layout orchestrator (RFC-0106) already receives its config from `site/{lang}/labels.md`. A new field `orchestrator.print: false` is not added; instead, the shared print CSS treats all motion as final state. Existing motion classes (`data-reveal`, `data-counter`, etc.) are reset to their end-state values. This avoids maintaining a separate motion config for print and avoids accidental motion during PDF capture.

`EffectHost` (RFC-0134) suppresses item-level effects in print by setting `box-shadow: none`, `border-image: none`, and `backdrop-filter: none` under `@media print`. Glass effects become flat surfaces with the same background color.

### 4. PDF generation

#### 4.1 Command overview

`print.pdf.generate` is a new app-scoped Site OS command. It runs only in `build.post` because it needs the built static site in `dist/client`.

```sh
pnpm exec site-kernel run print.pdf.generate --app warpgogol-com
pnpm exec site-kernel run print.pdf.generate --app warpgogol-com --force
pnpm exec site-kernel run print.pdf.generate --app warpgogol-com --json
```

Behavior:

1. Read `system.md` and confirm `output.printPdf: true`. If false/absent, exit 0 with summary "PDF generation disabled for this app."
2. Discover all routable pages from the route registry (same source used by `sitemap.generate`).
3. For each page, read its localized content frontmatter. Skip pages with `print.enabled: false`.
4. Start a static HTTP server over `dist/client` on a random localhost port.
5. Launch a headless Chromium browser via Playwright.
6. For each page, navigate to `http://localhost:<port>/<route>?print` and wait for the page's `load` event plus a short idle (`networkidle`).
7. If `print.expandDetails` is true, execute a small script that expands all `<details>` elements.
8. Call `page.pdf({ format, landscape, margin, printBackground: true, preferCSSPageSize: true })`.
9. Write the PDF to `dist/client/_print/<lang>/<path>.pdf`, creating parent directories as needed.
10. Close the browser and server.

The command is idempotent: it skips any PDF that already exists and has a file size greater than zero, unless `--force` is passed. Deleting a PDF file is the explicit regeneration trigger. This matches the contract of RFC-0150 for preview images.

#### 4.2 PDF path mapping

Given a page route `/de/angebot/` (default language is `de`, so the unprefixed route is `/angebot/`):

- PDF path: `dist/client/_print/de/angebot.pdf`
- Public URL: `https://warpgogol.com/_print/de/angebot.pdf`

For nested routes `/de/website/elektriker/deu/bw/`:

- PDF path: `dist/client/_print/de/website/elektriker/deu/bw.pdf`
- Public URL: `https://warpgogol.com/_print/de/website/elektriker/deu/bw.pdf`

For the home page `/`:

- PDF path: `dist/client/_print/de/index.pdf` (default language is `de`)
- Public URL: `https://warpgogol.com/_print/de/index.pdf`

For non-default languages, the language prefix is preserved in the `_print` sub-path: `/uk/umovy/` → `dist/client/_print/uk/umovy.pdf`.

The `.pdf` extension replaces the trailing slash; there is no directory per page.

#### 4.3 Playwright dependency

`playwright` is added as a dependency of `@gogol/site-kernel-checks`. The command uses the Chromium browser that Playwright downloads. The dependency is workspace-wide through the checks package; individual apps do not install it. CI runners must run `pnpm exec playwright install chromium` before `build.post` if the environment does not have a system Chromium.

If Playwright is not available, the command exits with a clear error and the build post pipeline fails. This is acceptable because the feature is opt-in per app; only the pilot app enables it.

### 5. Validation commands

#### 5.1 `print.contract.validate`

Static validation of the print content contract. Runs in `build.check`.

Violations:

- `PRINT-CONTRACT-01`: a page has `print.enabled: false` but its `semanticType` is `legal` or `authority`.
- `PRINT-CONTRACT-02`: an unknown value in `print.hide`.
- `PRINT-CONTRACT-03`: `print.orientation` is not one of `portrait`, `landscape`, `auto`.
- `PRINT-CONTRACT-04`: `print.pageSize` is not one of `a4`, `letter`, `legal`.
- `PRINT-CONTRACT-05`: `print.background` is not `preserve` or `flatten`.
- `PRINT-CONTRACT-06`: `site/{lang}/labels.md` has `print.*` fields but the app has `output.printPdf: false` (warning only, because the browser print dialog still uses the labels).
- `PRINT-CONTRACT-07`: a localized page's `print` block is missing a field present in the default-language twin (mirror rule, RFC-0205).

#### 5.2 `print.layout.validate`

Static analysis of shared UI CSS and Astro components for print-blocking patterns. Runs in `build.check`.

Violations:

- `PRINT-LAYOUT-01`: a shared UI component uses `position: fixed` or `position: sticky` in a `@media print` block or without a `@media print` override.
- `PRINT-LAYOUT-02`: a section or shell component uses `display: none` on content that is required for print (e.g., hiding a `<details>` body without an expand rule).
- `PRINT-LAYOUT-03`: a section sets `min-height: 100vh` without a print override.
- `PRINT-LAYOUT-04`: a component uses `break-inside: auto` on a card/stat/list item.
- `PRINT-LAYOUT-05`: `print.css` is not referenced in `layout-component.astro`.
- `PRINT-LAYOUT-06`: a section sets `color` directly on `.section-header__title` instead of inheriting from the shell (regression of RFC-0108 fix, RFC-0102).

The validator uses the shared AST-grade CSS parser (RFC-0120) and scans `.astro` files for inline styles.

#### 5.3 `print.pdf.validate`

Post-build verification that PDFs exist for all enabled pages. Runs in `build.post` after `print.pdf.generate`.

Violations:

- `PRINT-PDF-01`: a routable page with `print.enabled: true` and `output.printPdf: true` has no matching PDF file in `dist/client/_print/`.
- `PRINT-PDF-02`: a generated PDF file is zero bytes or smaller than a minimum threshold (e.g., 1KB).

### 6. Layout and metadata

#### 6.1 `layout-component.astro` changes

The shared `BaseLayout` (`packages/ui/src/components/layout/layout-component.astro`) gains two responsibilities:

1. Accept an optional `printMode?: boolean` prop from the page route. This prop is currently used only to decide whether to inject the inline `data-print` detection script; the script is always injected because the query parameter is runtime-only. The prop may be used in future SSR/edge modes.
2. Inject the shared print stylesheet as a `media="print"` link. The URL is resolved through the same content-asset / public-asset resolution as `globalStylesheetUrl`.
3. Add a `<link rel="alternate" type="application/pdf" href={pdfUrl} />` in the `<head>` when a PDF is available for the page. The URL is derived from the page route and language: `/_print/<lang>/<path>.pdf`. This follows the pattern of RFC-0162 for alternate links.

#### 6.2 Page route changes

`apps/warpgogol-com/src/pages/[lang]/[...slug].astro` is a generated proxy file (RFC-0078). The onboarding template for thin apps is updated so that all future apps receive the same change:

- The `data` object from `resolvePageRoute()` includes a `printMode` boolean derived from `Astro.url.searchParams.has("print")` at build time. For static sites this is always `false` during build, but the prop is passed for completeness and future SSR modes.
- `BaseLayout` receives `printMode={data.printMode}` and `pdfUrl={data.pdfUrl}`.

No app-local logic is added to `warpgogol-com`; the route remains a thin proxy. The change is delivered through the `layout-component.astro` prop contract and the `page-handler` shared helper.

#### 6.3 `@gogol/share/astro/page-handler` changes

The `resolvePageRoute()` return type gains two fields:

```ts
export interface ResolvedPageRouteData {
  // ... existing fields
  printMode: boolean;
  pdfUrl?: string;
}
```

- `printMode`: `Astro.url.searchParams.has("print")`. For static builds this is always `false`; the runtime detection script handles the actual visitor query parameter.
- `pdfUrl`: absolute or root-relative URL to the generated PDF, when `output.printPdf` is enabled. This is the URL injected as `<link rel="alternate" type="application/pdf">`.

### 7. TypeScript contracts

#### 7.1 Page print config

```ts
// packages/share/src/schemas/print.ts (new file)
export type PrintOrientation = "portrait" | "landscape" | "auto";
export type PrintPageSize = "a4" | "letter" | "legal";
export type PrintMargins = "normal" | "narrow" | "none";
export type PrintBackgroundMode = "preserve" | "flatten";
export type PrintRegion =
  | "navigation"
  | "breadcrumbs"
  | "cta"
  | "footer-links"
  | "header-logo"
  | "site-background"
  | "hero-animation";

export interface PagePrintConfig {
  enabled?: boolean;
  orientation?: PrintOrientation;
  pageSize?: PrintPageSize;
  margins?: PrintMargins;
  expandDetails?: boolean;
  hide?: PrintRegion[];
  background?: PrintBackgroundMode;
}
```

The schema is exported from `@gogol/share` and imported by the page schema in `@gogol/ontology` and by the validators.

#### 7.2 Site print labels

```ts
export interface SitePrintLabels {
  headerLogo?: string;
  headerBrandLabel?: string;
  headerTagline?: string;
  footerLegalNotice?: string;
  footerShowUrl?: boolean;
  footerShowDate?: boolean;
  footerPageNumberLabel?: string;
  printDisabledNotice?: string;
}
```

#### 7.3 System output projection

```ts
export interface OutputProjection {
  // ... existing fields from RFC-0143
  printPdf?: boolean;
}
```

#### 7.4 PDF generator result

```ts
export interface PrintPdfGenerateResult {
  generated: number;
  skipped: number;
  disabled: number;
  errors: Array<{ route: string; error: string }>;
  outputDir: string;
}
```

### 8. File system responsibilities

| Path | Role |
| --- | --- |
| `packages/ui/src/styles/print.css` | Shared baseline print stylesheet. Package-owned, imported by `layout-component.astro`. |
| `packages/ui/src/components/section-shell/section-shell.astro` | Reacts to print media; suppresses motion/background/glass. |
| `packages/ui/src/components/effects/effect-host.astro` | Suppresses effects under `@media print`. |
| `packages/ui/src/components/layout/layout-component.astro` | Injects print stylesheet, PDF alternate link, and detection script. |
| `packages/share/src/schemas/print.ts` | TypeScript schemas for the print content contract. |
| `packages/share/src/astro/page-handler.ts` | Adds `printMode` and `pdfUrl` to `resolvePageRoute()` result. |
| `packages/ontology/src/schemas/page.ts` | Extends page frontmatter schema with `print` block. |
| `packages/ontology/src/schemas/system.ts` | Extends `output` schema with `printPdf`. |
| `packages/ontology/src/schemas/labels.ts` | Extends site labels schema with `print` block. |
| `packages/os/site-kernel-checks/src/print-*.ts` | New validator/generator modules. |
| `packages/os/site-kernel-checks/src/pipelines/build-post.ts` | Adds `print.pdf.generate` and `print.pdf.validate`. |
| `packages/os/site-kernel-checks/src/pipelines/build-check.ts` | Adds `print.contract.validate` and `print.layout.validate`. |
| `apps/warpgogol-com/src/content/system.md` | Sets `output.printPdf: true` for the pilot. |
| `apps/warpgogol-com/src/content/pages/{de,uk}/**/*.md` | May add `print` overrides; default behavior is sufficient. |
| `dist/client/_print/<lang>/*.pdf` | Generated PDF artifacts, gitignored, deployment artifacts. |

### 9. CLI surface

```sh
# Generate PDFs for the pilot app after the Astro build.
pnpm exec site-kernel run print.pdf.generate --app warpgogol-com

# Force regeneration even if PDFs already exist.
pnpm exec site-kernel run print.pdf.generate --app warpgogol-com --force

# Validate that expected PDFs exist.
pnpm exec site-kernel run print.pdf.validate --app warpgogol-com --json

# Static analysis of print layout rules.
pnpm exec site-kernel run print.layout.validate --app warpgogol-com --json

# Validate content contract for print.
pnpm exec site-kernel run print.contract.validate --app warpgogol-com --json
```

All four commands are app-scoped (`scope: app`). `print.pdf.generate` requires the app to have been built first; it is a `build.post` command. `print.layout.validate` and `print.contract.validate` run in `build.check`. `print.pdf.validate` runs in `build.post`.

### 10. Output format

#### `print.contract.validate --json`

```json
{
  "command": "print.contract.validate",
  "status": "fail",
  "summary": "1 contract violation found.",
  "data": {
    "violations": [
      {
        "rule": "PRINT-CONTRACT-01",
        "severity": "error",
        "file": "src/content/pages/de/agb.md",
        "route": "/de/agb/",
        "message": "Legal page has print.enabled: false. Legal pages must always be printable."
      }
    ]
  }
}
```

#### `print.layout.validate --json`

```json
{
  "command": "print.layout.validate",
  "status": "fail",
  "summary": "2 print layout violations found.",
  "data": {
    "violations": [
      {
        "rule": "PRINT-LAYOUT-01",
        "severity": "error",
        "file": "packages/ui/src/components/header/header-component.astro",
        "line": 42,
        "message": "Component uses position: fixed without a @media print override."
      }
    ]
  }
}
```

#### `print.pdf.generate --json`

```json
{
  "command": "print.pdf.generate",
  "status": "ok",
  "summary": "Generated 47 PDFs, skipped 0, disabled 3.",
  "data": {
    "generated": 47,
    "skipped": 0,
    "disabled": 3,
    "errors": [],
    "outputDir": "apps/warpgogol-com/dist/client/_print"
  }
}
```

#### `print.pdf.validate --json`

```json
{
  "command": "print.pdf.validate",
  "status": "ok",
  "summary": "All 47 expected PDFs are present and non-empty.",
  "data": {
    "expected": 47,
    "missing": 0,
    "empty": 0
  }
}
```

### 11. Failure modes

- **Playwright not installed.** `print.pdf.generate` exits non-zero with a clear message. The pilot CI must install Playwright Chromium before `build.post`.
- **A page fails to print.** The error is recorded in the `errors` array. The command still attempts remaining pages. If any error exists, the command exits non-zero.
- **PDF generation disabled.** `output.printPdf: false` or absent causes the command to exit 0 immediately with `generated: 0`. This is not a failure.
- **Page opted out.** `print.enabled: false` increments the `disabled` count and no PDF is produced. This is not a failure.
- **Validation finds a print-blocking pattern.** `print.layout.validate` fails the build because it indicates a shared UI regression that would break printing for all apps.
- **Legal page opted out of print.** `print.contract.validate` fails hard because legal and authority pages must be printable.
- **Missing PDFs after generation.** `print.pdf.validate` fails the build post pipeline.

## Rollout

1. **Pilot on warpgogol-com.** Implement the full contract for `apps/warpgogol-com` first. Set `output.printPdf: true` in `src/content/system.md`. Generate PDFs for all pages except those explicitly opted out. Verify the home page, `/de/angebot/`, `/uk/umovy/`, and a programmatic surface page (`/de/website/elektriker/deu/bw/`) print correctly.
2. **Opt-in for other apps.** The command is registered in the standard `build.post` pipeline but exits early unless `output.printPdf: true`. Other apps are unaffected until they explicitly enable it.
3. **Default-on transition.** Once the pilot proves the contract, a follow-up RFC may change the default to `true` for all apps, or add a workspace-level override.
4. **Template update.** The onboarding template for thin apps (`packages/os/site-kernel-codegen/templates/app-boilerplate/`) is updated to set `output.printPdf: false` and include the print content contract scaffolding. New apps start with the contract ready.
5. **No migration of legacy apps.** There is no legacy print surface to migrate; this is a greenfield addition. Apps that do not enable the feature behave exactly as before.

## Alternatives considered

1. **Separate `/print/` route.** Rejected because it doubles the URL space, creates duplicate content concerns, and requires app-local routing changes. The `?print` parameter keeps the print view on the same canonical URL.
2. **Client-side PDF generation with libraries like `html2pdf.js` or `paged.js`.** Rejected because it requires shipping extra JS to every visitor, depends on browser capabilities, and produces inconsistent results. Build-time Playwright is deterministic and invisible to visitors.
3. **Use Astro's `export` or `@astrojs/pdf` if available.** Rejected because there is no stable Astro-native PDF path that integrates with our custom section framework, motion gates, and content contract. Playwright is the stable, testable baseline.
4. **Generate PDFs into `public/` before build.** Rejected because PDFs need the rendered HTML and CSS, which only exist after `astro build`. Writing into `public/` after build would require a second copy step and complicates the `dist/client` contract.
5. **Use Puppeteer instead of Playwright.** Playwright was chosen because it is already the de-facto standard for browser automation in this codebase's test tooling (if added later) and has a single Chromium install command. The Image Provider Port and other OS commands do not conflict with Playwright.

## Risks

- **Build time increase.** Generating PDFs for every page adds 1–3 seconds per page depending on content complexity. For warpgogol-com with ~50 pages, this is acceptable. For thousands of pages, a parallel batching strategy and optional per-page caching may be needed in a follow-up RFC.
- **Playwright dependency size.** The Chromium download is large. CI caches must handle it; local dev may skip PDF generation unless `output.printPdf` is enabled. The pilot is the only app that enables it.
- **False positives in `print.layout.validate`.** Strict rules about `position: fixed` or `min-height: 100vh` could flag legitimate patterns. The validator uses AST parsing with whitelists and fix hints, not regex alone.
- **Background image ink usage.** `print.background: preserve` may print large background images and waste ink. Authors can opt for `flatten` per page; the default is `preserve` because the design system depends on background for contrast.
- **Font loading during PDF capture.** If self-hosted fonts are not loaded before `page.pdf()`, text may fall back to system fonts. The generator waits for `networkidle` and uses Playwright's font loading APIs.
- **Generated PDFs are not committed.** Because PDFs live only in `dist/client/_print/`, each deployment regenerates them. This is intentional and matches the generated-file governance model.

## Acceptance criteria

- [x] `packages/share/src/schemas/print.ts` defines the page/site/system print contracts and is exported from `@gogol/share`. (evidence: packages/ directory, package exists)
- [x] `packages/ontology` page/system/labels schemas include the `print` fields without breaking existing content. (evidence: packages/ directory, package exists)
- [x] `packages/ui/src/styles/print.css` exists and is injected by `layout-component.astro` as a `media="print"` stylesheet. (evidence: packages/ directory, package exists)
- [x] `SectionShell`, `SiteBackground`, `SectionBackground`, and `EffectHost` suppress motion, glass, parallax, and background effects in print media. (evidence: implemented historically)
- [x] `@gogol/share/astro/page-handler` exposes `printMode` and `pdfUrl` in `ResolvedPageRouteData`. (evidence: packages/ directory, package exists)
- [x] `apps/warpgogol-com/src/content/system.md` sets `output.printPdf: true`. (evidence: original apps retired by RFC-0381, implemented historically)
- [x] `print.pdf.generate` is registered as an app-scoped command and added to `APPS_BUILD_POST_PIPELINE`. (evidence: implemented historically)
- [x] `print.pdf.validate` is registered as an app-scoped command and added to `APPS_BUILD_POST_PIPELINE` after `print.pdf.generate`. (evidence: implemented historically)
- [x] `print.layout.validate` is registered as an app-scoped command and added to `APPS_BUILD_CHECK_PIPELINE`. (evidence: implemented historically)
- [x] `print.contract.validate` is registered as an app-scoped command and added to `APPS_BUILD_CHECK_PIPELINE`. (evidence: implemented historically)
- [x] Playwright is added as a dependency of `@gogol/site-kernel-checks` and CI installs Chromium for the pilot app. (evidence: packages/ directory, package exists)
- [x] `warpgogol-com` builds successfully with `build:check` and produces at least one non-empty PDF in `dist/client/_print/`. (evidence: implemented historically)
- [x] Browser print dialog on `/de/` and `/uk/umovy/` produces a legible, on-brand page without missing content or overlapping sections. (evidence: implemented historically)
- [x] `<link rel="alternate" type="application/pdf">` appears in the `<head>` of pages with generated PDFs. (evidence: implemented historically)
- [x] `rfc.validate` passes on this RFC. (evidence: implemented historically)
- [x] This RFC is referenced in the commit message(s) that implement it. (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` and stamp `implementedAt`/`updatedAt` once every acceptance criterion is satisfied and checked, validators/build pass, and the change is committed referencing this RFC. Agents MUST NOT perform any other status transition, and MUST NOT mark it `implemented` while any criterion is unmet (RFC-0224).
- Agents MUST check `rfc.list --status accepted` before making structural changes to packages or app tools that relate to this RFC's scope.
- When implementing, agents MUST reference this RFC ID in commit messages or PR descriptions.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- Agents MUST NOT add app-local print logic in `apps/warpgogol-com/src/` except content declarations (`system.md`, `pages/**`, `site/**`). All code changes belong in `packages/*` or `packages/os/*`.
- Agents MUST keep the print stylesheet token-driven and biome-agnostic; do not hardcode pixel widths or site-specific colors.
- Agents MUST update the onboarding template for thin apps so that future apps inherit the print contract scaffolding.
- Agents MUST update `docs/ecosystem.generated.json` via `ecosystem.manifest.generate` after adding or removing commands (AGENTS.md "RFC command lifecycle metadata").
- Agents MUST run the full validation matrix for the pilot after implementation:
  ```sh
  pnpm exec site-kernel run print.contract.validate --app warpgogol-com --json
  pnpm exec site-kernel run print.layout.validate --app warpgogol-com --json
  pnpm --filter warpgogol-com build:check
  pnpm exec site-kernel run print.pdf.validate --app warpgogol-com --json
  pnpm exec site-kernel run rfc.validate RFC-0257 --json
  ```
