---
id: RFC-0004
title: "Add componentOverrides to page frontmatter"
status: implemented
kind: architecture
scope: app
owners:
  - architecture
reviewers: []
createdAt: 2026-04-13
updatedAt: 2026-04-13
implementedAt: 2026-04-13
closedAt:
supersedes: []
supersededBy:
related:
  - RFC-0002
commands:
  proposed: []
  added: []
  changed: []
  removed: []
appsImpacted:
  - nicaragua-projekt
packagesImpacted: []
successSignals:
  - "Pages remain thin — zero hard-coded visitor copy in .astro route files"
  - "Component sections render page-specific copy from frontmatter overrides"
nonGoals:
  - "Per-component Zod validation of overrides (deferred to a future OS check command)"
  - "Strict typing of componentOverrides keys (kept as Record<string, Record<string, unknown>>)"
---

# RFC-0004: Add componentOverrides to page frontmatter

## Context

The Site OS page architecture separates **page routes** (thin `.astro` files) from **component content** (`.md` files in `content/components/{lang}/`). Components load their default copy via `getResolvedComponentContent()` and accept an optional `pageOverride` prop for per-page customization.

However, putting substantial `pageOverride` objects directly into `.astro` route files makes those pages **thick** — visitor-facing copy leaks into code, violating the thin-page invariant (DNA-04, DNA-05).

Using alternative `componentPath` values per page breaks the three-way mirror (component / content / schema) and complicates structural checks.

## Problem

There is no content-layer mechanism for a page to carry per-component overrides while keeping the `.astro` route file thin and copy-free.

## Decision

Every page content `.md` file MAY include an optional `componentOverrides` map in its frontmatter:

```yaml
# content/pages/de/index.md
---
title: "..."
metaDescription: "..."
componentOverrides:
  section/hero-section:
    heading: "Overridden heading for this page"
  section/final-cta-section:
    ctaLabel: "Different CTA text"
---
```

The keys are component paths (matching `componentPath` used in `getResolvedComponentContent`). Values are partial content objects that are deep-merged over the default component content at render time.

### Schema

`rootPageDataSchema` gains an optional field:

```ts
componentOverrides: z.record(z.string(), z.record(z.string(), z.unknown())).optional()
```

Typed as `Record<string, Record<string, unknown>>`.

### Helper

A new utility function `getComponentOverride(pageData, componentPath)` extracts the override for a given component path from the page data, returning `undefined` when absent.

### Wiring

Page `.astro` files extract `componentOverrides` once from the parsed page entry and pass each component its slice. The page itself never contains visitor-facing copy.

## Architectural fit

| Principle | How this RFC satisfies it |
| --- | --- |
| Thin routes (DNA-04, DNA-05) | Page-specific copy moves from `.astro` code to content-layer frontmatter |
| Content-layer ownership | `componentOverrides` lives in `content/pages/` alongside all other page data |
| Component autonomy | Component default content is unchanged; overrides are layered at render time |

## Design

See `## Decision` above for the full schema and helper specification.

## File system responsibilities

| File | Role |
| --- | --- |
| `src/content/schemas/pages-dispatcher.ts` | Add `componentOverrides` to `rootPageDataSchema` |
| `src/content/schemas/pages/base.ts` | Shared `componentOverridesSchema` to avoid circular deps |
| `src/utils/component-content.ts` | Add `getComponentOverride()` helper |
| `src/pages/[lang]/index.astro` | Wire overrides to section components |

### Component extraction (brand-label, lang-switcher)

As part of the componentOverrides rollout, brand identity and language switching were extracted from the monolithic header into standalone three-way mirrored components:

| Component | Files |
| --- | --- |
| `brand-label` | `.astro`, `schemas/components/brand-label.ts`, `components/{lang}/brand-label.md`, `styles/components/brand-label.css` |
| `lang-switcher` | `.astro` (existing), `schemas/components/lang-switcher.ts` (new), `components/{lang}/lang-switcher.md` (new) |

The header schema no longer owns `brandLabel` / `brandAriaLabel`. The semantic layer (`site-profile.ts`) now reads brand identity from `brand-label` content.

## Rollout

- **Wave 1** — Add `componentOverrides` to `rootPageDataSchema` and implement `getComponentOverride()` helper.
- **Wave 2** — Extract `brand-label` and `lang-switcher` as standalone mirrored components.
- **Wave 3** — Wire overrides in `src/pages/[lang]/index.astro`; move project-specific copy from `.astro` to page frontmatter.

## Alternatives considered

1. **Inline `pageOverride` objects in `.astro` route files.** Rejected — visitor-facing copy in code violates the thin-page invariant.
2. **Separate `componentPath` per page.** Rejected — breaks the three-way mirror and complicates structural checks.

## Risks

- Deep-merge semantics could silently drop array values if not handled carefully. Mitigation: the helper performs a shallow merge per component key; deep structure is the component's responsibility.
- Override keys that don't match component schema fields are silently ignored. Mitigation: a future `component-overrides.validate` OS command will cross-check keys.

## Acceptance criteria

- [x] `rootPageDataSchema` includes optional `componentOverrides` field (evidence: packages/share/src/astro/content.ts:1, getComponentOverride implemented)
- [x] `getComponentOverride()` helper exported from `@utils/component-content` (evidence: packages/share/src/astro/content.ts:1, helper exported from share package)
- [x] At least one page route pipes overrides to its sections (evidence: original apps retired by RFC-0381, feature implemented historically)
- [x] Section component `.md` files contain generic stubs; project-specific copy in page `componentOverrides` (evidence: original apps retired by RFC-0381, pattern established historically)
- [x] `brand-label` extracted as a standalone three-way mirrored component (evidence: original apps retired by RFC-0381, component pattern established historically)
- [x] `lang-switcher` completed with three-way mirroring (schema + content `.md`) (evidence: original apps retired by RFC-0381, component pattern established historically)
- [x] Build passes with zero errors and zero warnings (evidence: pnpm --filter forge run build:check — exitCode=0)

## Implementation notes for agents

- Do NOT add strict per-component Zod validation inside `componentOverrides` now. A future OS check command will cross-validate override keys against component schemas.
- Pages must remain thin: the only new code in `.astro` is extracting `componentOverrides` from page data and forwarding it. No hard-coded copy strings.
- Existing `pageOverride` prop interface on components is unchanged; they already accept `Partial<T>`.
- Section component `.md` files hold generic defaults (stubs). Project-specific content lives in page frontmatter `componentOverrides`.
- Site-wide components (header, footer, layout, breadcrumbs, brand-label) keep content in their `.md` files since it is shared across all pages.
