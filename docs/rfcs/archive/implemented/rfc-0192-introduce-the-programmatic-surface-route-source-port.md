---
id: RFC-0192
title: "Introduce the Programmatic Surface route-source port"
status: implemented
kind: architecture
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
amendedBy: []
related:
  - RFC-0026
  - RFC-0047
  - RFC-0048
  - RFC-0141
  - RFC-0160
  - RFC-0167
  - RFC-0169
  - RFC-0183
  - RFC-0193
  - RFC-0194
commands:
  proposed: []
  added:
    - surface.generate
    - surface.validate
  changed: []
  removed: []
appsImpacted:
  - apps/webgogol-com
packagesImpacted:
  - packages/surface
  - packages/share
  - packages/os/site-kernel-checks
  - packages/os/site-kernel-codegen
successSignals:
  - "A site can compile thousands of generated long-tail pages from a dataset × axes specification without authoring a markdown file per page."
  - "Generated pages enter the same route registry as authored pages, so getStaticPaths, sitemap, hreflang, breadcrumbs, and the semantic model work with zero per-route code."
  - "The whole surface is gated by a single `pseo` entitlement: a site that did not buy it compiles zero generated routes and zero extra sitemap entries."
nonGoals:
  - "Do not port the foerderung funding engine — it stays in the legacy app and may return later as its own data-curated module."
  - "Do not define the Blueprint authoring schema or the pilot dataset here (RFC-0193)."
  - "Do not define the substance gate, validators, GEO twins, tier budget, freshness ledger, or LLM enrichment here (RFC-0194..0197)."
  - "Do not introduce request-time generation — the surface is materialized at build time only."
---

# RFC-0192: Introduce the Programmatic Surface route-source port

## Context

The ecosystem is generation-first, but every route still originates from a finite, hand-authored list: the route registry is built by iterating `system.md pages[]`, and each page is a markdown file in `content/pages/{lang}/<slug>.md` (`packages/share/src/astro/routes.ts`, RFC-0048). Everything downstream — `getStaticPaths`, `buildSitemapClusters`, hreflang alternates, breadcrumbs, the semantic model, the per-page output projection — assumes one authored entry per URL.

Programmatic SEO is structurally different: it produces thousands of URLs from `dataset × axes`, not authored one-by-one. The prior studio app proved the value of this (industry × city long-tail, a 7-level combinatorial funding navigator) but did it the heavy way — one bespoke `.astro` route file per family, each with its own `getStaticPaths`. That model cannot be reused here without throwing away the registry, sitemap, semantic, and entitlement machinery the new ecosystem already provides.

## Problem

- The route registry only knows authored pages. There is no seam for a programmatic source to contribute URLs, so a long-tail surface would either bypass the registry (losing sitemap/hreflang/semantic/entitlement integration) or require authoring thousands of `system.md pages[]` entries by hand (which defeats the purpose).
- The valuable combinatorial logic in the legacy app (eligibility matrix, anti-thin-page live/noindex/301 thresholds, nearest-ancestor redirects, live children/siblings for internal linking) is hardcoded to the funding dataset and the `FundingProgram` shape. It is not reusable across businesses.
- There is no productization boundary for "programmatic SEO" — nothing to enable, disable, or sell as one unit.

## Decision

A new **Programmatic Surface** layer is introduced as a **second route source** alongside authored `system.md pages[]`. It ships as a framework-free port package `@gogol/surface` exposing a closed `PageSurfaceProvider` contract (`enumerate` + `resolve`) and an **axis-generic eligibility engine** — the legacy funding engine's logic generalized over an arbitrary record set and a blueprint-derived `matches(record, tuple)` predicate.

A build-time command `surface.generate` expands every entitled surface into virtual route entries and writes `src/surface.generated.json` (symmetric with `entitlements.generated.json`). `getRouteRegistry()` folds these virtual entries into the same registry as authored pages; entries carry a `surfaceId` + `axes`. The page route handler gains one branch: when a registry entry has a `surfaceId`, blocks come from the surface's `resolve()` instead of a `content/pages/*.md` file. The entire surface is gated by a single `pseo` entitlement (RFC-0169). No change is required to `getStaticPaths`, the sitemap builder, hreflang generation, or any section component.

## Architectural fit

- **RFC-0048 (route registry):** the registry becomes a merge of route sources. Authored pages are unchanged; virtual entries are additive and build-time only. **DNA-39 established by this RFC** — "the route registry is a merge of route sources."
- **RFC-0026/0047 (block-declarative pages / content domains):** a generated page is an ordinary `blocks[]` page entry — exactly the shape `buildPage()` already consumes — so it inherits effects, biome, i18n, JSON-LD, and output projection for free.
- **RFC-0141 (content source):** axis value universes and per-record data are read through the Content Source Provider port, never `astro:content` directly, so datasets can later move to a headless CMS without touching the engine.
- **RFC-0160 (URL policy):** virtual entries honor unprefixed-default-language, trailing-slash, and locale opt-in identically to authored entries.
- **RFC-0169/0183 (entitlements / feature policy):** `pseo` is one closed entitlement; a non-subscriber compiles no virtual routes, fail-open when entitlements are unknown (mirrors the blog gate in RFC-0167).
- **Ports & adapters discipline:** `@gogol/surface` is the closed port; concrete page families are Blueprints (RFC-0193), the adapter layer. Vendor/business specifics never leak into the engine.

