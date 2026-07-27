# Semantic Layer — Projection-Based Semantic Output Architecture

> **Scope.** This document defines the architecture of the semantic projection layer used in every site under `apps/*` that produces machine-readable outputs. Sites without semantic outputs yet may skip this layer; sites growing toward JSON-LD, `llms.txt`, or similar outputs must adopt this pattern.
>
> Core principle: **one canonical meaning source → many projections.**

---

## What the semantic layer is

The semantic layer is a pure, typed, framework-light layer that:

1. Accepts normalized canonical content from `src/content/`
2. Converts it into a structured semantic model
3. Emits multiple machine-readable projections from that single model

**Typical projections:**

- Page-level JSON-LD (`<script type="application/ld+json">`)
- Site-level JSON-LD entities (Organization, Person, etc.)
- `llms.txt` — human-readable site summary for LLMs
- `llms-full.txt` — detailed page-level export
- Open Graph / metadata helpers
- Future knowledge exports, docs feeds, or MCP-backed views

---

## What the semantic layer is NOT

The semantic layer must never become:

- A second source of truth next to `src/content/`
- A hidden AI-only website with facts absent from the visible page
- Schema generation scattered across `Hero.astro`, `FAQ.astro`, `AuthorCard.astro`
- A place where route-specific UI decisions are duplicated
- A replacement for sitemap, internal linking, canonical URLs, or normal SEO hygiene

---

## Mandatory invariants

### 1 — Canonical human content comes first

The human-readable page remains the canonical expression of meaning. Machine-readable outputs may restructure that meaning, but they may not invent a second meaning or facts not present in the visible page.

### 2 — `src/content/` stays the source of truth

All visitor-facing meaning starts in `src/content/`. The semantic layer reads from it; it does not write back to it.

### 3 — Projections are derived, never primary

A projection is a read-only view derived from canonical content and a semantic model. It may rearrange facts, change format, or omit irrelevant details. It may never introduce new facts.

### 4 — Feature visibility applies to semantic outputs too

If a page or section is disabled in `src/configure/features.ts`, it must also be absent from `llms.txt`, JSON-LD, breadcrumbs, and all other discovery outputs.

Semantic outputs that ignore feature visibility are incorrect.

### 5 — Cross-page entity facts belong in semantic helpers

Organization, person, contact, initiative, and similar facts that appear across pages must be normalized once in shared semantic helpers, not re-authored per route.

---

## Standard directory layout

```
src/semantic/
  models.ts          ← portable semantic type contracts (page model, entity types)
  ids.ts             ← stable semantic entity IDs and canonical URL helpers
  extract.ts         ← cross-page fact normalization helpers
  site-profile.ts    ← site-wide entity extraction (org, contact, etc.)
  pages.ts           ← page/site semantic composition
  jsonld.ts          ← top-level JSON-LD projection builder
  jsonld/            ← projection builders per entity type
  llms.ts            ← LLM-oriented text projection builders
```

### File responsibilities

| File | Responsibility |
| --- | --- |
| `models.ts` | Portable semantic contracts. Domain-specific, but typed and explicit. |
| `ids.ts` | Stable IDs and canonical URL helpers. Must not scatter across pages. |
| `extract.ts` | Cross-page fact normalization. Reads from `src/content/`; returns typed models. |
| `site-profile.ts` | Site-wide entity assembly (org, contact, policies). Shared across all pages. |
| `pages.ts` | Per-page semantic composition: assembles a full page model for layout/delivery. |
| `jsonld.ts` | Builds JSON-LD structures. Called from layout or route. Never from UI components. |
| `jsonld/` | Per-entity projection builders (WebPage, LocalBusiness, FAQ, etc.). |
| `llms.ts` | Builds LLM-oriented text exports. Called from endpoint routes. |

---

## Delivery boundaries

Semantic outputs reach the page through thin delivery points:

- **`src/components/seo/structured-data.astro`** (or equivalent) — receives a pre-built JSON-LD string from the layout and injects `<script type="application/ld+json">`.
- **`src/layouts/layout.astro`** — receives a pre-built semantic page model and passes it to the delivery component.
- **`src/pages/llms.txt.ts`** and **`llms-full.txt.ts`** — thin endpoint routes that call `src/semantic/llms.ts` and return a `Response`.

**Delivery components must not:**

- Build or normalize semantic facts themselves
- Re-read content collections
- Add facts absent from the route's prepared semantic model

---

## Directory layout (RFC-0012)

