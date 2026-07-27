# FILE CONTRACTS — reference project tree

> Annotated file structure for the current repository as a reference implementation. The exact filenames may change in another project, but the responsibility boundaries should remain recognizable.

```txt
project/
├── astro.config.mjs
├── package.json
├── tsconfig.json
├── public/
│   ├── favicon.svg
│   └── ...
├── scripts/
│   ├── check/
│   │   ├── validate-semantic-drift.ts
│   │   ├── validate-page-content.ts
│   │   └── ...
│   └── service/
│       ├── generate-icons.ts
│       ├── clean-icons.ts
│       ├── generate-open-source-md.ts
│       └── ...
└── src/
    ├── content/
    │   ├── system.md
    │   ├── pages/
    │   │   └── {lang}/
    │   ├── prose/
    │   │   └── {lang}/
    │   ├── business/
    │   │   └── {lang}/
    │   ├── navigation/
    │   │   └── {lang}/
    │   ├── site/
    │   │   └── {lang}/
    │   ├── loaders/
    │   └── schemas/
    │       └── navigation.ts
    ├── pages/
    │   ├── [lang]/
    │   │   └── [...slug].astro
    │   ├── index.astro
    │   ├── llms.txt.ts
    │   └── llms-full.txt.ts
    ├── layouts/
    │   └── layout.astro
    ├── middleware/
    │   └── ...
    ├── middleware.ts
    ├── semantic/
    │   ├── ids.ts
    │   ├── models.ts
    │   ├── extract.ts
    │   ├── site-profile.ts
    │   ├── pages.ts
    │   ├── jsonld/
    │   └── llms.ts
    ├── styles/
    │   ├── global.css
    │   ├── components/
    │   └── pages/
    └── utils/
        ├── localization.ts
        └── component-content.ts
```

---

## Directory contracts

## Root project files

- `astro.config.mjs`
  - owns framework-level build/output integration
  - must not become a substitute for application architecture

- `package.json`
  - owns dependencies and named script entrypoints
  - must expose service/check scripts cleanly

- `tsconfig.json`
  - owns TypeScript strictness and path alias policy

## `scripts/`

- `scripts/check/`
  - owns validation, lint-style architecture checks, and drift detection
  - must not contain content generation logic

- `scripts/service/`
  - owns generation, cleanup, or filesystem-oriented operational tasks
  - must not become the home of architecture validation logic

## `src/content/`

- `system.md`
  - single canonical manifest: pages, routes, planets, growth, passport, i18n
  - validated by `system.manifest.validate`

- `pages/{lang}/\*\*
  - frontmatter-only block-declarative pages (`kind: page`, `pageId`, `blocks[].type`)

- `prose/{lang}/\*\*
  - long-form prose with default-language fallback (RFC-0008)

- `business/{lang}/\*\*
  - business data consumed by `@gogol/business`

- `navigation/{lang}/\*\*
  - navigation labels, order, groups, semantic targets (not route slugs)

- `site/{lang}/\*\*
  - shell UI labels (`labels.md`), layout settings (`layout.md`), owned assets

- `schemas/`
  - minimal app-local schema overrides; canonical schemas live in `packages/share/schemas/`

- `loaders/`
  - content loading helpers or collection-specific loading logic

## Content-local assets (RFC-0031 / RFC-0047)

- `src/content/**/assets/**`
  - optimized visitor-facing media colocated with owning content domain
  - processed by Astro's asset pipeline
  - preferred over `src/assets/images/` or parallel asset trees

- `public/`
  - fixed-path unoptimized exceptions only: well-known files, robots/sitemap, vendor verification files, icon files served as-is

## `src/pages/`

- `[lang]/[...slug].astro`
  - one thin route renders ALL block-declarative pages
  - resolves content by `pageId` via the route registry in `system.md`

- `index.astro`
  - client-side language redirect to `/<defaultLang>/`

- `llms.txt.ts`, `llms-full.txt.ts`
  - thin machine-readable delivery endpoints
  - must consume the semantic layer rather than invent meaning locally

## `src/layouts/`

- `layout.astro`
  - shared document shell
  - owns base stylesheet linking, metadata delivery, and slot boundaries
  - must stay thin relative to content and semantic business rules

## `src/middleware.ts` and `src/middleware/`

- own request-time infrastructure such as language entry handling and redirect sequencing
- must stay lightweight and ordered intentionally

## `src/pages/`

- `[lang]/`
  - visitor-facing content routes
  - own orchestration, not canonical copy or component-local detail

- `llms.txt.ts`, `llms-full.txt.ts`
  - thin machine-readable delivery endpoints
  - must consume the semantic layer rather than invent meaning locally

## `src/semantic/`

- `models.ts`
  - portable semantic contracts

- `ids.ts`
  - stable semantic entity IDs and canonical URL helpers

- `extract.ts`, `site-profile.ts`
  - cross-page fact normalization and extraction helpers

- `pages.ts`
  - page/site semantic composition

- `jsonld.ts` and `jsonld/`
  - projection builders for structured data outputs

- `llms.ts`
  - projection builders for LLM-facing text exports

## `src/styles/`

- `global.css`
  - global token definitions and shared base classes

- `components/`
  - component-level stylesheets imported by components

- `pages/`
  - page-level stylesheets imported by routes

## `src/utils/`

- `component-content.ts`
  - legacy API name preserved for compatibility; sources shell/site data from `site/{lang}/labels.md` and `layout.md`
  - architectural utility, not a dumping ground for unrelated helpers

---

## What is DNA vs what is example

DNA:

- the separation between routes, content, styles, and semantic builders
- the single canonical manifest in `src/content/system.md`
- semantic content domains (`pages/`, `prose/`, `business/`, `navigation/`, `site/`)
- the existence of thin delivery points for machine-readable outputs
- the distinction between service scripts and validation scripts

Examples:

- the current concrete page set
- the current concrete section set
- the current brand assets and icon sets
- the current optional generated open-source page pattern

If a future project keeps the same boundaries but renames or replaces many files, the DNA still survives.
