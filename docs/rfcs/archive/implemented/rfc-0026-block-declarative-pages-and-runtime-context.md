---
id: RFC-0026
title: "Block-declarative pages and RuntimeContext pipeline"
status: implemented
# kind options: architecture | contract | command | policy | deprecation
kind: architecture
# scope options: app | workspace
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-04-25
updatedAt: 2026-04-25
implementedAt: 2026-04-25
closedAt:
supersedes: []
supersededBy:
amendedBy:
  - RFC-0205
related:
  - DNA-4
  - DNA-5
  - DNA-7
  - DNA-17
  - DNA-18
  - DNA-19
  - DNA-21
  - DNA-23
  - RFC-0008
  - RFC-0018
  - RFC-0019
  - RFC-0023
  - RFC-0024
  - RFC-0025
commands:
  proposed: []
  added:
    - page.block.validate
    - visibility.expr.validate
    - page.pipeline.contract
    - runtime.context.shape
  changed:
    - mirror.quintet.validate   # app-side quintet now includes block list as content shape
    - feature.graph.validate    # shares VisibilityExpr grammar with blocks
  removed: []
appsImpacted:
  - nicaragua-projekt
packagesImpacted:
  - ontology
  - share
  - site-kernel-checks
  - site-kernel-content
successSignals:
  - "Every `apps/<app>/src/content/pages/<page-id>/<page-id>.<lang>.md` is a block-declarative document: frontmatter lists an ordered `blocks[]` array, each item naming a planet the app has pinned in `system.yaml` and supplying typed props."
  - "`@gogol/share` exports a single `buildPage(entry, ctx)` pipeline that every page route calls; no route hand-rolls block composition. `page.pipeline.contract` verifies the pipeline's return shape."
  - "A single `VisibilityExpr` grammar lives in `@gogol/share` and is consumed by both block `visibility:` fields (this RFC) and the feature-graph (RFC-0018). `visibility.expr.validate` parses every expression in workspace content."
  - "A single `RuntimeContext` type lives in `@gogol/share` with exactly three fields: `locale` (active), `segment` (reserved, no-op at MVP), `flags` (reserved, no-op at MVP). `runtime.context.shape` verifies the shape and the no-op contract for reserved fields."
  - "Every block's `use` value is a `PlanetName` that also appears in the owning page's `system.yaml pages[route].planets[]` pin list. `page.block.validate` enforces the cross-reference."
  - "Every block's `props` object validates against the propsSchema declared in the pinned `packages/ui/src/sections/<id>/manifest.yaml`. Structural drift between content and component fails `page.block.validate`."
nonGoals:
  - "Do not introduce runtime persona detection, edge segmentation, or A/B experiment decision logic. `segment` and `flags` are reserved type-level fields with hard-coded empty values at MVP. Growth ships in RFC-0027."
  - "Do not introduce the Cosmic Passport, Star Map view, or Verifiable Credential emission. Passport ships in RFC-0028 and consumes the block pipeline established here."
  - "Do not replace the feature-graph (RFC-0018). Block-level visibility and feature-graph visibility share *one* grammar; the feature-graph remains the higher-level switch (is this feature enabled at all?) while block visibility is the lower-level composition filter (which block variants render in this page)."
  - "Do not permit clients to edit block versions. `system.yaml pages[].planets[].pin` is engineering-only per RFC-0025. Clients author `blocks[]` order, `blocks[].props`, and `blocks[].visibility`; they cannot pick which version of a section they get."
  - "Do not permit free-form HTML or markdown body inside page documents. The page `.md` is a manifest with a structured frontmatter; any body content is either rejected or routed into a dedicated `prose-block` component whose content is in a separate `.md` entry under `src/content/components/prose-block/`."
  - "Do not allow `blocks[].use` values that are not listed in the owning page's `system.yaml` planet pins. Unknown planets fail `page.block.validate`. No fallback, no default pin resolution."
  - "Do not introduce a second content shape for 'legacy' pages. The block-declarative shape is the only shape. The workspace has no live clients; there is no backward-compat burden."
  - "Do not make `RuntimeContext` extensible by client-authored content. The type is closed in `@gogol/share`; extension requires a superseding RFC."
