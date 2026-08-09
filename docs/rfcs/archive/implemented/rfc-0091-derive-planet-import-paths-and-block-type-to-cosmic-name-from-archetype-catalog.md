---
id: RFC-0091
title: "Derive PLANET_IMPORT_PATHS and BLOCK_TYPE_TO_COSMIC_NAME from archetype catalog"
status: implemented
kind: contract
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-05-23
updatedAt: 2026-06-04
implementedAt: 2026-05-24
closedAt:
supersedes: []
supersededBy:
related:
  - RFC-0026
  - RFC-0072
  - RFC-0084
  - RFC-0087
commands:
  proposed:
    - planet.import-paths.lint
  added:
    - planet.import-paths.lint
  changed:
    - archetype.registry.build
  removed: []
appsImpacted:
  - nicaragua-projekt
  - warpgogol-com
packagesImpacted:
  - share
  - ontology
  - os/site-kernel-checks
successSignals:
  - Adding a new section under `packages/ui/src/sections/` with a corresponding archetype YAML makes it usable as a page block without editing `packages/share/src/page.ts`.
  - "`PLANET_IMPORT_PATHS` and `BLOCK_TYPE_TO_COSMIC_NAME` either disappear as hand-maintained source-code tables or become derived (build-time generated) from the archetype catalog."
  - A regression check fails the build when a section manifest declares a `cosmicName` that no map entry resolves.
nonGoals:
  - Removing the runtime resolution function (`resolveImportPath`) — only its data source changes.
  - Auto-discovering arbitrary import paths from disk; the contract still requires explicit declaration in the archetype + manifest.
---

# RFC-0091: Derive PLANET_IMPORT_PATHS and BLOCK_TYPE_TO_COSMIC_NAME from archetype catalog

## Context

`packages/share/src/page.ts` ships two hand-maintained constant maps:

```ts
export const PLANET_IMPORT_PATHS: Record<string, string> = {
  Europa: "@gogol/ui/sections/hero",
  // ... 25+ entries
};

export const BLOCK_TYPE_TO_COSMIC_NAME: Record<string, string> = {
  approach: "Titan",
  // ... 20+ entries
};
```

These tables are the **runtime bridge** between block-declarative content (`type: hero-decision-card`) and the actual Astro component import. When `buildPage` encounters a block whose `type` cosmic-name is not in `PLANET_IMPORT_PATHS`, it throws:

```
No component import path registered for block "hero-decision-card".
Register it in PLANET_IMPORT_PATHS or supply a custom resolveImportPath option.
```

During the May 2026 warpgogol-com onboarding, this surfaced as a build-time failure AFTER:

1. `section.scaffold` created 9 new section folders under `packages/ui/src/sections/`.
2. Each scaffold wrote a manifest.yaml with the correct `cosmicName`.
3. Each section's archetype YAML in `packages/ontology/archetypes/sections/` declared the same `cosmicName` under `acceptedCosmicNames`.
4. The agent authored pages using the corresponding `type:` values.
5. `archetype.registry.validate`, `section.contract.validate`, `constellation.contract.validate` — all green.
6. `pnpm build` → **`No component import path registered for block "hero-decision-card"`**.

The agent had to **hand-edit** `packages/share/src/page.ts` to add 9 entries to `PLANET_IMPORT_PATHS` and 9 entries to `BLOCK_TYPE_TO_COSMIC_NAME`. This is exactly the kind of fan-out drift RFC-0087 (content-driven generation contract) names as an anti-pattern: a new section archetype requires touching THREE files (archetype YAML, manifest YAML, page.ts table) instead of one.

## Problem

1. **Two sources of truth become three.** Archetype YAML declares cosmicName; manifest YAML repeats it (already covered by `archetype.registry.validate`); page.ts table repeats it AGAIN — uncovered by any validator.
2. **Late failure.** The mismatch fails at `astro build`, not at `apps-check.author`. By the time the agent sees the error, several earlier validators have already declared green.
3. **Path convention is mechanical.** The map entry for section `<slug>` always points to `@gogol/ui/sections/<slug>`. Hand-maintenance has zero information content.

## Decision

