# Content Migration Strategy

This document defines the **current and authoritative** approach for organizing content in the webgogol-3 project.

In the current Turborepo layout, these `src/**` and `public/**` references resolve to the reference app under `apps/nicaragua-projekt` unless noted otherwise.

## Core principle

**Use standard Astro folder conventions** instead of custom `src/data` structures.

All content should migrate to:

- `src/content/**` — Astro Content Collections (typed, validated)
- `src/assets/**` — Static assets managed by Astro's asset pipeline
- `public/**` — Static files served as-is (no processing)

## Why this approach

The previous `src/data` approach created a parallel content system that:

- required custom loaders and helpers
- duplicated Astro's built-in content layer features
- made type generation more complex
- diverged from standard Astro conventions

The **standard Astro approach** provides:

- built-in type safety via `astro:content`
- automatic content validation with Zod schemas
- first-class support for markdown/MDX
- simpler mental model for contributors
- better IDE support and autocomplete

## Migration targets

### Semantic Content Domains → `src/content/**`

All typed, validated content belongs in Astro Content Collections organized by semantic domain.

**Domains:**

- Pages: `src/content/pages/{lang}/**/*.md` — frontmatter-only block-declarative pages
- Prose: `src/content/prose/{lang}/**/*.md` — long-form prose with markdown body
- Business: `src/content/business/{lang}/**/*.md` — business data for `@gogol/business`
- Navigation: `src/content/navigation/{lang}/**/*.md` — navigation labels and targets
- Site: `src/content/site/{lang}/**/*.md` — shell UI labels and layout settings

**Collection registration:**

- Define collections in `src/content/config.ts`
- Use `getEntry()` or `getCollection()` in pages

**Schema definition:**

- Canonical schemas live in `packages/share/schemas/`
- App-local overrides are thin proxies in `src/content/schemas/`

### Content-local assets → `src/content/**/assets/**`

Optimized visitor-facing media colocated with the owning content domain.

**Examples:**

- Page assets: `src/content/pages/{lang}/assets/**/*.{webp,png,jpg}`
- Prose assets: `src/content/prose/{lang}/assets/**/*.{webp,png,jpg}`
- Site assets: `src/content/site/{lang}/assets/**/*.{webp,png,jpg}`

**Usage:**

```astro
import image from "~/content/pages/de/assets/example.webp";
<img src={image.src} alt="..." />
```

**Forbidden:** `src/content/media/` is rejected by `content.surface.validate`.

### Public static files → `public/**`

Files that should be served as-is without processing.

**Examples:**

- Favicons: `public/favicon.ico`
- Robots: `public/robots.txt`
- Static redirects: `public/_redirects`
- AI context: `public/ai.txt`

**Usage:**

```html
<link rel="icon" href="/favicon.ico" />
```

## Components and pages remain thin

### Route pages

Route pages in `src/pages/[lang]/[...slug].astro` should:

- load page content via `buildPage(entry.data, ctx)`
- render blocks through `BlocksRenderer`
- resolve routes via the `system.md` registry
- **not** contain large blocks of inline content

### Components

Components in `packages/ui/src/` should:

- receive visitor-facing copy as props from page blocks
- **not** hardcode UI strings, labels, or aria-labels
- load business data from `@gogol/business` when needed

## Schema convention

### Page schemas

Canonical page, navigation, and site schemas live in `packages/share/schemas/`. App-local files are thin overrides or proxies.

- `src/content/schemas/navigation.ts` — app-specific navigation grouping
- `src/content/schemas/entity-id.ts` — proxy for `@gogol/share/content`
- `src/content/schemas/pages/base.ts` — proxy for `@gogol/share/schemas`

### Component copy

**Retired pattern:** Component content mirroring through `src/content/components/` was removed per RFC-0047. Visitor-facing copy now lives in:

- page block `props` for project-specific section content
- `src/content/site/{lang}/labels.md` for shared shell labels
- `src/content/business/{lang}/` for business data

Do not recreate `src/content/components/` or `src/content/schemas/components/`.

## Migration workflow

When migrating legacy content:

1. **Identify the content type**
   - Is it typed/validated content? → `src/content/**`
   - Is it a processed asset? → `src/assets/**`
   - Is it a static file? → `public/**`