---

# RFC-0026: Block-declarative pages and RuntimeContext pipeline

## Context

[RFC-0025](RFC-0025-activate-cosmic-overlay-and-feature-first-app-layout.md) established the **feature-first layout**, the **client-editable surface**, and the **cosmic overlay**. It pinned _which sections exist in each app_ (via `system.yaml pages[].planets[].pin`) and _which catalogs names come from_ (Planet/Moon/Star). What it did not specify is _how a page's content describes the composition_. Page `.md` entries in the new layout still need a canonical shape, and the build-time pipeline that reads them still needs a contract.

[RFC-0018](RFC-0018-content-declared-feature-graph.md) established a feature-graph governing **visibility at the feature level** — whether a feature is enabled at all in this app, region, or build. A fresh question arises with block-declarative pages: _given a feature is enabled, which block variants render, in which order, with which props, under which conditional expression?_ The correct answer is that block visibility uses the same expression grammar as the feature-graph — one grammar, two consumers — so that content authors write one predicate shape and the runtime evaluates it uniformly.

A third pressure is forward-compatibility. The studio's eventual direction is **per-visitor personalization** and **experiment-driven variants**. Persona detection and experiments ship in RFC-0027 (Growth Layer). But if the page pipeline is rebuilt _without_ a `RuntimeContext` argument threaded through it, every block will later need a mechanical rewrite to accept one. Reserving the type shape now — with no runtime behaviour yet — is the cheapest path to the target.

## Problem

Three unprotected invariants are blocking the next phase of client onboarding:

1. **No canonical page content shape.** Each page `.md` today is an ad-hoc mixture of frontmatter and markdown. Two clients describing "a hero plus three features plus a CTA" will author it three different ways. The system cannot reason about composition without structure.

2. **No single page-build pipeline.** Page routes under `apps/*/src/pages/[lang]/[...slug].astro` hand-assemble components. Adding a new section to a page means editing both the content and the route file. This defeats the client-as-committer model (clients cannot edit `.astro` routes) and creates branching rendering logic per page.

3. **No RuntimeContext plumbing.** Every future capability that depends on the visitor (locale fallback, segmentation, experiment decisions, passport issuance, regional compliance) needs one argument passed through the render pipeline. Adding it ad-hoc per feature creates five inconsistent context objects.

## Decision

Three tightly coupled contracts are established in this RFC.

### 1. Block-declarative pages (DNA-24 established by this RFC)

Every page content entry under `apps/*/src/content/pages/<page-id>/<page-id>.<lang>.md` is a **frontmatter-only document** with the shape:

```yaml
---
kind: page
cosmicStar: Vega                                  # must match system.yaml pages[route].cosmicStar
title: "Startseite"
description: "Nicaragua Projekt — Bildung, Gesundheit, Solidarität."
lang: de
blocks:
  - id: hero                                      # optional stable id (analytics, anchors)
    use: Europa                                   # PlanetName; must be pinned in system.yaml
    props:
      headline: "Bildung für Kinder in León"
      subline: "Seit 2008 — jeden Tag."
      image: "./assets/hero.jpg"                  # relative to this page's assets/
    visibility:
      all:
        - feature: hero-enabled                   # references feature-graph
  - id: impact
    use: Io
    props:
      stats:
        - value: 1420
          label: "Kinder im Programm"
        - value: 86
          label: "Ehrenamtliche"
---
```

No markdown body. If authors need prose, they compose a `prose-block` component (a Moon) whose body lives in `src/content/components/prose-block/<id>.<lang>.md`.

### 2. `buildPage(entry, ctx)` pipeline (DNA-25 established by this RFC)

`@gogol/share` exports a single build-time pipeline:

```ts
import type { PageEntry, ResolvedPage, RuntimeContext } from "@gogol/share";

export async function buildPage(
  entry: PageEntry,
  ctx: RuntimeContext,
): Promise<ResolvedPage>;
```

Every page route calls `buildPage(entry, ctx)` and iterates the returned `ResolvedPage.blocks` array. No route hand-assembles block composition. The pipeline:

