---
id: RFC-0110
title: "Shared section props fragment catalog and composeManifestPropsSchema"
status: implemented
kind: architecture
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-05-27
updatedAt: 2026-06-04
implementedAt: 2026-05-27
closedAt:
supersedes:
supersededBy:
amendedBy:
  - RFC-0205
related:
  - RFC-0026
  - RFC-0072
  - RFC-0091
  - RFC-0100
  - RFC-0101
  - RFC-0102
  - RFC-0103
  - RFC-0104
  - RFC-0106
  - RFC-0107
  - RFC-0108
commands:
  proposed: []
  added: []
  changed:
    - page.block.validate
    - archetype.registry.validate
    - section.contract.validate
  removed: []
appsImpacted: []
packagesImpacted:
  - ontology
successSignals:
  - "Section manifests under packages/ui/src/sections/*/*.manifest.yaml declare propsSchemaCompose: [...] instead of duplicating 60–100 lines of JSON Schema."
  - "Archetype YAML under packages/ontology/archetypes/sections/*.yaml declares propsSchema.compose: [...] for the same canonical fragments."
  - "@gogol/ontology exports SHARED_SECTION_PROPS catalog with nine fragments (section-visual, section-header, body-list, body-split-list, body-stats, body-cards, body-paragraphs, body-comparison, body-rich)."
  - "composeManifestPropsSchema merges fragments + local propsSchema into one draft-07 JSON Schema; the result is used by page.block.validate at build time."
  - "Adding a new visual / header / body property requires editing one fragment file, not 14+ section manifests."
nonGoals:
  - "Do not encode runtime behaviour into the catalog — fragments are pure JSON Schema."
  - "Do not couple the catalog to Zod — the runtime composition uses plain object merging."
  - "Do not allow circular composition between fragments; the catalog is a flat key→fragment map."
---

# RFC-0110: Shared section props fragment catalog and composeManifestPropsSchema

## Status: completed

Implemented during the RFC-0101..RFC-0107 merge train. This RFC formalises the mechanism that was added under `packages/ontology/src/shared-section-props/index.ts`.

## Context

Before this contract:

- Every section manifest carried ~50–80 lines of inline JSON Schema for visual modifiers, header shape, and body shape.
- Every section archetype carried a near-duplicate Zod string for the same fields, with section-specific tweaks.
- A schema change (e.g. RFC-0106 adding `motion` to the section root) required editing 14+ section manifests and 14+ archetype files.

After this contract:

- Manifests declare `propsSchemaCompose: [section-visual, section-header, body-list]` plus a small section-specific `propsSchema`.
- Archetypes declare `propsSchema.compose: [...]` plus an optional `shape:` for fields beyond the fragments.
- A schema change updates one fragment in `SHARED_SECTION_PROPS`; every consumer picks it up automatically.

## Problem

1. **JSON Schema duplication.** ~1500 lines of repeated schema blocks across 24 section manifests.
2. **Archetype-manifest drift.** Two separate copies of the same contract diverged silently.
3. **Schema evolution friction.** RFC-0106 motion expansion would have required ~14 simultaneous file edits without a shared catalog.
4. **Author readability.** Manifest YAML files were unreadable — page authors could not find the actual section-specific content amid the schema noise.

## Decision

Introduce a canonical catalog of JSON Schema fragments inside `@gogol/ontology` and a `composeManifestPropsSchema` utility that merges fragments plus the manifest's local `propsSchema` into one draft-07 schema.

### Catalog location

```
packages/ontology/src/shared-section-props/
  index.ts
```

Exports:

```ts
export const SHARED_SECTION_PROPS = {
  "section-visual":      { properties: { background, glass, density, tone, containerVariant, motion } },
  "section-header":      { properties: { header } },
  "body-list":           { properties: { body: { kind: "list", ... } } },
  "body-split-list":     { properties: { body: { kind: "split-list", ... } } },
  "body-stats":          { properties: { body: { kind: "stats", ... } } },
  "body-cards":          { properties: { body: { kind: "cards", ... } } },
  "body-paragraphs":     { properties: { body: { kind: "paragraphs", ... } } },
  "body-comparison":     { properties: { body: { kind: "comparison", ... } } },
  "body-rich":           { properties: { body: { kind: "rich", ... } } },
} as const;

export function composeManifestPropsSchema(input: {
  compose?: readonly string[];
  local?: Record<string, unknown>;
}): Record<string, unknown>;
```

### Section manifest contract

```yaml
propsSchemaCompose:
  - section-visual
  - section-header
  - body-list

propsSchema:
  type: object
  additionalProperties: false
  required:
    - header
    - body
```

`page.block.validate` calls `composeManifestPropsSchema({compose, local})` through `getSectionPropsSchema` in `packages/ontology/src/schemas/page-entry.ts` and runs the merged schema against authored block props.

### Archetype contract

```yaml
propsSchema:
  $shape: zod
  compose:
    - section-visual
    - section-header
    - body-list
  shape: |
    # Optional inline Zod for section-specific fields beyond the fragments.
```

`section-archetype.ts` exports `propsSchemaFragmentSchema` which accepts either `shape:` or non-empty `compose:` (or both). The same fragment ids are used in both archetype YAML and manifest YAML, keeping the two sources of truth aligned.

### Merge semantics

`composeManifestPropsSchema`:

1. Walks `compose` in declared order, accumulating fragment `properties` and `required[]` into the result.
2. Layers the manifest's local `propsSchema.properties` and `propsSchema.required[]` on top (local wins on key collision).
3. Sets `additionalProperties: false` by default; manifest may opt out by declaring `additionalProperties: true` explicitly.
4. Unknown fragment ids raise an error with the catalog of valid ids in the message.

