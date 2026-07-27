# SEMANTIC LAYER — semantic projection architecture

> How to add a portable machine-readable layer for AI agents, search engines, and downstream systems without creating a second content system.

---

## Core principle

A site must have **one canonical meaning source**: the content that is rendered for humans. The semantic layer is a **projection layer**, not a parallel site and not a hidden AI-only content tree.

That means:

- human-readable HTML remains canonical;
- machine-readable outputs are derived from the same normalized meaning model;
- JSON-LD, `llms.txt`, `llms-full.txt`, metadata exports, and future AI feeds must agree with the visible page meaning;
- UI components never become the source of semantic truth.

In short:

**One meaning model → many projections.**

---

## Current implementation (authoritative, 2026-06)

The semantic layer now lives in **shared packages**, not in each app's `src/semantic/`. The older `src/semantic/**` and `src/pages/llms*.txt.ts` references below are conceptual history — do not recreate them in apps.

**Where the code is:**

- `@gogol/share/semantic/` — pure, framework-agnostic: `models.ts` (contracts), `jsonld*` builders, `llms.ts` (`buildLlmsIndex`/`buildLlmsFull`), `ids.ts`, and the cross-cutting builders below.
- `@gogol/site-kernel-content/semantic-loader.ts` — the **disk** path (`loadSemanticSiteModel`, used by `llms.generate`) + the node `createNodeFsContentProvider` (RFC-0146).
- `@gogol/business/semantic-model.ts` + `semantic-profile.ts` — the **Astro** path (per-page JSON-LD at render).

**One builder per concern — never duplicate across the two paths:**

- **Per-page model:** `buildSemanticPageModelWith(reader, args)` in `@gogol/share` (RFC-0144). The disk and Astro paths inject a `SemanticContentReader` (RFC-0146: both backed by a `ContentSourceProvider`); the construction logic exists once. Do not add a second per-page builder.
- **Org profile:** `buildOrganizationProfile(input)` in `@gogol/share` (RFC-0148). Both paths resolve their own data and delegate the `SemanticOrganization` assembly here. No inline org assembly in loaders.

**Business-data projection (RFC-0147/0148):** business schemas project into llms + JSON-LD through pure projectors in `@gogol/share/semantic/business-projection.ts` (`projectOffer`, `projectLocation`, `projectPeople`, …). To project a new business schema: add one `projectX` function + an entry in `BUSINESS_DOMAIN_VISIBILITY`, and call it from `buildOrganizationProfile`. **Privacy boundary is mandatory:** `BUSINESS_DOMAIN_VISIBILITY` marks each domain `public` / `pageMeta` / `none`. `external-services` and `compliance` are `none` — vendor names/addresses and internal compliance dates **must never** reach llms or JSON-LD. `business.projection.validate` enforces this (and registry completeness).

**Per-page output control (RFC-0143):** a page's contribution to `llms.txt`/`llms-full.txt` and `sitemap.xml` is the typed `output:` block in `system.md` (`output.llms: exclude|index-only|summary|full`, `output.sitemap`). See the Generator Contract (`packages/os/site-kernel/docs/generator-contract.md`).

**Validation gates (run after semantic/content changes):**

- `semantic.parity` — rebuilds llms from the model, asserts it matches the generated public files byte-for-byte.
- `business.projection.validate` — registry completeness + no-leak boundary.
- `llms.validate`, `sitemap.validate`, `system.manifest.validate`.

**Pitfall — business YAML string fields:** canonical business schemas require **strings** for fields like `foundingYear` and `owner.address.streetNumber`. Write them quoted (`"2026"`, `"29"`). The Astro content-layer Zod validation (exercised whenever a page has `semanticType`) rejects unquoted numbers, even though the disk llms path tolerates them.

---

## Why this architecture needs it

This project serves as a reference implementation that demonstrates the correct base architecture:

- `src/content/` is the source of truth for copy;
- routes stay thin;
- components are presentation-first, not business-logic containers;
- feature flags and navigation visibility are centralized.