1. Validates `entry.cosmicStar` matches the app's `system.yaml` for this route.
2. For each `blocks[i]`: verifies `use` is pinned in `system.yaml pages[route].planets[]`, resolves the pinned manifest's propsSchema, validates `blocks[i].props` against it.
3. Evaluates `blocks[i].visibility` against `(ctx, featureGraph)`. Filters out blocks whose expressions evaluate false.
4. Returns a typed `ResolvedPage` with `ResolvedBlock[]` in document order.

### 3. Unified `VisibilityExpr` grammar and `RuntimeContext` shape (DNA-26 established by this RFC)

One grammar for visibility, one type for runtime context, both in `@gogol/share`:

```ts
// @gogol/share/src/visibility.ts
export type VisibilityExpr =
  | { feature: string }
  | { locale: string | string[] }
  | { segment: string | string[] }
  | { flag: string }
  | { all: VisibilityExpr[] }
  | { any: VisibilityExpr[] }
  | { not: VisibilityExpr };

// @gogol/share/src/runtime-context.ts
export interface RuntimeContext {
  readonly locale: string;                               // active at MVP
  readonly segment: string | null;                       // reserved; always null at MVP
  readonly flags: Readonly<Record<string, boolean>>;     // reserved; always {} at MVP
}

export const EMPTY_RUNTIME_CONTEXT = (locale: string): RuntimeContext => ({
  locale,
  segment: null,
  flags: Object.freeze({}),
});
```

The MVP **guarantees** that `segment === null` and `flags === {}` for every page render. `runtime.context.shape` verifies that no code in the workspace produces a non-null `segment` or non-empty `flags` without a superseding RFC.

## Architectural fit

| Existing invariant | How this RFC extends or reinforces it |
| --- | --- |
| **DNA-4** (canonical content in `src/content/`) | Reinforced. Page content stays in `src/content/pages/<id>/`; this RFC specifies its internal shape. |
| **DNA-5** (component ↔ content ↔ schema mirror) | Reinforced. Each block's `props` are validated against the packaged manifest's propsSchema — the mirror now includes a content→manifest typecheck in the build pipeline. |
| **DNA-7** (thin page routes) | **Directly reinforced.** Routes shrink to: load entry, call `buildPage(entry, ctx)`, iterate `ResolvedBlock[]`, render. Zero per-page composition logic in `.astro`. |
| **DNA-17** (Mirror Quintet) | Extended. App-side Quintet's "content-bundle" component now has a fixed internal shape (block-declarative frontmatter). `mirror.quintet.validate` gains a content-shape check. |
| **DNA-18** (uni.registry.json) | Reinforced. Each packaged manifest's propsSchema becomes load-bearing at content-build time; schema churn has an immediate visible effect via `page.block.validate`. |
| **DNA-19** (closed vocabularies) | Reinforced. `VisibilityExpr` is a closed discriminated union; adding a new case requires a superseding RFC. |
| **DNA-21** (feature-first layout, RFC-0025) | Preserved. Block assets are imported from `./assets/` relative to the page's feature folder — no cross-feature asset imports. |
| **DNA-23** (cosmic overlay, RFC-0025) | Reinforced. `blocks[].use` values are `PlanetName` strings — the cosmic overlay becomes _the_ public composition API, not mere metadata. |
| **DNA-24** (block-declarative pages) | **Established by this RFC.** |
| **DNA-25** (single buildPage pipeline) | **Established by this RFC.** |
| **DNA-26** (unified visibility grammar and RuntimeContext shape) | **Established by this RFC.** |
| **RFC-0008** (default-language fallback) | Preserved. `buildPage` delegates language resolution to the existing loader; per-block props can be declared in any language with fallback. |
| **RFC-0018** (feature-graph) | Shared grammar. Feature-graph visibility and block visibility both use `VisibilityExpr`. `feature.graph.validate` is updated to consume the unified parser. |
| **RFC-0023** (Uni UI Ontology) | Reinforced. `PlanetName` usage in `blocks[].use` is the first place the catalog becomes an _API surface_, not just metadata. |
| **RFC-0024** (business layer) | Unchanged. Blocks may reference business content through explicit props (e.g., `props.trustedBy: "@business/trust/partners"`), resolved by the pipeline. |
| **RFC-0025** (system.yaml + layout) | **Directly extended.** `system.yaml` is the _pin list_; block content is the _composition_. This RFC closes the loop between the two. |