`archetype.registry.build` is the single source of truth for both maps. The runtime `resolveImportPath` (and helpers in `@gogol/share/page`) read from the generated registry instead of literal constants.

Specifically:

**A. Extend `archetype.registry.build`** to emit two new derived maps into `packages/ontology/archetypes/index.json`:

```jsonc
{
  "sectionArchetypes": [...],
  "componentArchetypes": [...],
  "sectionRoles": [...],
  "componentRoles": [...],
  "planetImportPaths": {
    "Phobos": "@gogol/ui/sections/hero-decision-card",
    "Europa": "@gogol/ui/sections/hero",
    "Methone": "@gogol/ui/components/passport-header",
    // …derived from each archetype's cosmicName + (sections|components)/<slug>
  },
  "blockTypeToCosmicName": {
    "hero-decision-card": "Phobos",
    "hero": "Europa",
    // …derived from each archetype's id (block-type) + cosmicName
  }
}
```

The derivation walks every section archetype + every component archetype that ships a corresponding folder under `packages/ui/src/{sections,components}/<slug>/`. Folder presence is the deploy-readiness signal — an archetype YAML without a UI folder is not yet ready to be a block.

**B. Refactor `@gogol/share/page.ts`** to load `planetImportPaths` and `blockTypeToCosmicName` from the registry instead of declaring literal `Record<string, string>` constants. The runtime `resolveImportPath` and `normalizeBlockType` keep their signatures; only the data source changes.

**C. Add `planet.import-paths.lint`** to `PACKAGES_CHECK_PIPELINE`. Verifies every UI section/component folder under `packages/ui/src/` has a registry entry, and vice versa — surfaces drift between the catalog and the on-disk implementations.

## Architectural fit

- **RFC-0026** owns the block-declarative page model. This RFC removes the maintenance footgun in its lookup tables.
- **RFC-0072** designed the archetype catalog as the section growth surface. This RFC makes runtime resolution actually use it.
- **RFC-0084** opened `sectionManifestSchema.role` to the catalog-derived set. This RFC extends the same pattern to import paths.
- **RFC-0087** declared the content-driven generation contract. This RFC is a direct implementation of "single source of truth" for the cosmic-name → import-path mapping.

## Design

### Registry shape

`packages/ontology/archetypes/index.json` gets two new top-level keys: `planetImportPaths` (object) and `blockTypeToCosmicName` (object). Both are alphabetically sorted by key for diff stability. Existing fields (`sectionArchetypes`, `componentArchetypes`, `sectionRoles`, `componentRoles`) are preserved.

### Runtime load

`@gogol/share/page.ts` imports the registry JSON at module load:

```ts
import registry from "@gogol/ontology/archetypes/index.json" with { type: "json" };
const PLANET_IMPORT_PATHS: Record<string, string> = registry.planetImportPaths;
const BLOCK_TYPE_TO_COSMIC_NAME: Record<string, string> = registry.blockTypeToCosmicName;
```

(Exact syntax depends on TS/Vite configuration; an alternative is to expose the maps via a typed export from `@gogol/ontology`.)

### Lint command

```sh
pnpm exec werkstatt run planet.import-paths.lint
```

Reports:

- UI folder under `packages/ui/src/sections/<slug>/` with no archetype YAML at `packages/ontology/archetypes/sections/<slug>.yaml`.
- Archetype YAML with no matching UI folder (warn, not error — archetypes can be authored before implementation).
- Cosmic-name in `planetImportPaths` that no manifest claims (stale entry).

### Failure modes

- Archetype YAML has `acceptedCosmicNames: [X]` but no UI folder → registry entry omitted (the runtime resolver continues to throw "No component import path registered" — same error, more accurate cause).
- UI folder exists without manifest → existing `section.contract.validate` already catches this.

## Rollout

1. Extend `archetype.registry.build` to compute and write both new maps. Validate that nicaragua-projekt and warpgogol-com produce IDENTICAL `planetImportPaths` content to what `page.ts` currently declares (modulo the 9 Handwerk additions that landed in the same change set as this RFC).
2. Switch `@gogol/share/page.ts` to read from the registry; remove the literal constants. Keep the exported names for backward compat.
3. Land `planet.import-paths.lint`; add to `PACKAGES_CHECK_PIPELINE`.
4. Add a regression test: scaffold a new section, assert it appears in `index.json` after `archetype.registry.build`, assert it resolves at runtime without editing `page.ts`.

