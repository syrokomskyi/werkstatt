---
id: RFC-0084
title: "Open archetype-derived semantic role catalog"
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
  - RFC-0023
  - RFC-0072
commands:
  proposed: []
  added: []
  changed:
    - archetype.registry.validate
    - archetype.registry.build
  removed: []
appsImpacted: []
packagesImpacted:
  - ontology
  - os/site-kernel-checks
successSignals:
  - Adding a new section archetype with a novel semanticRole does not require editing packages/ontology/src/enums.ts.
  - sectionManifestSchema accepts any role that appears as a section archetype's semanticRole.
  - archetype.registry.validate fails when a manifest uses a role that is not declared by any section archetype.
nonGoals:
  - Opening the cosmic-name catalogs (StarCatalog / PlanetCatalog / MoonCatalog stay closed).
  - Allowing arbitrary roles on manifests with no archetype backing.
---

# RFC-0084: Open archetype-derived semantic role catalog

## Context

`packages/ontology/src/enums.ts` declares `SemanticRoleValues` as a closed `as const` tuple of 13 legacy section roles (`hero`, `dna`, `problem`, `approach`, `impact`, `women`, `transparency`, `donation-use`, `social-proof`, `final-cta`, `team`, `markdown`, `navigation`). The comment marks it "CLOSED — adding a value requires a superseding RFC (DNA-19)."

Meanwhile, `packages/ontology/archetypes/sections/*.yaml` ships dozens of additional archetypes with novel `semanticRole` values: `hero-with-decision-card`, `founder-led-trust`, `client-ownership-disclosure`, `exit-clause-disclosure`, `pricing-disclosure`, `scope-of-responsibility-disclosure`, `side-by-side-comparison`, `audience-self-identification`, `trust-evidence-row`, `faq-list`, `donation-card`, `breadcrumbs`.

During the May 2026 warpgogol-com onboarding, every newly scaffolded handwerk-family section failed `sectionManifestSchema.parse` because `role: hero-with-decision-card` (copied from the archetype's `semanticRole`) was rejected. The temporary fix appended all the missing roles to `SemanticRoleValues` — converting a structural mismatch into a list to maintain by hand.

## Problem

1. **Two sources of truth.** Section archetypes carry `semanticRole`; manifests carry `role`. The closed enum forces these two surfaces to be edited together, but the workflow scaffolds them mechanically and there is no coupling between adding an archetype and updating the enum.
2. **"Closed" no longer matches the design.** RFC-0072 explicitly promotes growing the archetype catalog. A closed enum on `role` works against that intent.
3. **Future onboardings will repeat the failure.** Any new family with new section archetypes will trip the enum mismatch again.

## Decision

Replace the closed `SemanticRoleValues` enum with a validator that consults the archetype catalog at runtime. Section manifests' `role` must equal the `semanticRole` of an existing section archetype.

Concretely:

- `sectionManifestSchema.role` becomes `z.string()`.
- `archetype.registry.build` continues to enumerate every archetype; the resulting `packages/ontology/archetypes/index.json` exposes a derived `sectionRoles[]` set (deduplicated `semanticRole`s of every section archetype).
- `archetype.registry.validate` and `sectionManifestSchema`-using validators cross-check `role` against `sectionRoles[]`. A role that no archetype declares is a violation, hinted with the closest match.

The closed enum is removed entirely.

## Architectural fit

- **RFC-0072** explicitly designed the archetype catalog as the growth surface. This RFC aligns the role contract with that design.
- **DNA-19** "closed catalog" remains for the cosmic-name catalogs where the universe of valid values is bounded by IAU naming; semantic roles have no such bound.

## Design

### TypeScript contracts

```ts
// packages/ontology/src/manifest.ts
export const sectionManifestSchema = manifestBaseSchema.extend({
  layer: z.literal(layerSchema.enum.section),
  role: z.string().min(1), // validated cross-file against archetype catalog
  cosmicName: planetNameSchema,
  propsSchema: z.record(z.string(), z.unknown()).optional(),
});

// packages/ontology/archetypes/index.json (generated)
{
  "sectionArchetypes": [...],
  "componentArchetypes": [...],
  "sectionRoles": ["hero", "hero-with-decision-card", "founder-led-trust", ...],
  "componentRoles": [...]
}
```

### CLI surface

```sh
pnpm exec site-kernel run archetype.registry.build   # writes index.json with sectionRoles[]
pnpm exec site-kernel run archetype.registry.validate
```

### Failure modes

- A manifest's `role` is not declared by any archetype → `archetype.registry.validate` violation: `manifest <slug> uses role "<role>" not declared by any section archetype. Closest matches: ...`.
- The index.json is stale → existing freshness check still applies.

## Rollout

1. Generate `sectionRoles[]` and `componentRoles[]` into `index.json` via `archetype.registry.build` (additive).
2. Switch `sectionManifestSchema.role` from `z.enum(SemanticRoleValues)` to `z.string().min(1)`.
3. Add the role-membership cross-check to `archetype.registry.validate`.
4. Delete `SemanticRoleValues` and `semanticRoleSchema` exports (the runtime enum is gone).
5. Update `AGENTS.md` files that refer to the closed enum.

## Alternatives considered

- **Keep the enum and auto-generate it from archetype YAMLs at build time.** Half-measure: still requires a build step before manifests validate, and the resulting type is a static union that breaks when a new archetype lands without a rebuild.
- **Move all role declaration to the manifest, ignoring archetype's `semanticRole`.** Worse — it deletes the contract that ties manifests to archetypes.

## Risks

- Removing the static enum loses TypeScript autocomplete on `role`. Mitigation: emit a generated `.d.ts` from `archetype.registry.build` that exposes the union as a type alias for IDE help, while runtime keeps `z.string()`.

## Acceptance criteria

- [x] `sectionManifestSchema.role` is `z.string().min(1)`. (evidence: implemented historically)
- [x] `archetype.registry.build` writes `sectionRoles[]` and `componentRoles[]` to `index.json`. (evidence: implemented historically)
- [x] `archetype.registry.validate` rejects manifests whose `role` is not in the corresponding archetype-derived set. (evidence: implemented historically)
- [x] `SemanticRoleValues` removed from `packages/ontology/src/enums.ts`. (evidence: packages/ directory, package exists)
- [x] Optional: a generated `.d.ts` provides IDE-only union type for autocomplete. (evidence: implemented historically)
- [x] Regression test seeded from warpgogol-com `hero-decision-card-section.manifest.yaml`. (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement this RFC ONLY when status: accepted.
- Agents MUST NOT change RFC status.
- This RFC supersedes the temporary `SemanticRoleValues` enlargement that landed during the warpgogol-com onboarding.