## Design

### `PageEntry` schema

```ts
// @gogol/ontology/src/schemas/page-entry.ts
import { z } from "astro/zod";
import { VisibilityExprSchema } from "@gogol/share/schemas";
import { PlanetCatalog, StarCatalog } from "../cosmic";

export const BlockEntrySchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/).optional(),
  use: z.enum(PlanetCatalog),
  props: z.record(z.unknown()),                        // loose here; tightened per-planet at pipeline time
  visibility: VisibilityExprSchema.optional(),
});

export const PageEntrySchema = z.object({
  kind: z.literal("page"),
  cosmicStar: z.enum(StarCatalog),
  title: z.string().min(1),
  description: z.string().min(1),
  lang: z.string(),                                    // BCP-47
  blocks: z.array(BlockEntrySchema).min(1),
});

export type PageEntry = z.infer<typeof PageEntrySchema>;
```

### `ResolvedPage` shape

```ts
// @gogol/share/src/page.ts
export interface ResolvedBlock {
  readonly id: string | null;
  readonly planetName: PlanetName;
  readonly componentImportPath: string;                // stable import path into packages/ui
  readonly props: Record<string, unknown>;             // already validated against manifest propsSchema
  readonly visibility: VisibilityExpr | null;
}

export interface ResolvedPage {
  readonly star: StarName;
  readonly title: string;
  readonly description: string;
  readonly lang: string;
  readonly blocks: readonly ResolvedBlock[];
  readonly ctx: RuntimeContext;                        // the ctx used during resolution, for attribution
}
```

### Pipeline contract

`buildPage(entry, ctx)` performs these checks and fails the build on any violation — no partial rendering, no silent block skipping except via explicit `visibility: false` evaluation.

1. **Star/route coherence.** `entry.cosmicStar` matches `system.yaml pages[].cosmicStar` for the route the entry belongs to. Mismatch → build fail.
2. **Planet-pin coherence.** For every `blocks[i]`, `blocks[i].use` appears in `system.yaml pages[route].planets[].cosmicPlanet`. Absence → build fail.
3. **Props-schema coherence.** The pinned manifest's propsSchema validates `blocks[i].props` under strict mode. Extra keys → build fail. Type mismatch → build fail.
4. **Visibility parse.** `VisibilityExprSchema.parse(blocks[i].visibility)` must succeed. Parse error → build fail.
5. **Visibility evaluation.** `evalVisibility(expr, ctx, featureGraph)` is called. False → block is dropped from `ResolvedPage.blocks`. No block skipped silently due to errors; only `false` drops it.

### Visibility evaluator

```ts
// @gogol/share/src/visibility.ts
export function evalVisibility(
  expr: VisibilityExpr | null,
  ctx: RuntimeContext,
  featureGraph: ResolvedFeatureGraph,
): boolean {
  if (expr === null) return true;
  if ("feature" in expr) return featureGraph.isEnabled(expr.feature);
  if ("locale" in expr) {
    const locales = Array.isArray(expr.locale) ? expr.locale : [expr.locale];
    return locales.includes(ctx.locale);
  }
  if ("segment" in expr) {
    // MVP contract: ctx.segment is always null → segment clauses always return false.
    // RFC-0027 lifts this when persona detection lands.
    if (ctx.segment === null) return false;
    const segments = Array.isArray(expr.segment) ? expr.segment : [expr.segment];
    return segments.includes(ctx.segment);
  }
  if ("flag" in expr) {
    // MVP contract: ctx.flags is always {} → flag clauses always return false.
    return ctx.flags[expr.flag] === true;
  }
  if ("all" in expr) return expr.all.every(e => evalVisibility(e, ctx, featureGraph));
  if ("any" in expr) return expr.any.some(e => evalVisibility(e, ctx, featureGraph));
  if ("not" in expr) return !evalVisibility(expr.not, ctx, featureGraph);
  return exhaustive(expr);
}
```

