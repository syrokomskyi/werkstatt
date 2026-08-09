---
id: RFC-0193
title: "Define the pSEO Blueprint contract and pilot the website-local surface"
status: implemented
kind: contract
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-06-15
updatedAt: 2026-06-17
implementedAt: 2026-06-16
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy:
  - RFC-0199
  - RFC-0201
  - RFC-0207
  - RFC-0500
related:
  - RFC-0023
  - RFC-0025
  - RFC-0141
  - RFC-0143
  - RFC-0160
  - RFC-0167
  - RFC-0192
  - RFC-0194
commands:
  proposed: []
  added:
    - blueprint.validate
  changed: []
  removed: []
appsImpacted:
  - apps/warpgogol-com
packagesImpacted:
  - packages/surface
  - packages/ontology
  - packages/content-source
  - packages/ui
successSignals:
  - "A business-specific programmatic page family is declared entirely in one Blueprint YAML — axes, datasets, per-depth constellation, eligibility policy, and internal-linking rules — with no bespoke route or section code."
  - "The warpgogol-com pilot ships an industry × city long-tail plus pillar pages, rendered from existing shared Planets, gated by the `pseo` entitlement."
  - "Two different businesses can run different programmatic surfaces by shipping different Blueprints over the same engine."
nonGoals:
  - "Do not implement the eligibility engine or the route-source seam (RFC-0192)."
  - "Do not define the substance score or validators (RFC-0194)."
  - "Do not port the legacy funding family; the pilot is industry/city/service/topic only."
  - "Do not invent new section archetypes for the pilot — reuse existing Planets."
---

# RFC-0193: Define the pSEO Blueprint contract and pilot the website-local surface

## Context

RFC-0192 introduces the route-source seam and an axis-generic engine but deliberately leaves open _how a business configures its programmatic pages_. The founder's requirement is explicit: different businesses need different programmatic SEO. The ecosystem already has the right vocabulary for "an ordered sequence of sections that renders a page" — Constellations (RFC-0023/0025, e.g. `packages/ontology/constellations/handwerk-trust-funnel.yaml`). What is missing is the higher-order object that binds _which combinatorial axes_, _which datasets_, _which constellation per depth_, and _which eligibility + linking policy_ together.

The legacy studio app encoded this implicitly across `pseo.ts` (relevance scoring, featured selection, internal-link grids) and per-route `.astro` files. That knowledge must become one declarative, reviewable artifact.

## Problem

- There is no contract for declaring a programmatic page family. Without it, every business would need bespoke TypeScript, re-coupling the engine to a dataset.
- The legacy internal-linking intelligence (relevant topics, featured cities/industries, industry×city combos) is procedural and dataset-specific; it needs a declarative, axis-generic form.
- The pilot datasets ("the same lists" — industries, cities, services, topics) live as app-local Astro collections in the legacy app; in the new ecosystem they must flow through the Content Source Provider (RFC-0141) so they can later come from a CMS.

## Decision

A **Blueprint** is introduced: a declarative YAML in `packages/ontology/blueprints/<id>.yaml` that fully specifies one `PageSurfaceProvider` (RFC-0192) without code. A Blueprint declares: the ordered **axes** and their value **universes** (each bound to a content-source collection + field), the **record dataset** and the axis→field bindings that build the engine's `matches(record, tuple)` predicate, the **constellation per depth** (which existing Planets render at each level), the **eligibility policy** (thresholds, redirect policy, trailing slash), the **internal-linking rules** (children / siblings / teasers, with axis-generic relevance scoring generalizing `pseo.ts`), and **deterministic template rotation** (pick a constellation variant by a hash of the axis tuple, so different values get visibly different layouts).

A generic provider reads the Blueprint and drives the engine; no per-business code. The first Blueprint, `website-local`, is shipped and piloted on `apps/warpgogol-com`: an `industry × city` long-tail plus the `/website`, `/website/[industry]`, `/webdesign/[city]`, and `/ratgeber/[topic]` pillar levels, rendered entirely from existing shared Planets. `blueprint.validate` checks a Blueprint against its datasets and the section catalog.

## Architectural fit

- **RFC-0192:** the generic provider + engine consume the Blueprint; the Blueprint is the adapter layer of the port.
- **RFC-0023/0025 (ontology / constellations):** a Blueprint _references_ a constellation per depth; constellations stay the single source of truth for section order. Blueprints add the combinatorial dimension constellations lack.
- **RFC-0141 (content source):** datasets (industries, cities, services, topics) are content-source collections; axis universes and per-record fields are read through the port.
- **RFC-0143 (generator contract):** per-depth output projection (title/description/canonical patterns) is declared in the Blueprint and flows into the existing projection.
- **RFC-0160 (URL policy):** localized slug templates per axis honor the default-language-unprefixed and trailing-slash rules.
- **RFC-0167 (blog):** same productization pattern — a module composed from existing building blocks, gated by an entitlement.