## Design

### CLI surface

```sh
# Expand all entitled surfaces into src/surface.generated.json (runs in build.prepare)
pnpm exec site-kernel run surface.generate --app webgogol-com

# Structural validation of the generated artifact + provider contracts
pnpm exec site-kernel run surface.validate --app webgogol-com --json
```

### TypeScript contracts

```ts
// @gogol/surface — axis-generic eligibility (generalized from the legacy funding engine)
export interface SurfaceAxis {
  id: string;                       // "industry" | "city" | ...
  universe: readonly string[];      // value slugs sourced from a content-source collection
}

export type AxisTuple = Record<string, string | undefined>;

/** A dataset row with axis-projected fields, produced by a Blueprint's field bindings. */
export type SurfaceRecord = Record<string, string | string[] | undefined> & {
  status?: "active" | "archived";
};

export interface EligibilityPolicy {
  minRecordsPerDepth: Record<number, number>;   // depth → records required to go live
  noindexBelowPerDepth: Record<number, number>; // depth → live-but-noindex threshold
  redirectPolicy: "nearest-ancestor" | "root";
  trailingSlash: boolean;
  segmentPattern: RegExp;                        // URL-segment safety
}

export interface VirtualRouteEntry {
  surfaceId: string;                 // owning Blueprint id, e.g. "website-local"
  pageId: string;                    // synthetic stable id, e.g. "website-local:elektriker:berlin"
  routes: Record<string, string>;    // lang → localized slug
  axes: AxisTuple;
  depth: number;
  recordCount: number;
  indexable: boolean;                // false → emitted as a 301 stub to nearest live ancestor
  noindex: boolean;                  // true → live page tagged noindex,follow
  redirectTo?: string;
}

/** The closed port. One implementation per Blueprint (RFC-0193). */
export interface PageSurfaceProvider {
  readonly id: string;
  enumerate(lang: string): Promise<VirtualRouteEntry[]>;
  resolve(entry: VirtualRouteEntry, lang: string): Promise<PageEntry>; // PageEntry = blocks[]
}

// RFC-0048 extension: a registry entry may originate from a surface.
export interface LocalizedRouteEntry {
  // ...existing fields...
  surfaceId?: string;                // present ⇒ resolve blocks via provider, not pages/*.md
  axes?: AxisTuple;
}
```