```
src/semantic/
├── pages/
│   ├── index.ts                  # buildSitePageModels + buildSiteSemanticModel + re-exports
│   ├── _shared.ts                # Shared page helpers: getRawPageEntry, slugify, extractAnswerBlocksFromMarkdown, blocksToMarkdown
│   ├── index-page.ts             # buildHomePageSemantic (mirrors src/pages/[lang]/index.astro)
│   ├── wir-ueber-uns.ts          # buildAboutPageSemantic (mirrors src/pages/[lang]/wir-ueber-uns.astro)
│   ├── projekte.ts               # buildProjectsPageSemantic (mirrors src/pages/[lang]/projekte.astro)
│   ├── spenden-kontakt.ts        # buildDonationContactPageSemantic (mirrors src/pages/[lang]/spenden-kontakt.astro)
│   ├── impressum.ts              # buildImpressumPageSemantic (mirrors src/pages/[lang]/impressum.astro)
│   ├── datenschutz.ts            # buildDatenschutzPageSemantic (mirrors src/pages/[lang]/datenschutz.astro)
│   ├── agb.ts                    # buildAgbPageSemantic (mirrors src/pages/[lang]/agb.astro)
│   ├── widerruf.ts               # buildWiderrufPageSemantic (mirrors src/pages/[lang]/widerruf.astro)
│   └── open-source.ts            # buildOpenSourcePageSemantic (mirrors src/pages/[lang]/open-source.astro)
├── models.ts                     # unchanged
├── ids.ts                        # unchanged
├── extract.ts                    # unchanged
├── site-profile.ts               # types replaced with schema imports
├── jsonld.ts                     # unchanged
├── jsonld/                       # unchanged
└── llms.ts                       # unchanged
```

**Naming convention:** Semantic builder files use the same kebab-case name as the corresponding `.astro` route file in `src/pages/[lang]/`. The only exception is `index.astro` → `index-page.ts` (to avoid collision with the barrel `index.ts`).

## How to add a new projection

1. Add typed contracts to `src/semantic/models.ts` if new shapes are needed.
2. Add stable IDs to `src/semantic/ids.ts` if new entities need stable anchors.
3. Add normalization helpers to `src/semantic/extract.ts` or `site-profile.ts`.
4. Add a projection builder in `src/semantic/jsonld/` or extend `src/semantic/llms.ts`.
5. Wire the builder into the appropriate per-page builder in `src/semantic/pages/`.
6. Pass the result from the route through `layout.astro` to the delivery component.
7. Verify the output respects the same visibility rules as the UI (feature flags).

## Adding new pages (RFC-0012)

When adding a new visitor-facing route:

1. Create the route file in `src/pages/[lang]/{page-name}.astro`
2. Create a corresponding semantic builder in `src/semantic/pages/{page-name}.ts`
3. Export the builder from `src/semantic/pages/index.ts`
4. Use schema-derived types via `@schemas/*` imports
5. Run `semantic.mirror.validate` to verify correspondence

## Type derivation (RFC-0012)

All hand-written type aliases are replaced by imports from `@schemas/`:

| Current hand-written alias | Replaced by import from |
| --- | --- |
| `HeroSectionContent` | `HeroSectionComponentContent` from `@schemas/components/section/hero-section` |
| `ProblemSectionContent` | `ProblemSectionComponentContent` from `@schemas/components/section/problem-section` |
| ... | ... |

---

## Semantic drift

Semantic drift occurs when machine-readable outputs diverge from what visitors see. Common causes:

- A page is disabled but still appears in `llms.txt`
- An entity fact is updated in a route but not in the semantic helper
- A JSON-LD builder hardcodes a fact instead of reading from the normalized model
- A component generates schema inline, bypassing the semantic layer

**Detection:** `scripts/check/validate-semantic-drift.ts` (where present) or the `semantic.drift.validate` kernel command (phase 2).

---

## Enforcement

| Rule                                         | Status                                   |
| -------------------------------------------- | ---------------------------------------- |
| No JSON-LD generation inside UI components   | 📖 Doc only / AP-14                      |
| Semantic outputs respect feature visibility  | 📖 Doc only                              |
| Cross-page facts in `src/semantic/` helpers  | 📖 Doc only                              |
| No parallel AI-only content tree             | 📖 Doc only / AP-2                       |
| Semantic drift detection                     | 🔜 `semantic.drift.validate` (phase 2)   |
| Route ↔ builder correspondence (SM-01/SM-02) | ✅ `semantic.mirror.validate` (RFC-0012) |
| No hand-written type aliases (SM-03)         | ✅ `semantic.mirror.validate` (RFC-0012) |