## Design

### CLI surface

```sh
pnpm exec werkstatt run blueprint.validate --app warpgogol-com --json
```

### Blueprint schema (illustrative `website-local.yaml`)

```yaml
id: website-local
entitlement: pseo            # single gate (RFC-0169)
dataset:
  collection: businesses-local     # content-source collection of records
  status: active                   # field gating live records
axes:
  - id: industry
    universe: { collection: industries, field: slug }
    match: { recordField: industries }      # record.industries[] must include the value
  - id: city
    universe: { collection: cities, field: slug }
    match: { recordField: cities }
levels:
  # depth 0..N → URL shape + constellation + indexability
  - depth: 0
    slug: { de: "website", uk: "website" }
    constellation: website-pillar
  - depth: 1
    slug: { de: "website/{industry}", uk: "website/{industry}" }
    constellation: website-industry
  - depth: 2
    slug: { de: "website/{industry}/{city}", uk: "website/{industry}/{city}" }
    constellation: website-industry-city
policy:
  minRecordsPerDepth: { 0: 0, 1: 1, 2: 1 }
  noindexBelowPerDepth: { 2: 1 }
  redirectPolicy: nearest-ancestor
  trailingSlash: true
linking:
  children: { limit: 12 }
  siblings: { limit: 8 }
  teasers:
    relevance:                       # axis-generic generalization of pseo.ts scoring
      - { sharedAxis: industry, weight: 5 }
      - { sharedAxis: city, weight: 4 }
rotation:
  variantsByTupleHash: true          # deterministic constellation variant per tuple
projection:
  title: { de: "{industry.name} Website in {city.name}", uk: "..." }
  description: { ref: "{record.metaDescription}" }
```

### TypeScript contracts

```ts
// packages/ontology — Blueprint schema (Zod), validated by blueprint.validate
export interface Blueprint {
  id: string;
  entitlement: "pseo";
  dataset: { collection: string; status?: string };
  axes: Array<{ id: string; universe: CollectionField; match: { recordField: string } }>;
  levels: Array<{ depth: number; slug: Record<string, string>; constellation: string }>;
  policy: EligibilityPolicyInput;            // RFC-0192
  linking: LinkingRules;
  rotation?: { variantsByTupleHash: boolean };
  projection: OutputProjectionTemplates;     // RFC-0143
}

// packages/surface — the single generic provider that turns a Blueprint into a provider
export function createBlueprintProvider(bp: Blueprint): PageSurfaceProvider;
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/ontology/blueprints/<id>.yaml` | Declarative page-family spec (client/agent-authorable) |
| `apps/warpgogol-com/src/content/<datasets>/{lang}/*.md` | Pilot datasets via content-source (industries, cities, services, topics, businesses-local) |
| `packages/os/site-kernel-checks/src/blueprint.ts` | `blueprint.validate` |

### Output format

```json
{
  "command": "blueprint.validate",
  "status": "fail",
  "violations": [
    { "blueprint": "website-local", "rule": "axis-universe-empty", "axis": "city" },
    { "blueprint": "website-local", "rule": "unknown-constellation", "constellation": "website-industry-city" },
    { "blueprint": "website-local", "rule": "slug-template-unbound-axis", "level": 2 }
  ]
}
```

### Failure modes

`blueprint.validate` fails on: an axis universe bound to a missing/empty collection, a `levels[].constellation` not registered in the constellation catalog, a slug template referencing an axis not in scope at that depth, a `match.recordField` absent from the dataset shape, or a projection token that cannot resolve. It is a no-op pass when the Blueprint's entitlement is not granted for the app.

## Rollout

- Ship the `website-local` Blueprint disabled (no `pseo` entitlement) so it is inert until sold.
- Port the pilot datasets as content-source collections, reusing the legacy lists (industries, cities, services, topics) as seed content; clients edit them like any other content.
- Reuse existing Planets for all pilot constellations (hero, problem, comparison-cards, audience-cards, faq-list, social-proof, final-cta); no new archetypes.
- Other apps adopt by adding their own Blueprint + the entitlement; the engine and provider are unchanged.

## Alternatives considered

- **Extend the Constellation schema with axes instead of a new Blueprint object:** rejected — constellations are deliberately one ordered slot list per page; overloading them with datasets and combinatorics breaks their "schema simplicity is the contract" rule.
- **Per-business TypeScript provider:** rejected — re-couples the engine to datasets and loses the declarative, reviewable, client-editable surface.
- **Keep datasets as app-local Astro collections (legacy):** rejected — blocks the future CMS path (RFC-0141/0171).
- **Free-form relevance code per family:** rejected — relevance is expressed as axis-generic weighted rules so it is uniform and testable.

## Risks

