# Warpgogol Project Guide (for AI + contributors)

This document is the authoritative reference for project-specific conventions and invariants. It is written as a "map of the project": what calls what, where the risky parts are, and which invariants must not be broken.

The repository is a Turborepo monorepo. The reference Astro application lives in `apps/nicaragua-projekt`. Shared packages live in `packages/*`.

## Stack

- Astro 6 (static output)
- TypeScript (strict)
- Tailwind CSS
- React is used only for interactive/effects islands
- Package manager: pnpm (version must match `packageManager` field in `package.json`)
- Validation: Astro check + targeted maintenance scripts

## Project topology (mental model)

For route shell/content work, follow the scoped `AGENTS.md` files first, then read `.agents/rules/content-migration-strategy.md` for deeper migration context before coming back to this file for the broader project map.

### Content sources

- `apps/nicaragua-projekt/src/pages/*` are the route entrypoints (Astro pages + API routes).

### Programmatic SEO content (pSEO)

- Programmatic SEO landing pages are sourced from **Astro Content Collections** using the Content Layer API.
- Collections schemas live in: `apps/nicaragua-projekt/src/content/config.ts`.
- **Invariant:** do not source pSEO page content from `apps/nicaragua-projekt/src/content/*`.

#### Markdown parsing

- Use Astro Content Collections as the source of truth for project-owned Markdown content.
- For runtime rendering in pages, prefer `astro:content` (`getCollection`, entry `data`, entry `body`).
- Do not introduce `gray-matter` for project content parsing.

### Rendering model

- The site is primarily static (SSG).
- Non-default languages are not generated as separate SSR pages.

### Client-side code model

- Client-side logic lives in `apps/nicaragua-projekt/src/scripts/*`.
- Interactive islands are hydrated on demand.
- Long tasks are delayed via an idle scheduler to protect Core Web Vitals.

## Routing + localization (critical invariants)

### Language-prefixed routing

- The site uses language-prefixed routes: `/{lang}/...`.
- The default language (`defaultLanguageCode`, currently `de`) is served as the **source HTML**.

### Localization source of truth

Localized content comes from `apps/nicaragua-projekt/src/content/**`:

- block-declarative pages in `apps/nicaragua-projekt/src/content/pages/{lang}/...`
- long-form prose in `apps/nicaragua-projekt/src/content/prose/{lang}/...`
- business data in `apps/nicaragua-projekt/src/content/business/{lang}/...`
- navigation labels in `apps/nicaragua-projekt/src/content/navigation/{lang}/...`
- site shell labels in `apps/nicaragua-projekt/src/content/site/{lang}/...`

**Invariant:** Do not add new SSR pages for other languages unless you also update this pipeline.

### Where to change language configuration

- Supported languages: `src/content/system.md` (`i18n.supported`)
- Default language code: `src/content/system.md` (`i18n.default`)

### Localization content locations

- Route shell data: `apps/nicaragua-projekt/src/content/pages/{lang}/**`
- Prose content: `apps/nicaragua-projekt/src/content/prose/{lang}/**`
- Business data: `apps/nicaragua-projekt/src/content/business/{lang}/**`
- Navigation: `apps/nicaragua-projekt/src/content/navigation/{lang}/**`
- Site shell labels: `apps/nicaragua-projekt/src/content/site/{lang}/**`

**Invariant:** content-local assets (`assets/**` subdirectories) are owned by their parent content domain.

### Schema identity locations

- Canonical schemas live in `packages/share/schemas/`
- App-local overrides: `apps/nicaragua-projekt/src/content/schemas/navigation.ts`

**Invariant:** app-local schemas are thin overrides, not duplicated canonical contracts.

### Route shell path convention

- Entries in `apps/nicaragua-projekt/src/content/pages/{lang}/**` are frontmatter-only block-declarative pages.
- The single route `apps/nicaragua-projekt/src/pages/[lang]/[...slug].astro` renders all pages by resolving `pageId` via the route registry in `system.md`.
- **Invariant:** every page `.md` must declare `pageId` matching an entry in `src/content/system.md`.

### Schema path convention

- `packages/share/schemas/` owns canonical page, navigation, and site schemas.
- `apps/nicaragua-projekt/src/content/schemas/navigation.ts` defines app-specific navigation grouping.
- New imports should target shared schemas, not app-local duplicates.

## Middleware (global request flow)

### Entry

- Middleware entry: `apps/nicaragua-projekt/src/middleware.ts`

### Ordering (critical)

- `language-redirect` runs first.
- Static asset passthrough runs after language normalization.

### Language redirect behavior

- Implemented in `apps/nicaragua-projekt/src/middleware/language-redirect.ts`.
- It decides whether to redirect to `/{detectedLang}/...` based on:
  - URL pathname (skip static assets and API routes)
  - first path segment (supported language code or not)
  - `Accept-Language` header
  - trailing slash normalization for static output

**Invariant:** Preserve querystring and do not redirect static assets.

## Hydration / Effects (read before changing)

Interactive effects are intentionally delayed and hydrated on demand.

### Orchestrator

- Entry: `apps/nicaragua-projekt/src/scripts/layout-orchestrator.ts`
- It is a thin entrypoint that wires modules.

### On-demand design rules

- Prefer **static HTML** and **minimal client JS**.
- Hydrate React islands only when needed using:
  - `IntersectionObserver`
  - explicit delays (`setTimeout`) for heavy work
  - idle scheduling (`scheduleTask`)