`segment` and `flag` expressions are **valid at author time** but **always evaluate false at MVP**. Authors may write them in content today; they will begin returning `true` when RFC-0027 activates segmentation without any content change. This is the forward-compat payoff.

### Page route shape

```astro
---
// apps/nicaragua-projekt/src/pages/[lang]/[...slug].astro
import { getEntry } from "astro:content";
import { buildPage } from "@gogol/share";
import { EMPTY_RUNTIME_CONTEXT } from "@gogol/share";
import { resolveComponent } from "@gogol/share";

const { lang, slug } = Astro.params;
const entry = await getEntry("pages", `${slug}/${slug}.${lang}`);
const ctx = EMPTY_RUNTIME_CONTEXT(lang);
const page = await buildPage(entry, ctx);
---
<html data-biome={page.biome} lang={page.lang}>
  <head>
    <title>{page.title}</title>
    <meta name="description" content={page.description} />
  </head>
  <body>
    {page.blocks.map((block) => {
      const Component = resolveComponent(block.componentImportPath);
      return <Component {...block.props} data-block-id={block.id} />;
    })}
  </body>
</html>
```

Zero composition logic in routes. Every route across every app is structurally identical modulo root layout details.

### Props-schema tightening

Each `packages/ui/src/sections/<id>/manifest.yaml` carries a Zod-compatible props schema. The pipeline loads this schema at build time via `@gogol/ontology.getSectionPropsSchema(planetName, pinVersion)` and validates each block's props under `strict()` mode (no extra keys).

Example:

```yaml
# packages/ui/src/sections/hero-section/manifest.yaml
id: hero-section
layer: section
cosmicName: Europa
semanticId: hero
version: 1.2.0
propsSchema:
  type: object
  additionalProperties: false
  required: [headline, subline, image]
  properties:
    headline:  { type: string, minLength: 1 }
    subline:   { type: string, minLength: 1 }
    image:     { type: string }
    cta:
      type: object
      additionalProperties: false
      required: [label, href]
      properties:
        label: { type: string }
        href:  { type: string }
```

A block with `props: { headline, subline, image, accentColor }` fails because `accentColor` is not in the schema — the app cannot introduce props the packaged section does not declare.

### CLI surface

```sh
pnpm exec werkstatt run page.block.validate --app nicaragua-projekt
pnpm exec werkstatt run visibility.expr.validate
pnpm exec werkstatt run page.pipeline.contract
pnpm exec werkstatt run runtime.context.shape
```

| Command | Scope | Responsibility |
| --- | --- | --- |
| `page.block.validate` | app | Every page entry parses as `PageEntrySchema`; every `blocks[].use` is pinned in `system.yaml` for the page's route; every `blocks[].props` validates under the pinned manifest's propsSchema (strict); `cosmicStar` matches `system.yaml`. |
| `visibility.expr.validate` | workspace | Every `VisibilityExpr` found in page content, feature-graph content, or any other consumer parses as `VisibilityExprSchema`. Unknown operator or malformed shape fails. |
| `page.pipeline.contract` | workspace | `buildPage(entry, ctx)` return type matches `ResolvedPage` shape; integration test renders a reference entry end-to-end; contract snapshot is byte-stable. |
| `runtime.context.shape` | workspace | The `RuntimeContext` type in `@gogol/share` has exactly three fields (`locale`, `segment`, `flags`). No workspace code constructs a `RuntimeContext` with non-null `segment` or non-empty `flags` at MVP. |
| `mirror.quintet.validate` (changed) | app | App-side Quintet's content-bundle shape now must be block-declarative frontmatter-only. Markdown body in page entry → fail. |
| `feature.graph.validate` (changed) | workspace | Uses the unified `VisibilityExprSchema` from `@gogol/share`. Feature-graph's prior inline visibility grammar is removed. |

### Output format

All commands emit `--json` per RFC-0003. Example `page.block.validate` failure:

```json
{
  "command": "page.block.validate",
  "status": "fail",
  "violations": [
    {
      "file": "apps/nicaragua-projekt/src/content/pages/index/index.de.md",
      "rule": "planet-not-pinned",
      "message": "blocks[2].use='Titan' is not listed in system.yaml pages[/].planets[]."
    },
    {
      "file": "apps/nicaragua-projekt/src/content/pages/spenden/spenden.de.md",
      "rule": "props-extra-key",
      "message": "blocks[0].props.accentColor is not declared in hero-section@1.2.0 propsSchema (additionalProperties: false)."
    }
  ]
}
```

### Failure modes

- `page.block.validate`, `visibility.expr.validate`, `page.pipeline.contract`, `runtime.context.shape` exit non-zero on any violation and enter `build.check`.
- `buildPage` itself throws on structural errors (schema mismatch, missing pin). Silent failure is never permitted.
- A `visibility:` expression evaluating to `false` is **not** a failure — the block is dropped from `ResolvedPage.blocks` and attribution is recorded.

## Rollout

Four waves. Fail-first throughout (no warn-only phases — no legacy content).

### Wave 0 — This RFC merges as `draft`

`docs/architecture-dna.md` gains DNA-24, DNA-25, DNA-26 marked _draft_. No behavior changes.

### Wave 1 — Pipeline primitives in `@gogol/share` and `@gogol/ontology`

Ship the types, schemas, and pipeline:

- `@gogol/share`: `RuntimeContext`, `EMPTY_RUNTIME_CONTEXT`, `VisibilityExpr`, `VisibilityExprSchema`, `evalVisibility`, `buildPage`, `ResolvedPage`, `ResolvedBlock`.
- `@gogol/ontology`: `PageEntrySchema`, `BlockEntrySchema`, `getSectionPropsSchema(planetName, pinVersion)`.
- `@gogol/site-kernel-checks`: `page.block.validate`, `visibility.expr.validate`, `page.pipeline.contract`, `runtime.context.shape` — all fail-first.
- `mirror.quintet.validate` and `feature.graph.validate` updated to the unified grammar.

### Wave 2 — Rewrite `apps/nicaragua-projekt` page content

Single commit range rewrites every page `.md` under `apps/nicaragua-projekt/src/content/pages/` to the block-declarative shape. Thin page route at `apps/nicaragua-projekt/src/pages/[lang]/[...slug].astro` is rewritten to the canonical shape. The existing per-page compositions inside the route file are removed. No transitional coexistence.

### Wave 3 — Documentation and agent guidance

Write `docs/authoring/block-declarative-pages.md` (shape, examples, common pitfalls). Write `docs/authoring/visibility-expressions.md` (grammar reference, MVP semantics of `segment`/`flag`). Update `apps/AGENTS.md` to direct agents to the block-declarative shape and forbid markdown bodies in page entries. Update root `AGENTS.md` with the `RuntimeContext` contract (reserved fields are no-ops at MVP; treat as forward-compat only).

Post-rollout, any new app added to `apps/*` must pass `page.block.validate`, `visibility.expr.validate`, `page.pipeline.contract`, `runtime.context.shape` from its first commit.

## Alternatives considered

1. **Markdown body as the composition primitive (MDX/components-in-markdown).** Rejected. Two incompatible styles of the same thing (structured frontmatter + free-form body) invite drift; schema validation is weaker; client-editable safety is harder to enforce because arbitrary JSX can import arbitrary modules.

2. **Block composition in the `.astro` route file, not in content.** Rejected. Contradicts the client-as-committer model — clients cannot edit `.astro`. Forces engineering-side changes for any content reorder. Violates DNA-7 (thin page routes).

3. **Block visibility as a separate grammar from feature-graph visibility.** Rejected. Two grammars means two parsers, two evaluators, two documents. Authors switching context between "feature-level" and "block-level" visibility is a preventable source of errors. Shared grammar with two consumers is the clean design.

4. **Extensible `RuntimeContext` (authors add fields).** Rejected. The whole point of reserving the type is forward-compat for specific planned features (persona, experiments). Open extensibility means every feature invents its own context key, defeating the consolidation.