Because of that, the correct next step is **not** to create separate AI pages or embed schema logic inside UI components. The correct step is to add a **semantic projection layer** that sits between canonical content and machine-readable outputs.

This approach makes it easy to adopt the semantic layer pattern in other projects, as it builds upon a solid foundation of content and routing best practices.

---

## What the semantic layer is

The semantic layer is a pure, typed, framework-light layer that converts canonical content into a normalized semantic model and then emits multiple machine-readable projections.

Typical projections:

- page-level JSON-LD;
- site-level JSON-LD entities;
- `llms.txt`;
- `llms-full.txt`;
- Open Graph / metadata helpers;
- future knowledge exports, docs feeds, or MCP-backed views.

---

## What the semantic layer is NOT

The semantic layer must never become any of the following:

- a second source of truth next to `src/content/`;
- a hidden AI-only website with facts absent from the visible page;
- schema generation scattered across `Hero.astro`, `FAQ.astro`, `AuthorCard.astro`, and similar UI components;
- a place where route-specific UI decisions are duplicated;
- a replacement for sitemap, internal linking, canonical URLs, or normal SEO hygiene.

---

## Mandatory invariants

These rules must hold in this project and in any project that adopts this pattern.

### 1. Canonical human content comes first

The human page remains the canonical expression of meaning. Machine-readable outputs may restructure that meaning, but they may not invent a second meaning.

### 2. `src/content/` stays the source of truth

In this project, all visitor-facing meaning still starts in `src/content/`. The semantic layer may normalize or enrich structure, but it may not bypass the content pipeline.

### 3. Projections are built from a normalized semantic model

Do not build JSON-LD directly from raw frontmatter and do not build it from rendered UI components. First normalize content into a typed semantic model, then generate outputs from that model.

### 4. UI components do not emit semantic truth

Astro components may render semantic HTML, but they must not independently compose schema nodes or define cross-page entity identity.

### 5. Stable entity identity is required

Cross-page entities such as `Organization`, `WebSite`, `Person`, `Service`, and `WebPage` must use stable, documented `@id` conventions.

### 6. Content-driven visibility must affect semantic outputs too

If a page or section block is absent from the current page content, it must disappear not only from visitor-facing UI but also from machine-readable discovery surfaces where applicable:

- `llms.txt`;
- `llms-full.txt`;
- sitemap-derived projections;
- internal semantic navigation maps;
- section references that would point to missing content.

### 7. Canonical URLs remain authoritative

Semantic outputs must use the same canonical URLs, language prefixes, and route policy as the actual site. Do not invent alternate AI-facing URLs.

### 8. Builders stay framework-light

The semantic model and projection builders should be plain TypeScript where possible. Astro should be used only at delivery boundaries such as layout rendering or endpoint files. This is what makes the layer portable to another project.

---

## Recommended 5-layer architecture

### 1. Source layer

Canonical content and configuration:

- `src/content/**`
- `src/content/system.md` — route registry, page identity, i18n
- `src/content/site/{lang}/labels.md` — shell UI labels
- `src/content/navigation/{lang}/navigation.md` — navigation targets
- site-wide config such as language and canonical base URL helpers

### 2. Adapter layer

Small adapters convert content entries and runtime page context into normalized semantic input.

Examples:

- `toHomeSemanticModel()`
- `toServiceSemanticModel()`
- `toArticleSemanticModel()`
- `toNavigationSemanticModel()`

Responsibility of adapters:

- resolve canonical URLs;
- normalize dates;
- resolve author and organization references;
- normalize cross-page organization, person, contact, donation, and initiative facts in dedicated profile/extractor helpers;
- include only enabled pages/sections;
- flatten content into meaning, not UI shape.

### 3. Semantic model layer

This layer defines the portable contracts. It describes meaning, entities, relationships, and page facts without UI concerns.

Example:

```ts
export type SemanticPageModel = {
  kind: "home" | "page" | "service" | "article"
  url: string
  title: string
  description: string
  datePublished?: string
  dateModified?: string
  breadcrumbs?: Array<{ name: string; url: string }>
  entities: {
    organization?: { id: string; name: string; url: string }
    author?: { id: string; name: string; url?: string }
    service?: {
      id: string
      name: string
      summary: string
      audience?: string[]
      includes?: string[]
      excludes?: string[]
      process?: string[]
      faq?: Array<{ question: string; answer: string }>
    }
  }
  answerBlocks?: Array<{
    id: string
    heading: string
    summary?: string
    facts?: string[]
  }>
}
```

The model should describe **meaning**, not visual component composition.

### 4. Projection builders

Pure builders turn the semantic model into concrete outputs.

Examples:

- `buildOrganizationNode()`
- `buildWebSiteNode()`
- `buildWebPageNode(page)`
- `buildArticleNode(page)`
- `buildServiceNode(page)`
- `buildBreadcrumbListNode(page)`
- `buildLlmsIndex(siteModel)`
- `buildLlmsFull(siteModel)`

### 5. Delivery layer

Thin Astro-specific entry points deliver already-built projections:

- `layout.astro` renders `<script type="application/ld+json">`;
- `src/pages/llms.txt.ts` returns a text response;
- `src/pages/llms-full.txt.ts` returns a text response;
- metadata helpers consume the same semantic model.

Delivery files should not contain business rules beyond wiring.

---

## Recommended file structure

For this project, the semantic layer should be introduced as a dedicated module that can later be copied to another codebase with minimal changes.

```txt
src/
  semantic/
    ids.ts
    models.ts
    extract.ts
    site-profile.ts
    pages.ts
    jsonld/
      context.ts
      types.ts
      shared.ts
      organization.ts
      website.ts
      webpage.ts
      breadcrumb.ts
      person.ts
      initiative.ts
    llms.ts
  components/
    seo/
      StructuredData.astro
  pages/
    llms.txt.ts
    llms-full.txt.ts
```

### Current implementation in this reference project

This repository currently implements the semantic layer in the following shape:

- `src/semantic/models.ts` — portable semantic contracts;
- `src/semantic/ids.ts` — canonical URL + stable entity ID helpers;
- `src/semantic/extract.ts` — markdown/content extraction helpers for cross-page facts;
- `src/semantic/site-profile.ts` — site-wide organization/person/contact/donation/initiative normalization;
- `src/semantic/pages.ts` — page/site semantic composition;
- `src/semantic/jsonld.ts` — thin structured data composer;
- `src/semantic/jsonld/*.ts` — entity-specific structured data builders;
- `src/semantic/llms.ts` — `llms.txt` and `llms-full.txt` projections;
- `src/components/seo/structured-data.astro` + `src/layouts/layout.astro` + root `llms*.txt` endpoints — thin delivery layer.

### Drift protection

This project should keep a dedicated semantic drift validator in `scripts/check/`. Its purpose is to catch architectural drift such as:

- missing expected semantic files;
- broken wiring between `layout.astro`, `structured-data.astro`, and `buildJsonLd()`;
- broken wiring between `llms*.txt` endpoints and `buildSiteSemanticModel()` / `buildLlms*()`;
- accidental collapse of entity-specific builders back into ad hoc projection code.

If the semantic topology changes intentionally, update both the code and the drift validator together.

### Portability rule

Files under `src/semantic/` should stay as framework-agnostic as possible. If the same layer is copied into another Astro project, only these integration points should need adaptation:

- content adapters;
- canonical URL/base URL helpers;
- site-wide organization data source;
- endpoint wiring in layouts and route files.

---

## How this fits the site DNA

This pattern extends the architecture without breaking it.

### It preserves thin routes

Routes still only:

- load content;
- evaluate feature flags;
- assemble page sections;
- pass normalized semantic data to the layout or endpoint layer.