**Invariant:** Do not import heavy dependencies (Three.js, R3F) from `.astro` files or global utilities.

## Visual depth effects ("Volume Edge")

The project uses a tokenized CSS-only depth pattern ("Volume Edge") for sharp layer separation and elevated media.

- **Invariant:** implement depth with **CSS tokens** from `apps/nicaragua-projekt/src/styles/global.css` (no new hardcoded `rgba(...)` / numbers).
- **Invariant:** prefer `filter: drop-shadow(...)` on the **clipped shape element** (the layer that uses `clip-path`).
- **Invariant:** for images/canvases apply the effect to the **container**, with an inset highlight overlay.
- **Invariant:** do not add client JS for this effect.

## Design tokens (ultra-strict)

**Invariant:** only CSS custom properties with the `--ds-` prefix are allowed across the codebase.

- Validate: `pnpm tokens:ds:lint`

## Styling architecture

- **Rule:** CSS lives in `apps/nicaragua-projekt/src/styles/**`.
- **Rule:** prefer page-level stylesheets in `apps/nicaragua-projekt/src/styles/pages/*.css` imported from the corresponding `.astro` page (e.g. `import "@styles/pages/foo.css"`).
- **Discouraged:** inline `<style>` blocks inside `.astro` files (use only for exceptional one-off experiments, then move to `apps/nicaragua-projekt/src/styles`).

### Data-attribute contracts

Client modules rely on stable `data-*` contracts. Changes to these are high-risk.

- On-demand hosts use `data-*-on-demand`.
- Each module sets a `data-...Mounted = "1"` flag to guarantee idempotent hydration.

When adding new effects, follow existing patterns and keep contracts stable.

## Content-driven visibility (RFC-0047)

- There is no centralized feature flag file. Visibility is derived from the content layer:
  - page existence in `system.md`
  - block presence in page frontmatter
  - `header.navIds` / `footer.navIds` in `site/{lang}/labels.md`

### SEO + section visibility (sitemap / navigation)

- Pages absent from `system.md` or missing from navigation targets are excluded from discovery.
- Semantic outputs must hide pages or sections whose blocks are not present in the current content.

## "Stable boundaries" (module responsibility rules)

### Inline AI Invariants (Internal AI Context)

To ensure critical rules are never missed during deep refactoring, use the `// @ai-invariant: [rule]` pattern at the top of high-risk files.

- **Why**: Project-wide rules are great, but AI context windows can drop them. Putting invariants directly in the source file guarantees the AI reads them alongside the code.
- **Where**: Use in middleware, scroll orchestrators, and complex data transformers.
- **Example**: `// @ai-invariant: This middleware runs on every request. No heavy imports or synchronous blocking regex allowed.`

A boundary is a place where changing behavior has a large blast radius:

- Middleware
- localization data flow
- Content collections and page-data infrastructure
- `apps/nicaragua-projekt/src/scripts/layout-orchestrator.ts` orchestrator module
- Global layouts

### Rules

- Keep each module focused on one concern.
- Prefer pure functions for logic that can be tested (e.g. middleware decision logic).
- Expose small `init*()` entrypoints for client modules.
- Avoid circular dependencies.

## Safe edit zones

### Good candidates for automated refactors

- `apps/nicaragua-projekt/src/content/pages/{lang}/` (block props)
- `apps/nicaragua-projekt/src/content/prose/{lang}/`
- `apps/nicaragua-projekt/src/content/site/{lang}/`
- `apps/nicaragua-projekt/src/utils/*`
- `apps/nicaragua-projekt/src/scripts/layout-orchestrator.ts` (modules are isolated and testable)

### High-risk areas (change carefully)

- `apps/nicaragua-projekt/src/middleware/language-redirect.ts` (affects global routing)
- Content collections and page-data infrastructure
- `apps/nicaragua-projekt/src/scripts/layout-orchestrator.ts` (UX-critical scroll/navigation state)
- `apps/nicaragua-projekt/src/pages/[lang]/[...slug].astro` (universal route)

## Repository boundaries

- Treat `spec/**` as read-only reference material.
- Treat `todo/**` as planning-only reference material.
- Do not create, edit, move, or delete files in `spec/**`.
- Do not use `spec/**` or `todo/**` as implementation guidance when the same rule already exists in `AGENTS.md` or `.agents/rules/**`.
- Ignore generated icon trees during normal source exploration unless the task explicitly targets icon generation or icon imports.
- If a spec is outdated, update implementation docs or project rules instead of changing the spec files.

## Security / secrets

- Do not hardcode or duplicate secrets in source files.
- Avoid adding logs that print full tokens/keys.

## Contributor workflow (short)

- Local dev: `pnpm --filter nicaragua-projekt start`
- Full dev (generates types + icons): `pnpm dev`
- Typecheck: `pnpm --filter nicaragua-projekt -s astro check`
- Tests: `pnpm --filter nicaragua-projekt test` (required for utility/logic changes)
- Token checks: `pnpm --filter nicaragua-projekt -s tokens:ds:lint`
- Content surface validation: `pnpm exec werkstatt run content.surface.validate --site nicaragua-projekt`

**CI/CD invariant:** All deployments require `pnpm --filter nicaragua-projekt -s astro check` to pass. Type errors in `.astro` components must not reach production.