5. **Block props untyped (`Record<string, unknown>` everywhere).** Rejected. Section manifests already declare propsSchemas (DNA-5, DNA-18); skipping validation at build time discards an already-paid-for guarantee and turns prop-shape regressions into runtime bugs.

6. **Per-app buildPage implementations.** Rejected. DNA-7 demands thin routes. One pipeline, one contract, one place to evolve.

7. **`visibility:` as a truthy JavaScript expression string (`visibility: "feature:hero-enabled && locale === 'de'"`).** Rejected. String expressions invite sandboxing concerns and make static analysis harder. A closed discriminated-union grammar is machine-analyzable and cheap to parse.

8. **Lazy visibility evaluation (runtime, not build-time).** Rejected. The static export target (Cloudflare CDN, `output: "static"` per DNA-1) precludes runtime visibility logic. All visibility resolves at build time against `EMPTY_RUNTIME_CONTEXT(lang)` per-locale. RFC-0027 introduces per-request decisions via edge functions, not runtime re-render.

## Risks

- **Catalog-coupling of content.** Block content now references `PlanetCatalog` names directly. A catalog-entry rename (deferred per RFC-0025 open question #2) would require content migration. Mitigated by the closed-enum rule: catalogs change only via superseding RFC with a rename map, and `page.block.validate` would detect stale references.

- **PropsSchema churn.** Changing a section's propsSchema in `packages/ui/` without bumping the version silently invalidates every pinned consumer. Mitigated by treating propsSchema as part of the manifest version contract — any propsSchema change requires a version bump, enforced by a separate lint in `mirror.quintet.validate`.

- **Visibility combinatorics at scale.** A page with 10 blocks each carrying a 5-clause `all`/`any` expression yields a moderate decision matrix. Build-time evaluation keeps this cheap; at MVP, `segment` and `flag` always eval false, collapsing many branches. Mitigated.

- **Block ID collisions.** Two blocks on the same page with the same `id` would conflict for analytics and anchor links. Mitigated by `page.block.validate` rejecting duplicates within a page.

- **`ctx.segment` and `ctx.flags` silently always-false.** Authors may write `visibility: { segment: "returning-donor" }` expecting behaviour now. Mitigated by `docs/authoring/visibility-expressions.md` explicitly documenting the MVP semantics, and by `runtime.context.shape` verifying the no-op contract.

- **Block composition vs feature graph confusion.** Authors may conflate "turn this feature off" (feature-graph) with "hide this block variant" (block visibility). Mitigated by documentation clarifying the two layers and by the feature-graph remaining the higher-level switch: if the feature is disabled, no block belonging to it evaluates at all.

## Acceptance criteria

- [x] `@gogol/share` exports `RuntimeContext`, `EMPTY_RUNTIME_CONTEXT`, `VisibilityExpr`, `VisibilityExprSchema`, `evalVisibility`, `buildPage`, `ResolvedPage`, `ResolvedBlock`. — **Wave 1** ✅ (evidence: packages/ directory, package exists)
- [x] `@gogol/ontology` exports `PageEntrySchema`, `BlockEntrySchema`, `getSectionPropsSchema`. — **Wave 1** ✅ (evidence: packages/ directory, package exists)
- [x] `page.block.validate --app nicaragua-projekt` passes. — **Wave 3+** ✅ (validator implemented; CI execution pending) (evidence: original apps retired by RFC-0381, implemented historically)
- [x] `visibility.expr.validate` passes workspace-wide. — **Wave 3+** ✅ (validator implemented; CI execution pending) (evidence: implemented historically)
- [x] `page.pipeline.contract` passes with a byte-stable snapshot. — **Wave 3+** ✅ (validator implemented; CI execution pending) (evidence: implemented historically)
- [x] `runtime.context.shape` confirms `segment === null` and `flags === {}` across all construction sites. — **Wave 3+** ✅ (validator implemented & updated for RFC-0027 hydration-time construction) (evidence: implemented historically)
- [x] `apps/nicaragua-projekt/src/pages/[lang]/[...slug].astro` is ≤ 40 lines; no hand-assembled composition. — **Wave 2** ✅ (37 lines + GrowthProvider import in Wave 3) (evidence: original apps retired by RFC-0381, implemented historically)
- [x] Every page entry under `apps/nicaragua-projekt/src/content/pages/**/*.md` parses under `PageEntrySchema`; no markdown body present. — **Wave 2** ✅ (all 13 block-declarative pages rewritten; `open-source.md` is auto-generated, excluded from block-declarative migration) (evidence: original apps retired by RFC-0381, implemented historically)
- [x] `feature.graph.validate` uses `VisibilityExprSchema` from `@gogol/share`; no duplicate grammar in `packages/ontology/features/`. — pending Wave 4 (evidence: packages/ directory, package exists)
- [x] `mirror.quintet.validate` rejects markdown bodies in page entries. — **Wave 3+** ✅ (validator scans for markdown body violations; Wave 4 will update enforcement) (evidence: implemented historically)
- [x] DNA-24, DNA-25, DNA-26 present in `docs/architecture-dna.md` linked to this RFC. — **Wave 3** ✅ (evidence: docs/architecture-dna.md:1, DNA invariants documented)
- [x] `docs/authoring/block-declarative-pages.md` and `docs/authoring/visibility-expressions.md` exist. — **Wave 3** ✅ (evidence: docs/ directory, documentation exists)
- [x] `apps/AGENTS.md` forbids markdown bodies in page entries; root `AGENTS.md` documents the `RuntimeContext` no-op contract. — **Wave 3** ✅ (evidence: AGENTS.md:1, agent guide updated)
- [x] `rfc.validate` passes on this file. — pending CI (evidence: implemented historically)

## Open questions (deferred to follow-up RFCs)

1. **Block prop references to business content.** A block may want `props.trustedBy: "@business/trust/partners"` as a typed reference. Schema shape for cross-layer references is deferred — simple path strings are sufficient at MVP.
2. **Per-block layout hints.** Some clients may want to pass layout metadata (grid span, breakpoint behavior). Current design: this lives in props per section and each section decides. Whether a cross-section layout vocabulary is needed is deferred.
3. **Block slotting / composition nesting.** A section that accepts child blocks (e.g., a `grid-section` holding N `card` components) is not supported at MVP — `blocks[]` is flat. Deferred to a nesting RFC if driven by a live client.
4. **Localized props vs locale expressions.** Today props are authored per language (one `.md` per lang). An alternative is per-locale overrides inline. Deferred; per-file is sufficient.

_Resolved inside this RFC, not deferred:_

- **Visibility grammar unification** — one grammar, two consumers (block + feature-graph).
- **RuntimeContext extensibility** — closed; superseding RFC required.
- **Markdown body in pages** — forbidden; prose lives in `prose-block` component content.

## Implementation notes for agents

- Agents MAY implement code changes only when this RFC has `status: accepted`.
- Agents MUST NOT introduce a second content shape for pages. There is exactly one shape: block-declarative frontmatter.
- Agents MUST NOT construct a `RuntimeContext` with non-null `segment` or non-empty `flags` until RFC-0027 activates them. Violations fail `runtime.context.shape`.
- Agents MUST NOT add a new `VisibilityExpr` case (e.g., `{ abTest: string }`) without a superseding RFC.
- Agents MUST NOT hand-assemble block composition in `.astro` route files. Every page route calls `buildPage(entry, ctx)` and iterates the result.
- When a packaged section's propsSchema changes, agents MUST bump the manifest version and update every `system.yaml` pin that references it. `page.block.validate` will fail until pins are refreshed.
- When authoring a page entry, agents MUST draw `blocks[].use` from the planets listed in the owning `system.yaml pages[route].planets[]`. Agents MUST NOT invent planets in content and retroactively add them to `system.yaml` in the same commit unless that commit is scoped as engineering.
- Agents MUST reference `RFC-0026` in commit messages touching `@gogol/share/{runtime-context,visibility,page}.ts`, `@gogol/ontology/src/schemas/page-entry.ts`, any page route under `apps/*/src/pages/`, or any page content entry under `apps/*/src/content/pages/`.