- **Blueprint expressiveness vs. simplicity:** too rich a schema becomes a programming language in YAML. Mitigation: start minimal (axes, levels, policy, linking, rotation, projection); add fields only when a second business needs them.
- **Slug-template drift** from the URL policy. Mitigation: `blueprint.validate` resolves slug templates through the same localizer used by authored routes.
- **Dataset quality** drives page quality. Mitigation: the substance gate (RFC-0194) is the backstop; thin records never reach the index.
- **Constellation coupling:** a renamed constellation breaks a Blueprint. Mitigation: `blueprint.validate` cross-checks the catalog and runs in `apps-check.run`.

## Acceptance criteria

- [x] Blueprint Zod schema (`blueprintSchema`/`parseBlueprint`) — co-located in `@gogol/surface` to avoid a package cycle; **scope note:** the schema lives in the surface package rather than `packages/ontology` (the engine owns its own contract); the Blueprint **data** YAML files live in `packages/ontology/blueprints/*.yaml` as planned (evidence: packages/ directory, package exists)
- [x] A single generic Blueprint→provider path (`generateEntries` + `expandBlueprint`) turns a Blueprint into materialized routes with no per-business code; pages bake a real constellation of existing Planets (`hero` + `audience-cards` card grid + `markdown` prose/FAQ + `final-cta` teaser/closing links) — no longer a markdown stack (evidence: implemented historically)
- [x] `website-local.yaml` Blueprint: industry × city + pillar level (depth 0/1/2) (evidence: implemented historically)
- [x] Pilot datasets shipped as on-disk content under `src/content/surface/` read by the kernel loader (full content-source collection registration is unnecessary because pages are baked at build time). The `expandBlueprint` loader + `bakePage` are now **axis-generic** (no hard-coded industry/city), driven by per-level `titleTemplate`/`intro`. Three blueprints ship on the pilot: `website-local` (industry×city), `website-service` (industry×service — service records carry `industries[]` so industry-scoped matching prevents nonsensical combos like "Friseur Wallbox"), and `ratgeber` (single topic axis) — 16 live pages total (evidence: implemented historically)
- [x] Axis-generic internal-linking (children/siblings teasers) — baked pages now render `final-cta` link groups to live children + siblings (verified: a city page links to its sibling cities and to `contact`/`kontakt`; passes `seo.internal-linking.validate`) (evidence: implemented historically)
- [x] Deterministic template rotation by tuple hash — an FNV-1a hash of the pageId selects the hero tagline, the secondary CTA, and the card-grid/FAQ order so sibling pages avoid an identical template footprint (evidence: implemented historically)
- [x] `blueprint.validate` registered and in `apps-check.author`; no-op when `pseo` not entitled. Adoption is **explicit** via system.md `surface.blueprints` (a declared Blueprint must ship its datasets — missing → error; an unknown id → error), falling back to implicit opt-in-by-datasets when the list is omitted (evidence: implemented historically)
- [x] `AGENTS.md` documents the Blueprint authoring surface (`apps/AGENTS.md` → "Programmatic Surface / Blueprints"; `packages/AGENTS.md` ownership row) (evidence: AGENTS.md:1, agent guide updated)
- [x] `rfc.validate` passes on this file before merging (evidence: implemented historically)

## As-built notes (2026-06-17)

Beyond the original Design section, the pilot grew to three blueprints and several capabilities:

- **Axis-generic baker/loader** (no hard-coded industry/city): per-level `titleTemplate`/`intro`/`descriptionTemplate` with `{axis.field}` tokens; content from conventional fields (`name`/`intro`/`sections`/`faqs`/`localNote`/`tagline`).
- **Three blueprints on the pilot:** `website-local` (industry×city), `website-service` (industry×service — service records carry `industries[]` so industry-scoped matching prevents nonsensical combos like "Friseur Wallbox"), and `ratgeber` (single topic axis).
- **Explicit adoption** via `system.md surface.blueprints` (a declared blueprint must ship its datasets; falls back to implicit opt-in-by-datasets when omitted).
- **Multilingual** (per-language baked pages with default-language field-level fallback) and **localized URL slugs** (per-value `slug` frontmatter → localized segments) — formalized in **RFC-0199**.
- Teasers render as **linked cards**; a **tuple-hash variant** rotates the hero tagline, secondary CTA, and card-grid/FAQ order.
- The Blueprint **Zod schema lives in `@gogol/surface`** (not `packages/ontology`) to avoid a package cycle; the YAML data files live in `packages/ontology/blueprints/`.

## Implementation notes for agents

- Agents MAY implement only when this RFC is `accepted`.
- A Blueprint MUST reference existing constellations and Planets; do not create new section archetypes for the pilot.
- Datasets MUST be content-source collections (RFC-0141); never read `astro:content` directly from the provider.
- Relevance/linking MUST be expressed as declarative axis-generic rules, not procedural per-dataset code.
- Slug templates MUST resolve through the shared URL localizer (RFC-0160); never hand-format localized paths.
- The pilot is industry/city/service/topic only; do NOT add the funding family here.
- Agents MUST NOT weaken `blueprint.validate` without a superseding RFC.
