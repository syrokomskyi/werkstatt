# AGENT RULES — reference implementation workflows

> Operational rules for AI agents working in this architecture. Use these workflows to make changes without drifting from the DNA.

---

## Before you change anything

1. Identify the ownership boundary first.
   - page problem -> route + page content + `system.md` entry + semantic layer
   - reusable UI problem -> component in `packages/ui/` + manifest + `PLANET_IMPORT_PATHS`/`MOON_IMPORT_PATHS` registration
   - link visibility problem -> `site/{lang}/labels.md` + `navigation/{lang}/navigation.md`
   - machine-readable output problem -> semantic layer + thin delivery points

2. Confirm the source of truth.
   - visitor-facing copy -> `src/content/`
   - canonical routes -> `src/content/system.md`
   - navigation labels -> `src/content/site/{lang}/labels.md` and `src/content/navigation/{lang}/navigation.md`
   - semantic projections -> `src/semantic/`
   - styles -> `src/styles/`

3. Prefer extending an existing pattern over inventing a new one.

---

## How to add a new page

## 1. Create the route file

Canonical location in this project:

```txt
src/pages/[lang]/my-new-page.astro
```

The route must:

- export `getStaticPaths()` consistent with the project generation strategy
- extract and guard `lang`
- import `Layout`
- stay thin

In this project, visitor-facing routes generate only `defaultLanguageCode` at build time.

## 2. Create the page schema

Canonical location:

```txt
src/content/schemas/pages/my-new-page.ts
```

The schema file must:

- define a Zod schema
- export a TypeScript type
- mirror the page content path

## 3. Create the page content entry

Canonical location:

```txt
src/content/pages/de/my-new-page.md
```

Rules:

- use Markdown with YAML frontmatter
- keep page-shell copy canonical here
- do not use `.json` inside `src/content/`

## 4. Register the page in `system.md`

Add a `pages[]` entry in `src/content/system.md` with:

- `pageId`: stable cross-language identifier
- `routes`: language-keyed public slugs (`de: "..."`, `en: "..."`)
- `cosmicStar`: page-level star catalog entry
- `planets[]`: pinned section components used by this page
- `shell` (if needed): background, overlay, or layout overrides

## 5. Compose blocks in reading order

The route must:

- load page content via `buildPage(entry.data, ctx)`
- pass `lang` through the context
- render blocks through `BlocksRenderer`

The route must not:

- inline visitor-facing labels
- hand-assemble block components
- construct raw navigation registries locally
- bury shared logic that belongs in helpers

## 7. Register semantic meaning

If the page participates in JSON-LD, breadcrumbs, or `llms` outputs, wire it through the semantic layer rather than generating semantic fragments inline.

---

## How to add a new section component

## 1. Create the section component

Canonical location:

```txt
packages/ui/src/sections/my-section-section/
```

Every section lives in its own workspace folder with:

- `manifest.yaml` — `cosmicName` (PlanetCatalog name), `propsSchema`, slot contract
- `MySection.astro` — render component
- `index.ts` — public export barrel

## 2. Register the cosmic name

- Pick a free name from `PlanetCatalog` in `@gogol/ontology`
- Set `cosmicName: <Name>` in `manifest.yaml`
- Register in `PLANET_IMPORT_PATHS` in `packages/share/src/page.ts`
- Pin in `src/content/system.md pages[pageId].planets[]` of every app that uses it

## 3. Create the stylesheet

If the section needs app-specific styling:

```txt
src/styles/sections/my-section.css
```

Rules:

- use only `--ds-*` tokens
- keep all section styling in `src/styles/`
- do not use inline `<style>` or inline `style="..."`
- preserve horizontal gutters and vertical section spacing

## 4. Use the section in a page

Add a block in `src/content/pages/{lang}/<slug>.md`:

```yaml
blocks:
  - id: my-section
    type: my-section
    props:
      heading: "..."
```

Ensure the corresponding `cosmicPlanet` is pinned in `system.md pages[pageId].planets[]`.

---

## How to add a reusable non-section component

Reusable UI components live in `packages/ui/src/components/`. If the component owns visitor-facing copy, the copy is passed as props from the page block or sourced from `src/content/site/{lang}/` or `src/content/business/{lang}/`.

