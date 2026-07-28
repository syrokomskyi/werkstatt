---
id: RFC-0083
title: "Cross-catalog cosmic-name validation and rename helper"
status: implemented
kind: command
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
  - RFC-0025
  - RFC-0071
  - RFC-0072
commands:
  proposed:
    - cosmic.name.rename
  added:
    - cosmic.name.rename
  changed:
    - archetype.registry.validate
  removed: []
appsImpacted: []
packagesImpacted:
  - ontology
  - os/site-kernel-checks
  - os/site-kernel-codegen
successSignals:
  - archetype.registry.validate fails when a section archetype's acceptedCosmicNames contains a MoonCatalog (component) name, and vice versa.
  - archetype.registry.validate fails when an archetype's acceptedCosmicNames contains a name already in use by another archetype of the same layer.
  - cosmic.name.rename atomically updates all 5–7 files that reference a cosmic name (archetype YAML, constellation YAML(s), section manifest, story.md, system.md, site-plan.md, app pages).
nonGoals:
  - Adding new cosmic name catalogs (StarCatalog / PlanetCatalog / MoonCatalog remain closed per DNA-19).
  - Auto-resolving conflicts; the rename helper is an explicit human-driven operation.
---

# RFC-0083: Cross-catalog cosmic-name validation and rename helper

## Context

The cosmic overlay (DNA-23, RFC-0025) uses three closed catalogs mapped to layers:

- `StarCatalog` → page-layer manifests.
- `PlanetCatalog` → section-layer manifests.
- `MoonCatalog` → component-layer manifests.

During the May 2026 warpgogol-com onboarding, the `founder-trust-card` section archetype was found to declare `acceptedCosmicNames: [Naiad]`. Naiad is a Neptune moon — a MoonCatalog entry — and so cannot validly appear on a section-layer manifest. The mistake was discovered only when `constellation.contract.validate` complained about a downstream constellation slot. `archetype.registry.validate` had passed the archetype YAML even though it was structurally illegal.

The fix cascaded through conflicts: Naiad → Hyperion (taken by `markdown` section) → Mimas (taken by `team` section) → Prometheus (free). Each rename required hand-editing 6 files (archetype YAML, constellation YAML, section manifest, story.md, system.md, site-plan.md), plus a rerun of `archetype.registry.build`.

## Problem

1. **Catalog-membership mismatch is uncaught.** `archetype.registry.validate` does not cross-check `acceptedCosmicNames` against the layer-appropriate catalog.
2. **Cosmic-name uniqueness is detected too late.** `cosmic.name.unique` fires only inside `apps-check.run`, after the section manifest is written.
3. **Renaming a cosmic name is a multi-file refactor with no tooling.**

## Decision

**A. Strengthen `archetype.registry.validate`** to cross-check `acceptedCosmicNames` against the catalog matching the archetype's layer (section → PlanetCatalog; component → MoonCatalog). The validator additionally checks that the names are not already declared by another archetype of the same layer.

**B. Introduce `cosmic.name.rename --from <oldName> --to <newName> --layer <layer>`** as a workspace-scope command that atomically updates every reference: archetype YAMLs, constellation YAMLs, section/component manifests, story.md files, every `system.md` in apps/, and every `site-plan.md` in onboarding/.output/.

## Architectural fit

- **DNA-23** unchanged.
- **RFC-0025 / RFC-0072** — enforced during refactor instead of detected after drift.

## Design

### CLI surface

```sh
pnpm exec site-kernel run archetype.registry.validate
pnpm exec site-kernel run cosmic.name.rename --from Naiad --to Prometheus --layer section
pnpm exec site-kernel run cosmic.name.rename --from Naiad --to Prometheus --layer section --dry-run
```

### TypeScript contracts

```ts
interface CosmicRenameRequest {
  from: string;
  to: string;
  layer: "section" | "component";
}

interface CosmicRenameResult {
  command: "cosmic.name.rename";
  status: "ok" | "fail";
  filesChanged: string[];
  violations?: string[];
}
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/ontology/archetypes/{sections,components}/*.yaml` | Updated `acceptedCosmicNames`. |
| `packages/ontology/constellations/*.yaml` | Updated slot `cosmicName`. |
| `packages/ui/src/{sections,components}/<slug>/*-{section,component}.manifest.yaml` | Updated `cosmicName`. |
| `packages/ui/src/{sections,components}/<slug>/*-{section,component}.story.md` | Updated `cosmicName` frontmatter. |
| `apps/*/src/content/system.md` | Updated planets[].cosmicPlanet references. |
| `onboarding/.output/03-compose/site-plan.md` | Updated planet references. |
| `packages/ontology/archetypes/index.json` | Rebuilt automatically. |

### Failure modes

- `cosmic.name.rename` fails fast (no writes) if `--from` is unknown, `--to` is already in use, `--to` is not in the layer's catalog, or any target generated file lacks the GENERATED marker (indicating human edit).
- `archetype.registry.validate` reports each catalog-mismatch as a single violation per archetype with the layer-appropriate name set as a hint.

## Rollout

1. Land the strengthened `archetype.registry.validate`. Fix any archetype violations it surfaces.
2. Land `cosmic.name.rename` with `--dry-run`.
3. Add to `.agents/workflows/03-compose.md` `agentInvariants`: "When `section.scaffold`'s auto-picked cosmic name conflicts with an existing assignment, use `cosmic.name.rename` — never hand-edit references."

## Alternatives considered

- **Auto-pick during section.scaffold.** `pickCosmicName` already does this, but cannot help when `acceptedCosmicNames` has a single entry already taken.
- **Open the catalogs.** Rejected; DNA-19 closes them deliberately.

## Risks

- Mechanical rename could touch many files. Mitigation: `--dry-run`, GENERATED-marker check, scoped key-path matching (not blind string replace).

## Acceptance criteria

- [x] `archetype.registry.validate` cross-checks `acceptedCosmicNames` against the layer-appropriate catalog. (evidence: implemented historically)
- [x] `archetype.registry.validate` rejects duplicate `acceptedCosmicNames` across same-layer archetypes. (evidence: implemented historically)
- [x] `cosmic.name.rename` registered with `--dry-run`. (evidence: implemented historically)
- [x] `.agents/workflows/03-compose.md` references the new command. (evidence: implemented historically)
- [x] All existing archetypes pass the strengthened validation (regression seed: founder-trust-card with Naiad fails). (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement this RFC ONLY when status: accepted.
- Agents MUST NOT change RFC status.
- Implementation must add a regression test seeded from the warpgogol-com Naiad case.
