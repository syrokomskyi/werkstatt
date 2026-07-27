# Page Contracts — Cross-Site Page Architecture

> **Scope.** This document defines portable contracts for visitor-facing pages, system pages, and machine-readable endpoints in every site under `apps/*`. A page's own route file may not bypass these contracts; site-level AGENTS.md may add stricter rules.

---

## Core rule

A page is an **orchestrator**, not a content database, not a styling sandbox, and not a second application layer.

**A page may:**

- Load canonical content via Astro content APIs or equivalent
- Evaluate page and section visibility from the central feature registry
- Compose layout and section order
- Pass `lang` and normalized data downward
- Pass a prepared semantic model to the delivery layer

**A page must not:**

- Hardcode visitor-facing copy inline
- Become the source of truth for navigation labels or raw link maps
- Own component-level styling rules
- Generate schema nodes inline
- Duplicate business rules owned by config, content loaders, or semantic helpers

**Project note:** Do not place `AGENTS.md` inside `src/pages/`. Astro treats Markdown files in `src/pages/` as routable pages during build. Keep page guidance in the nearest parent AGENTS.md instead.

---

## Mandatory artifacts per page

Every visitor-facing page in this architecture requires a small set of artifacts. All five must exist and be wired together before a page is considered complete.

### 1. Route file

**Canonical location:** `src/pages/[lang]/*.astro` or `src/pages/[lang]/**/*.astro`

**Owns:**

- Receiving route params
- Loading page content
- Resolving feature visibility
- Composing sections in reading order
- Wiring `Layout`

**Must not:**

- Store visitor-facing labels inline
- Contain large transformation logic
- Duplicate navigation policy
- Duplicate semantic projection logic

### 2. Page content entry

**Canonical location:** `src/content/pages/{lang}/.../*.md`

**Owns:**

- Page-shell copy and page-level metadata
- Canonical visitor-facing meaning
- Optional Markdown body for long-form or generated pages

**Must not:**

- Become a raw href registry
- Encode implementation details already in config
- Introduce redundant discriminators encoded by path structure

### 3. Page schema

**Canonical location:** `src/content/schemas/pages/.../*.ts`

**Owns:**

- Validating the shape of page content
- Providing portable TypeScript types
- Protecting the route from malformed content

### 4. Page feature registration

**Canonical location:** `src/configure/features.ts`

**Owns:**

- Declaring whether the page exists for visitors
- Aligning UI visibility, navigation visibility, and semantic visibility

### 5. Page semantic adapter or composer

**Canonical location:** `src/semantic/pages.ts` or page-type-specific helpers under `src/semantic/`

**Owns:**

- Normalizing page meaning for JSON-LD, `llms.txt`, breadcrumbs, and future projections

---

## Page archetypes

These archetypes are portable. A project may rename or restyle them, but the contracts stay the same.

### Archetype 1 — Home page

**Typical role:** Primary landing route for the current language, hosts core shared sections.

**Owns:** Top-level page composition, initial semantic page model.

**Must not:** Bypass shared content loaders, become a dumping ground for one-off variants.

### Archetype 2 — Standard content page

**Examples:** about, services, contact, process, donation

**Required wiring:** route file, page content entry, page schema, page feature flag, section feature registrations, semantic page registration, semantic builder file (RFC-0012).

**Typical pattern:** Assembles reusable sections; optionally supplies `pageOverride` to shared sections.

### Archetype 3 — Long-form or Markdown page

**Examples:** legal notice, privacy policy, accessibility statement, editorial content

**Typical role:** Renders a body from canonical Markdown content, reuses the same page shell and semantic delivery patterns as any other page.

**Must not:** Bypass the main pages collection, store body copy directly in the route.

### Archetype 4 — Listing or directory page

**Examples:** article index, services index, team directory, resource hub

**Typical role:** Aggregates entries from canonical collections, exposes only visible items, hands normalized listing facts to the semantic layer.