2. **Create the collection (if needed)**
   - Define schema in `src/content/config.ts`
   - Canonical schemas come from `packages/share/schemas/`
   - Run `pnpm --filter nicaragua-projekt -s astro sync` to generate types

3. **Migrate the content files**
   - Move markdown/data to the new location
   - Ensure frontmatter matches the schema
   - Update any dynamic generators (scripts)

4. **Update route pages**
   - Replace legacy imports with `buildPage()` + `BlocksRenderer`
   - Remove custom helper dependencies where possible
   - Add null checks and error handling

5. **Validate**
   - Run `pnpm --filter nicaragua-projekt -s astro check`
   - Run `pnpm exec site-kernel run content.surface.validate --site nicaragua-projekt`
   - Test affected routes locally

6. **Clean up (separate step)**
   - After validation, remove old files (including `src/content/components/` and `src/content/schemas/components/`)
   - Update any remaining references
   - Document breaking changes if needed

## Retired patterns

The following patterns have been removed and must not be restored:

- `src/content/components/` — component content mirroring retired (RFC-0047)
- `src/content/schemas/components/` — component schema mirroring retired (RFC-0047)
- `src/content/features/` — feature graph retired (RFC-0047)
- `src/configure/features.ts` — centralized feature flags retired (RFC-0047)
- `src/configure/navigation.ts` — href resolution now uses `system.md` route registry (RFC-0048)
- `src/data/**` — old data approach retired

Keep all new project-owned content in `src/content/**` or `public/**`.

## Example: Legal pages migration

**Before (old approach):**

```
src/content/components/de/impressum.md   ← component copy mirroring
src/content/pages/de/impressum.md        ← frontmatter only, no body
src/pages/[lang]/impressum.astro         ← separate route file
```

**After (RFC-0047):**

```
src/content/pages/de/impressum.md        ← frontmatter-only blocks[]
src/content/prose/de/impressum.md        ← markdown body + frontmatter
src/content/system.md                    ← pageId + routes + planets
src/pages/[lang]/[...slug].astro         ← universal route resolves by pageId
```

**Benefits:**

- Prose lives in `prose/{lang}/` with language fallback
- Pages are block-declarative (no body)
- Single route renders all pages via `system.md` registry
- No per-page `.astro` files needed

## Dynamic content generation

Scripts that generate content (e.g., `scripts/generate-open-source-md.ts`) should:

- Write to the correct content domain under `src/content/**`
- Include proper frontmatter matching the collection schema
- Run before `astro sync` / `astro build`

## Content-local asset convention

Assets belonging to a specific content domain are stored in `assets/` subdirectories:

- Page assets: `src/content/pages/{lang}/assets/**`
- Prose assets: `src/content/prose/{lang}/assets/**`
- Site assets: `src/content/site/{lang}/assets/**`
- Business assets: `src/content/business/{lang}/assets/**`

`public/` is reserved for fixed-path unoptimized exceptions only.

## High-risk boundaries

When migrating content, be careful with:

- `src/content/system.md` — route registry and page identity
- `src/content/config.ts` — collection registration
- `src/middleware/**` — routing and localization logic
- `src/pages/[lang]/[...slug].astro` — universal route

## Validation checklist

Before completing a content migration:

- [ ] Content is in the correct semantic domain (`pages/`, `prose/`, `business/`, `navigation/`, `site/`)
- [ ] `src/content/components/` was not recreated
- [ ] `src/content/schemas/components/` was not recreated
- [ ] No hardcoded visitor-facing strings remain in routes or components
- [ ] `pnpm --filter nicaragua-projekt -s astro sync` runs successfully
- [ ] `pnpm --filter nicaragua-projekt -s astro check` passes
- [ ] Route pages use `buildPage()` + `BlocksRenderer`
- [ ] `pnpm exec site-kernel run content.surface.validate --site nicaragua-projekt` passes
- [ ] Local testing confirms routes work
- [ ] Legacy files are removed (separate step)

## Related rules

- `project-guide.md` — overall project architecture
- `typescript.md` — TypeScript conventions
- `data-pages.md` — short historical note for obsolete references only