### It preserves content-driven architecture

No visitor-facing facts move out of `src/content/`. The semantic layer only reuses and normalizes them.

### It preserves the layout pattern

`layout.astro` already owns canonical/meta concerns. The semantic layer simply upgrades the JSON-LD responsibility from a hardcoded `WebPage` snippet to a composed graph built from the normalized model.

### It respects content-driven visibility

Because the architecture derives visibility from the content layer (`system.md` route registry + page block presence), semantic outputs must consume the same availability rules. A disabled or missing page must not survive as a live target in `llms.txt`, breadcrumbs, or other discovery surfaces.

---

## Adoption path for any project using this DNA

Use the following sequence when introducing or expanding the semantic layer:

1. Keep the existing human page architecture unchanged.
2. Introduce `src/semantic/models.ts` and `src/semantic/ids.ts`.
3. Add page adapters that convert content entries into `SemanticPageModel`. 3a. Add cross-page extractor/profile helpers for organization-level facts that appear on multiple pages.
4. Replace inline layout JSON-LD creation with `composePageSemantic()` + `StructuredData.astro`.
5. Add `llms.txt` and `llms-full.txt` endpoints that consume the same semantic source.
6. Add validation checks so semantic projections cannot drift from visible content.
7. Keep architectural drift validation updated as the semantic builder topology evolves.

This is an additive architecture change, not a rewrite.

---

## Reproducible recipe for any other project

Use this sequence when transplanting the pattern into another codebase.

### Step 1. Identify the canonical source

Pick exactly one canonical source of page meaning:

- content collections;
- CMS records;
- MDX/Markdown entries;
- database documents.

Do not proceed until that source is explicit.

### Step 2. Define portable semantic contracts

Create framework-light TypeScript types for:

- page meaning;
- site identity;
- author identity;
- service/article/product identity;
- breadcrumb structure;
- answer-oriented blocks for LLM-friendly exports.

### Step 3. Build adapters, not component scrapers

For each page type, write an adapter that reads canonical content and returns a semantic model. Do not inspect rendered HTML and do not ask UI components to emit schema fragments.

### Step 4. Centralize stable IDs

Define one file for entity ID conventions. All builders must reuse those helpers.

### Step 5. Add projection builders

Start with:

- `WebPage`
- `Organization`
- `WebSite`
- page-specific nodes such as `Article` or `Service`
- `BreadcrumbList`
- `llms.txt`
- `llms-full.txt`

### Step 6. Deliver outputs through thin integration points

Keep framework-specific code shallow:

- a layout/component to render JSON-LD;
- endpoints to return text exports;
- metadata helpers for OG / SEO.

### Step 7. Make visibility rules shared

If the project has content-driven visibility rules, publication states, or permissions, the semantic layer must consume the same rules as the UI.

### Step 8. Add drift checks

Validation should ensure that:

- semantic outputs do not point to disabled pages;
- required entities have stable IDs;
- machine-readable facts are present in canonical content;
- `llms` exports are generated from the same semantic model as JSON-LD.

---

## Anti-patterns specific to the semantic layer

Do not do any of the following:

- Generate `Service` JSON-LD inside `ServiceHero.astro`.
- Generate `FAQPage` directly inside the accordion component.
- Maintain one text for the visible page and another for `llms-full.txt` by hand.
- Keep organization facts in five different files with five different IDs.
- Ship AI-only pages containing facts not available on the canonical page.
- Treat `llms.txt` as a replacement for information architecture, internal linking, or sitemap.

---

## Definition of done

The semantic layer is correctly implemented only when all of the following are true:

- there is still a single source of truth for meaning;
- the page remains authoritative for human-visible facts;
- JSON-LD is composed centrally from normalized semantic models;
- `llms.txt` and `llms-full.txt` are generated from the same semantic source;
- disabled pages and sections disappear from semantic discovery outputs;
- the semantic module can be copied into another project without copying UI components.