Purely structural components (no visitor-facing copy) need only the component file and optional stylesheet in `src/styles/components/`.

Do not create `src/content/components/` entries; that directory was removed per RFC-0047.

---

## How to add or change navigation

## 1. Put labels and targets in content

- Navigation labels, order, groups, and semantic targets: `src/content/navigation/{lang}/navigation.md`
- Header nav IDs and footer nav IDs: `src/content/site/{lang}/labels.md` (`header.navIds`, `footer.navIds`)

## 2. Represent targets by pageId

Navigation items reference pages by stable `pageId` (e.g. `home`, `aboutUs`, `donateContact`). The runtime resolves `pageId` to a localized URL via the route registry in `system.md`.

Do not hardcode raw href strings in navigation content.

## 3. Resolve hrefs from the route registry

Canonical public routes live in `src/content/system.md pages[].routes`. The shared `getLocalizedSiblingPath()` helper resolves `pageId` to a localized URL at runtime.

## 4. Remove dead links everywhere

If a page is removed, delete or update:

- `header.navIds` and `footer.navIds` in `site/{lang}/labels.md`
- `navigation.md` entries that reference the removed `pageId`
- breadcrumbs that point to the removed page
- semantic discovery outputs where applicable

---

## How to add or change machine-readable outputs

## 1. Keep canonical meaning in `src/content/`

Never create an AI-only content tree.

## 2. Normalize before projecting

Add or extend typed semantic models under `src/semantic/`. Use adapters/composers that convert page content into normalized meaning.

Do not:

- generate JSON-LD from raw frontmatter directly
- scrape rendered UI
- define entity facts inside components

## 3. Build projections by output or entity type

In this project, the semantic layer is split into:

- portable contracts in `src/semantic/models.ts`
- stable IDs in `src/semantic/ids.ts`
- composition and extraction helpers in `src/semantic/pages.ts`, `src/semantic/extract.ts`, `src/semantic/site-profile.ts`
- output builders in `src/semantic/jsonld.ts`, `src/semantic/jsonld/*`, `src/semantic/llms.ts`
- thin delivery points in `src/components/seo/structured-data.astro`, `src/layouts/layout.astro`, `src/pages/llms.txt.ts`, `src/pages/llms-full.txt.ts`

## 4. Keep delivery thin

Layouts and endpoints may deliver already-built projections. They must not own semantic business rules.

## 5. Respect content-driven visibility

Semantic outputs must hide pages or sections whose blocks are not present in the current page content. A disabled block must not survive as a live target in `llms.txt`, breadcrumbs, or other discovery surfaces.

## 6. Protect against drift

If semantic topology changes, update the validator in `scripts/check/` and keep drift-check scripts aligned with the intended architecture.

---

## Scripts convention

- service or generation scripts -> `scripts/service/`
- validation or architectural checks -> `scripts/check/`
- TypeScript script entrypoints -> run through `tsx`

When adding a script, choose its location by responsibility first.

---

## Breadcrumbs pattern

If breadcrumbs are needed:

- normalize breadcrumb items in the page semantic model or a shared helper
- let visual breadcrumbs consume the same normalized data as JSON-LD
- do not generate separate ad hoc breadcrumb schema in a component or route

---

## External links

All external links must:

- use `data-external-link="1"`
- open with `target="_blank"`
- use `rel="noopener noreferrer"`

If you show an external-link indicator in visitor-facing UI, use the project-approved generated icon component pattern rather than emoji, Unicode symbols, or raw inline SVG.

---

## Review checklist before finishing

- [ ] Is the source of truth still explicit?
- [ ] Does visitor-facing copy live in `src/content/` rather than in routes/components?
- [ ] Do routes stay thin?
- [ ] Do components stay within their class contract?
- [ ] Are all styles kept in `src/styles/` and limited to `--ds-*` tokens?
- [ ] Does `lang` propagate from route to children?
- [ ] Do disabled targets disappear from links and discovery outputs?
- [ ] If navigation changed, are labels content-driven and hrefs resolved from `system.md`?
- [ ] If semantic outputs changed, are they still projection-based and visibility-aware?
- [ ] If scripts changed, do they still respect `scripts/service` vs `scripts/check` boundaries?