### Fragment cardinality

| Fragment | Adds to root | Notes |
| --- | --- | --- |
| section-visual | `background`, `glass`, `density`, `tone`, `containerVariant`, `motion` | RFC-0101 + RFC-0106 |
| section-header | `header` | RFC-0102 |
| body-list | `body: { kind: "list", ... }` | RFC-0103 |
| body-split-list | `body: { kind: "split-list", ... }` | RFC-0103 |
| body-stats | `body: { kind: "stats", ... }` | RFC-0103 |
| body-cards | `body: { kind: "cards", ... }` | RFC-0103 |
| body-paragraphs | `body: { kind: "paragraphs", ... }` | RFC-0103 |
| body-comparison | `body: { kind: "comparison", ... }` | RFC-0103 |
| body-rich | `body: { kind: "rich", ... }` | RFC-0103 |

A section composes at most one body fragment (or none, for composite archetypes).

## Design

See `## CLI surface`, `## TypeScript contracts`, and `## File system responsibilities` above for the full fragment catalog, `composeManifestPropsSchema` API, and `shared.section-props.contract.validate` specification.

## Architectural fit

- **RFC-0026 / RFC-0072** — Mirror Quintet contract preserved; the new catalog is a typed sub-fragment library, not a parallel schema source.
- **RFC-0091** — `archetype.registry.build` continues to be the source of truth for catalog discovery.
- **RFC-0100 / RFC-0103** — the canonical list-item and body-content shapes live in one fragment per kind, not 14 manifest files.
- **RFC-0107** — the flag-day rollout depended on this catalog to keep manifest files reviewable.
- **RFC-0108** — the completion report cites this catalog as the central drift-elimination measure.

## CLI surface

No new commands. Affected commands:

- `page.block.validate` — calls into `composeManifestPropsSchema` via `getSectionPropsSchema`.
- `archetype.registry.validate` — accepts `compose` in `propsSchema` via the `.refine(...)` in `section-archetype.ts`.
- `section.contract.validate` (future) — will additionally check that every manifest's `propsSchemaCompose` ids exist in the catalog.

## TypeScript contracts

```ts
export type JsonSchemaFragment = {
  properties: Record<string, unknown>;
  required?: string[];
};

export type SharedSectionPropsId = keyof typeof SHARED_SECTION_PROPS;

export function isSharedSectionPropsId(id: string): id is SharedSectionPropsId;

export function composeManifestPropsSchema(input: {
  compose?: readonly string[];
  local?: Record<string, unknown>;
}): Record<string, unknown>;
```

## File system responsibilities

| Path | Role |
| --- | --- |
| `packages/ontology/src/shared-section-props/index.ts` | Canonical catalog + compose function |
| `packages/ontology/src/index.ts` | Re-exports SHARED_SECTION_PROPS, isSharedSectionPropsId, composeManifestPropsSchema |
| `packages/ontology/src/schemas/page-entry.ts` | `getSectionPropsSchema` composes via the catalog |
| `packages/ontology/src/schemas/section-archetype.ts` | `propsSchemaFragmentSchema` accepts `compose` |
| `packages/ontology/src/manifest.ts` | `sectionManifestSchema` accepts `propsSchemaCompose` |
| `packages/ui/src/sections/*/*.manifest.yaml` | Consumers (every section manifest) |
| `packages/ontology/archetypes/sections/*.yaml` | Consumers (every section archetype) |

## Failure modes

- A manifest declares `propsSchemaCompose: [non-existent-fragment]` → compose throws with the list of valid ids.
- A fragment evolves with a breaking field shape (e.g. enum value removed) → every consumer manifest revalidates against the new schema at build time; authored pages that used the dropped value fail `page.block.validate`.
- Local `propsSchema.additionalProperties` not set → defaults to `false`, rejecting unrecognized keys at the section root.

## Rollout

Implemented in-place during the RFC-0101..RFC-0107 merge train. No further migration steps required.

## Alternatives considered

- **JSON Schema `$ref` with external resolver.** Rejected — adds a resolver step, breaks the simple in-process compose, and conflicts with the Astro/Vite bundling model.
- **Generate manifests from a single source.** Rejected — manifest YAML is human-readable contract; codegen reduces clarity and complicates review.
- **Move schema into TypeScript only (no YAML).** Rejected — section archetype YAMLs are partly authored by humans and AI agents; YAML consumption is the canonical path.

## Risks

- Fragment drift: a fragment definition changes without updating all manifests that pin it. Mitigation: RFC-0119 versioned the fragments; validators strip pins to check base identity.
- YAML-based catalog adds a runtime file-read. Mitigation: catalog is loaded once at validator startup; no hot-reload path.

## Acceptance criteria

- [x] Catalog exists at `packages/ontology/src/shared-section-props/index.ts`. (evidence: packages/ directory, package exists)
- [x] Nine fragments registered: section-visual, section-header, body-list, body-split-list, body-stats, body-cards, body-paragraphs, body-comparison, body-rich. (evidence: implemented historically)
- [x] `composeManifestPropsSchema` is the only merge path. (evidence: implemented historically)
- [x] Every shared section manifest references at most one body fragment (and only when it is non-composite). (evidence: implemented historically)
- [x] Every shared section archetype uses `propsSchema.compose: [...]` for the same fragments. (evidence: implemented historically)

## Implementation notes for agents

- Agents MUST use the catalog ids in `propsSchemaCompose` when authoring or scaffolding a section manifest; never duplicate the schema inline.
- Agents MUST keep manifest YAML in block style (no `{}` flow mappings); the catalog ids are short enough that the manifest stays readable.
- Agents MUST extend the catalog (with a superseding RFC, per DNA-19) when a new section archetype needs a new visual or body sub-schema.
