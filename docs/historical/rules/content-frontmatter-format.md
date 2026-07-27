# Frontmatter-Only Content Format

This rule defines the required file format for all project-owned content stored in `src/content/**`.

In the current Turborepo layout, these `src/content/**` references resolve to `apps/nicaragua-projekt/src/content/**`.

## Core rule

**Do not store project content in `.json` files inside `src/content/**`.\*\*

Use **Markdown files with frontmatter** instead.

Allowed format:

- `.md` with YAML frontmatter
- optional Markdown body when the entry needs long-form content

Disallowed format inside `src/content/**`:

- `.json`
- ad-hoc data blobs that bypass Astro's content conventions

## Why this rule exists

This project uses Astro Content Collections as the source of truth.

Frontmatter-based Markdown is preferred because it:

- matches Astro's standard content model
- keeps content readable in the IDE and Git diffs
- avoids parallel JSON-only content conventions
- makes migration paths consistent across pages, component copy, and collections
- works naturally with `getEntry()` / `getCollection()`

## Required format by content type

### Site shell labels

Store shared UI copy in:

- `src/content/site/{lang}/labels.md`

Rules:

- each file must be a Markdown file with YAML frontmatter
- use frontmatter only; no body
- do not create `.json` files for labels, CTA text, or reusable UI text

### Route/page shell content

Store route shell copy in:

- `src/content/pages/{lang}/**/*.md`

Rules:

- use `.md`
- **frontmatter only** — never add a markdown body
- page blocks use `type: <archetype>` (not `use: PlanetName` per RFC-0047)
- every page entry must declare `pageId` matching `system.md`

### Prose content

Store long-form prose in:

- `src/content/prose/{lang}/**/*.md`

Rules:

- use `.md`
- keep structured fields in frontmatter
- markdown body carries the actual prose
- referenced from page blocks via `type: markdown, props: { contentRef: "prose/<slug>" }`
- missing language entries fall back to the default language (RFC-0008)

## Frontmatter conventions

When creating entries in `src/content/**`:

- prefer YAML frontmatter, not JSON syntax files
- keep keys descriptive and stable
- keep nesting practical and component-oriented
- use arrays/objects only where they improve maintainability
- keep optional fields explicit in the collection schema when schemas exist

## Body usage

Use **frontmatter only** when:

- the entry is purely structured data
- the content is labels, config-like copy, CTA text, metadata, or small repeated blocks

Use **frontmatter + Markdown body** when:

- the entry contains long-form page text
- the page needs authored prose, sections, or legal/article-style body content

## Migration rules

When you find a `.json` file inside `src/content/**`:

1. create an equivalent `.md` entry in the same logical location
2. move the structured data into YAML frontmatter
3. update the collection loader or consumers if they filter by extension
4. validate with `pnpm --filter nicaragua-projekt -s astro check`
5. remove the old `.json` file after validation

## Collection-loader implications

If a collection currently reads `.json` entries from `src/content/**`:

- update it to read Markdown entries instead
- keep generated IDs stable
- avoid changing consumer-facing collection IDs unless required

## Explicit project convention

For this project, the following is the required convention:

- `src/content/**` uses Markdown entries
- `src/content/pages/{lang}/**` uses frontmatter-only Markdown (no body)
- `src/content/prose/{lang}/**` uses frontmatter + Markdown body
- `src/content/site/{lang}/labels.md` uses frontmatter-only Markdown for shell UI copy
- new `.json` files must not be added under `src/content/**`

## Validation checklist

Before finishing content-format work:

- [ ] No hardcoded visitor-facing strings remain in routes or components
- [ ] `src/content/components/` was not recreated
- [ ] `getEntry()` / `getCollection()` consumers still resolve the same IDs
- [ ] `pnpm --filter nicaragua-projekt -s astro check` passes