**Must not:** Hand-build a second discovery system that disagrees with UI navigation.

### Archetype 5 — Detail page

**Examples:** article page, case study, author page, program page

**Typical role:** Resolves one entity by slug or path params, generates one canonical semantic page model for that entity.

**Additional requirements:** Stable canonical URL policy, safe `getStaticPaths()` or equivalent, predictable content-to-schema mapping.

### Archetype 6 — Generated page

**Examples:** open-source notices, changelog from release metadata, imported docs

**Typical role:** Publishes generated content while staying inside the same route/content/schema architecture.

**Required rule:** Generated content still becomes canonical content before delivery.

**Must not:** Bypass the content pipeline by writing raw HTML in the route, maintain a hand-edited duplicate of generated facts.

### Archetype 7 — Machine-readable endpoint

**Examples:** `src/pages/llms.txt.ts`, `src/pages/llms-full.txt.ts`

**Typical role:** Delivers already-built projections in a transport-specific format.

**May do:** Call a semantic builder, return `Response`.

**Must not:** Scrape rendered UI, invent facts absent from canonical content, reimplement visibility rules locally.

---

## Route contract checklist

Use when creating or reviewing any route file:

**Inputs the route should receive:**

- Route params
- Canonical content entry or collection query
- Feature registry
- Navigation config when needed
- Semantic page builder when needed

**What the route owns:**

- Page assembly
- Section order
- Visibility gating
- Passing `lang`
- Handing prepared props to layout and children

**What the route delegates:**

- Copy → `src/content/`
- Validation → Zod schemas
- Href resolution → configuration/helpers
- Semantic normalization → `src/semantic/`
- Styles → `src/styles/`

**What the route must not own:**

- Reusable presentational markup that belongs in components
- Raw menu labels
- Duplicated external-link logic
- Schema graph composition

---

## Definition of done for a new page

A page is correctly integrated when **all** of the following are true:

- [ ] It has one canonical route file in the correct location under `src/pages/[lang]/`
- [ ] Its copy lives in a canonical content entry under `src/content/pages/{lang}/` whose filename stem matches the route file stem (enforced by `mirror.quartet.validate` rule QP-01, RFC-0014)
- [ ] Its content shape is validated by a Zod schema under `src/content/schemas/pages/`
- [ ] Its visibility is registered centrally in `src/configure/features.ts`
- [ ] Its links resolve through shared helpers when applicable
- [ ] Its semantic outputs are projections from `src/semantic/`, not bespoke page-local logic
- [ ] Removing the page does not break unrelated components or configuration branches

---

## Signals that a route should be redesigned

Split or redesign a route when any of these appear:

- The route contains repeated markup that could be a component
- The route constructs multiple ad hoc link maps
- The route starts validating raw frontmatter by hand
- The route stores large arrays of visitor-facing copy
- The route contains output-specific schema logic
- The route grows multiple conditional branches that really represent separate page archetypes

---

## Route-stem ↔ content-slug alignment

For every visitor-facing route `src/pages/[lang]/{name}.astro` that calls `getPageEntryWithFallback(lang, "<slug>")`, the slug argument must equal `{name}`.

**Example:** `projekte.astro` must call `getPageEntryWithFallback(lang, "projekte")` and the content file must be `src/content/pages/{lang}/projekte.md`.

This rule is automatically enforced by `mirror.quartet.validate` (rule **QP-01**). A mismatch is a build-blocking error.

| Enforcement | Command                                      |
| ----------- | -------------------------------------------- |
| ✅ Now      | `mirror.quartet.validate` — QP-01 (RFC-0014) |

---

## Cross-site conventions

- All visitor-facing routes carry a `/{lang}/` prefix.
- `getStaticPaths()` behavior is a coordinated architectural decision — do not change it per route.
- Middleware handles language-aware entry behavior; routes do not duplicate that logic.
- `lang` flows from route params to layout to every child component that accepts it.