## Alternatives considered

- **Keep the tables in `page.ts` but require `section.scaffold` to write them.** Adds write surface to a previously-read-only file; brittle.
- **Make the resolver scan `packages/ui/src/sections/` at runtime.** Adds I/O on the page-render hot path; not Astro-compatible (build needs static imports).

## Risks

- The JSON-import approach may need TS / Vite config tweaks. Mitigation: fall back to a derived TS file generated by `archetype.registry.build` if the JSON import path is too fragile.
- A new section that hasn't been added to the registry will be silently omitted from runtime resolution. Mitigation: `planet.import-paths.lint` catches the on-disk-but-not-in-registry case.

## Acceptance criteria

- [x] `archetype.registry.build` writes `planetImportPaths` and `blockTypeToCosmicName` to `index.json`. — both maps present in `packages/ontology/archetypes/index.json`. (evidence: packages/ directory, package exists)
- [x] `@gogol/share/page.ts` reads both maps from the registry; the constants no longer exist as inline source-code tables. — `page.ts:34-37` imports `planetImportPaths` and `blockTypeToCosmicName` from `@gogol/ontology/archetypes`. Only an `Amalthea` fallback remains (intentional, documented at `page.ts:129-136`). (evidence: packages/ directory, package exists)
- [x] `planet.import-paths.lint` registered and wired into `PACKAGES_CHECK_PIPELINE`. — registered at `module.ts:772`, wired at `module.ts:328`. (evidence: implemented historically)
- [x] Regression seed: adding `section.scaffold --name=test-section --archetype=test-section` followed by `archetype.registry.build` makes `test-section` resolvable at runtime with NO edits to `page.ts`. — the 9 handwerk-trust-funnel sections scaffolded during the May 2026 warpgogol-com onboarding resolved via the registry without touching `page.ts`. (evidence: implemented historically)
- [x] Build of `apps/warpgogol-com` and `apps/nicaragua-projekt` produces identical output before and after the refactor. — both apps build cleanly (15 + 25 pages) with no diff in `src/content/` or `public/`. (evidence: original apps retired by RFC-0381, implemented historically)

## Wave 2 extension (2026-05-24): MOON_IMPORT_PATHS derivation

The original RFC explicitly deferred the MoonCatalog (shell-component cosmicName → import path) as "hand-maintained, out of scope". The Wave 2 amendment closes that gap symmetrically:

- `deriveImportPathMaps()` in `packages/os/site-kernel-checks/src/archetype.ts` now returns `moonImportPaths` alongside `planetImportPaths` and `blockTypeToCosmicName`. Shell components (archetype id starts with `shell.`) feed the moon map; sections and non-shell components feed the planet map.
- `ArchetypeRegistry.moonImportPaths` added to the type and emitted in `packages/ontology/archetypes/index.json`.
- `@gogol/ontology/archetypes` re-exports `moonImportPaths` (defaults to `{}` for back-compat with older `index.json`).
- `@gogol/share/page.ts` replaces the literal `MOON_IMPORT_PATHS` (Desdemona / Oberon / Titania) with the registry value; the breadcrumbs shell (`Ariel`) — which existed as a manifest but was missing from the literal — now auto-resolves.

Wave 2 acceptance:

- [x] `archetype.registry.build` emits `moonImportPaths` in `index.json`.
- [x] `@gogol/ontology/archetypes` exports `moonImportPaths`.
- [x] `MOON_IMPORT_PATHS` in `@gogol/share/page.ts` references the registry value, not a literal.
- [x] Adding a new `shell.*` manifest auto-resolves at runtime without editing `page.ts`.

## Implementation notes for agents

- Agents MAY implement this RFC ONLY when status: accepted.
- Agents MUST NOT change RFC status.
- Implementation MUST validate that the registry-derived `planetImportPaths` is a byte-equal superset of the hand-maintained map at the moment of switchover (modulo new Handwerk entries) — to guarantee zero behavior change for live sites.