The engine reuses the legacy matrix shape — ordered axes, `enumerateCandidateTuples(depth)`, `countMatching(records, tuple)`, live/noindex/redirect derivation, `liveChildrenOf` / `liveSiblingsOf` for internal-link grids — but parameterized by `SurfaceAxis[]` + a `matches(record, tuple)` closure instead of the hardcoded funding fields.

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/surface/src/eligibility.ts` | Axis-generic matrix, live/noindex/redirect derivation |
| `apps/*/src/surface.generated.json` | Build-time materialized virtual route entries (generated; never hand-edited) |
| `packages/share/src/astro/routes.ts` | Folds virtual entries into the registry behind the `pseo` gate |
| `packages/share/src/astro/page-handler.ts` | `surfaceId` branch: blocks from `provider.resolve()` |

### Output format

```json
{
  "command": "surface.generate",
  "status": "ok",
  "surfaces": [
    { "surfaceId": "website-local", "generated": 4210, "indexable": 880, "noindex": 130, "redirected": 3200 }
  ],
  "artifact": "src/surface.generated.json"
}
```

### Failure modes

`surface.generate` is build-time only and fails the build on a malformed Blueprint or an axis universe that cannot be sourced. `getRouteRegistry()` fails open: if `surface.generated.json` is missing or unreadable, no virtual routes are added and authored pages are unaffected (a missing artifact never drops routes). `surface.validate` fails on: duplicate synthetic `pageId`, a virtual slug colliding with an authored slug, a `redirectTo` that does not resolve to a live ancestor, or a provider whose `resolve()` returns a non-conformant `PageEntry`.

## Rollout

- The surface ships disabled by default. An app opts in via the `pseo` entitlement (RFC-0169). With `pseo` absent, `surface.generate` writes an empty artifact and the registry merge is a no-op.
- `surface.generate` registers in the `build.prepare` pipeline, immediately after `entitlements.resolve`, so the gate is known before expansion.
- Because there is no legacy programmatic surface in the new ecosystem, there is no migration: this is a clean-slate introduction.
- The pilot app is `apps/webgogol-com` (RFC-0193); other thin apps adopt by adding the entitlement and a Blueprint, with no engine changes.

## Alternatives considered

- **Author generated pages directly into `system.md pages[]`:** rejected — defeats programmatic generation and bloats the manifest to thousands of entries.
- **Compute the surface live inside `getRouteRegistry()`:** rejected — the registry is a thin runtime-adjacent path; running the combinatorial engine there is heavy and risks pulling `node:fs`/dataset reads into worker bundles. A build-time artifact keeps the runtime path thin.
- **Port the foerderung engine verbatim per business:** rejected — couples the engine to one dataset shape; the whole point is one axis-generic engine + many Blueprints.
- **A new top-level dynamic Astro route per family (legacy model):** rejected — bypasses the registry and re-implements sitemap/hreflang/semantic per family.

## Risks

- **Build scale / memory:** ~10^6 candidate combinations are possible. Mitigation (carried from the legacy engine): at deeper axes emit only live entries; empty deep combinations are dropped, not stubbed. The route budget manifest surfaces the realized counts.
- **Registry path weight:** folding virtual entries must not pull dataset reads into the runtime. Mitigation: merge consumes a pre-materialized JSON artifact; the engine runs only in `surface.generate`.
- **Slug collisions** between authored and generated pages. Mitigation: `surface.validate` rejects collisions; authored pages always win.
- **Agent misuse:** an agent might hand-edit `surface.generated.json`. Mitigation: it is generator-owned (RFC-0080 ownership lint) and regenerated.

## Acceptance criteria

- [x] `@gogol/surface` package with `PageSurfaceProvider`, axis-generic `EligibilityPolicy`/engine, and `VirtualRouteEntry` types (evidence: packages/ directory, package exists)
- [x] `surface.generate` materializes `src/surface.generated.json` and registers in `build.prepare` after `entitlements.resolve` (evidence: implemented historically)
- [x] `getRouteRegistry()` folds virtual entries behind the `pseo` entitlement; fail-open when the artifact is absent (evidence: implemented historically)
- [x] `page-handler` resolves blocks from the baked surface entry for `surfaceId` routes (and 301s redirect stubs); authored pages unchanged (evidence: implemented historically)
- [x] Sitemap, hreflang, and the semantic model (canonical + OG + JSON-LD) work on a generated page with no per-route code — verified end-to-end via the RFC-0193 `website-local` pilot (7 live pages render, enter the sitemap, and pass `seo.meta.validate`/`jsonld.url.validate`/`robots.page.validate`) (evidence: implemented historically)
- [x] `pseo` added to the closed `ENTITLED_FEATURES` catalog (RFC-0169) and its Stripe lookup map (evidence: implemented historically)
- [x] `surface.validate` registered; rejects duplicate/colliding pageIds and broken redirects (evidence: implemented historically)
- [x] `public/.well-known/pseo-manifest.json` emitted with per-surface counts (copied to `dist/` by the Astro build) (evidence: implemented historically)
- [x] `AGENTS.md` documents the route-source seam and the generator-ownership of the artifact (evidence: AGENTS.md:1, agent guide updated)
- [x] `rfc.validate` passes on this file before merging (evidence: implemented historically)

## As-built notes (2026-06-17)

The Design section above describes the originally-proposed shape. As implemented, it differs in:

- `VirtualRouteEntry` uses **`redirectToPageId`** (a live-ancestor pageId the route handler 301s to), not a `redirectTo` URL; `canonicalUrl` is derived at render, not stored.
- **Lazy bake** (`policy.bake: "lazy"`, RFC-0192 follow-up): the registry artifact keeps a metadata stub and the full per-language page lives in `apps/<app>/.surface-cache/<pageId>.json`, loaded on demand at render.
- **No `@gogol/share` dependency.** `@gogol/surface` declares its own `PageEntry`/`SurfaceBlock` (structurally compatible with share's) so it stays the lower-level package — share consumes surface's route types, so a back-dependency would form a workspace cycle (`turbo run build:check` enforces this).
- Manifest is emitted to `public/.well-known/pseo-manifest.json` (copied to `dist/` by Astro), not written directly to `dist/`.

See `packages/surface/README.md` for the living overview.

## Implementation notes for agents

- Agents MAY implement only when this RFC is `accepted`.
- The funding (foerderung) engine is **prior art only**; do not copy its dataset coupling. Generalize over `SurfaceAxis[]` + `matches(record, tuple)`.
- `surface.generated.json` is generator-owned; never hand-edit it — change the Blueprint or `surface.generate` and regenerate.
- The registry merge MUST stay build-time and fail-open; never run dataset enumeration in the runtime/worker path.
- A generated page MUST be an ordinary `PageEntry` (`blocks[]`); never introduce a parallel render path for programmatic pages.
- The surface MUST be gate-able to nothing (no `pseo`) without breaking any build.
- Agents MUST NOT weaken the anti-thin-content thresholds defined by the engine without a superseding RFC (substance enforcement lives in RFC-0194).
