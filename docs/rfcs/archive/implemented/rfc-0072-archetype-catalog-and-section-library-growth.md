---
id: RFC-0072
title: "Introduce section-archetype catalog, system.md compiler, and section scaffolding contract"
status: implemented
kind: architecture
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-05-18
updatedAt: 2026-05-18
implementedAt: 2026-05-18
closedAt:
supersedes: []
supersededBy:
related:
  - DNA-23
  - DNA-24
  - DNA-25
  - RFC-0023
  - RFC-0025
  - RFC-0026
  - RFC-0036
  - RFC-0047
  - RFC-0048
  - RFC-0070
  - RFC-0071
  - RFC-0075
commands:
  proposed:
    - archetype.registry.build
    - archetype.registry.validate
    - constellation.contract.validate
    - cosmic.name.pick
    - section.contract.validate
    - section.scaffold
    - section.similarity.report
    - system-md.compile
  added:
    - archetype.registry.build
    - archetype.registry.validate
    - constellation.contract.validate
    - cosmic.name.pick
    - section.contract.validate
    - section.scaffold
    - section.similarity.report
    - system-md.compile
  changed:
    - manifest.contract.validate
    - uni.registry.build
    - uni.registry.validate
  removed: []
appsImpacted: []
packagesImpacted:
  - ontology
  - ui
  - share
  - os/site-kernel-checks
  - os/site-kernel-codegen
successSignals:
  - Every section under packages/ui/src/sections/<slug>/ carries an archetype: <id> field in its manifest
  - The section-archetype catalog under packages/ontology/archetypes/sections/<id>.yaml encodes propsSchema, expected intents, accepted cosmic names, and layout hints
  - A new section is materialized by one command (section.scaffold) producing a complete subfolder ready for the agent to fill in
  - system-md.compile projects the agent's site-plan markdown + a chosen biome into a valid src/content/system.md
  - constellation YAML edits and new section additions are reviewable in a single Windsurf changelist with no hidden staging area
nonGoals:
  - Auto-generating final CSS or final markup for a new section — section.scaffold writes a skeleton; the agent fills it
  - Replacing PlanetCatalog or MoonCatalog (closed catalogs remain authoritative)
  - Allowing wireframe parsing to invent archetype names — unknown archetypes always require either a catalog entry first or a workflow-time decision to add one
  - Backward compatibility with legacy manifest shape (manifests without archetype: are rejected)
---

# RFC-0072: Introduce section-archetype catalog, system.md compiler, and section scaffolding contract

## Context

A real wireframe (`onboarding/.input/36-wireframe.md` for the active client is ~2000 lines) declares ~50 distinct section needs across 16 pages: hero with decision card, trust strip, three-card comparison block, ownership block, Notausgang block, controlled-responsibility block, price card, founder trust card, FAQ list, contact form with no-obligation microcopy, scenario cards, segment-specific hero, anchor-navigation FAQ category card, and more. The `packages/ui` package contains 15 sections today, all aimed at the single existing charity site. `packages/ontology` has exactly one constellation.

There is no machine path from the wireframe to a `system.md` page entry, no path from "the wireframe needs a trust strip" to "trust strip means cosmicPlanet `Mimas` with propsSchema such-and-such", and no scaffold step for creating a new section ready for the agent to author. The cosmic catalog itself (Stars, Planets, Moons) is well-defined; what is missing is the semantic layer above it — _archetypes_ — and the deterministic glue between archetypes, cosmic names, and the per-app `system.md`.

## Problem

1. **No archetype taxonomy.** "Trust strip" appears in five places of one wireframe and likely in every future client's wireframe. There is no shared semantic id that the agent can match against the catalog.
2. **Cosmic names bleed into authoring.** Choosing `Europa` vs. `Hyperion` vs. `Titan` is a senior human decision today. Authors should think in archetypes; cosmic name assignment should be mechanical.
3. **No "create a new section" recipe.** Building a new section means hand-creating a directory with manifest, propsSchema, .astro, .css, and a story — easy to forget a piece, hard to keep consistent across drops.
4. **No section-similarity check.** Without active detection, the catalog will accumulate near-duplicates (`trust-strip-v2`, `trust-strip-handwerk`, `trust-strip-airy`) and reuse will fragment.
5. **`system.md` is hand-authored.** It is a deterministic projection of the site-plan + biome; today it is typed by hand and reviewed in PR.
6. **`manifest.contract.validate` does not enforce archetype linkage.** Without that link, archetype matching cannot rely on the registry.

## Decision

Three layered additions:

1. **Section-archetype catalog** at `packages/ontology/archetypes/sections/<id>.yaml`. Each archetype declares: stable id, semantic role, expected props (Zod schema fragment), expected intents, expected industry fits, layout hint, accepted cosmic Planet names, and authoring constraints.

2. **`manifest.yaml` gains a required `archetype: <id>` field**. Existing manifests are backfilled in the implementation PR. `manifest.contract.validate` rejects manifests without it (no grace period — greenfield).

3. **New single-purpose commands**:
   - `archetype.registry.build` — scan `packages/ontology/archetypes/sections/` and build/refresh `packages/ontology/archetypes/index.json`.
   - `archetype.registry.validate` — verify the index matches on-disk YAMLs.
   - `cosmic.name.pick` — deterministic picker over `PlanetCatalog` / `MoonCatalog` given a constraint set (which catalog, which names already taken, which archetype's `acceptedCosmicNames`).
   - `section.scaffold --archetype <id> --slug <slug>` — file-system operation that creates the subfolder under `packages/ui/src/sections/<slug>/` from a template tied to the archetype.
   - `section.contract.validate` — every section folder has exactly the required files, manifest fields, and import paths.
   - `section.similarity.report` — pairwise similarity over sections; warning-level findings against the bloat risk.
   - `system-md.compile` — project an agent-written `site-plan.md` plus the chosen biome into a fully-valid `apps/<id>/src/content/system.md`.
   - `constellation.contract.validate` — verify every constellation YAML against the extended schema (required-slot order, family pointer, no array `cosmicName`).

Wireframe parsing, archetype matching, propsHint synthesis, and the agent's decision to scaffold a new section vs. reuse an existing one — all of these are **prompt steps** owned by the workflow files (RFC-0075). They are not kernel commands. The kernel provides the catalog, the registry, the projector, the scaffolder, and the validators. The agent provides the judgment.

## Architectural fit

- **DNA-23 / RFC-0025.** Cosmic catalogs remain authoritative; the picker draws from them.
- **DNA-24 / RFC-0026.** Pages emit `blocks[].type` archetype names; the archetype catalog defines what those names map to.
- **RFC-0023 uni ontology.** `manifest.yaml` already carries `id`, `uniName`, `layer`, `cosmicName`, `semanticId`, `version`, `intent`, `industryFit`, `standalone`. This RFC adds `archetype` as required.
- **RFC-0036 shell blocks.** Shell components (Header, Footer, Background, Breadcrumbs) get archetype ids too: `shell.header`, `shell.footer`, `shell.background`, `shell.breadcrumbs`. The catalog covers them.
- **RFC-0070 phases.** The compose phase calls (in this order, per the workflow): produce site-plan.md → for each block, decide archetype + reuse-or-scaffold → for each new section, `section.scaffold` → for cosmic names, `cosmic.name.pick` → `system-md.compile` → `constellation.contract.validate`.

## Design

### Archetype YAML

```yaml
# packages/ontology/archetypes/sections/trust-strip.yaml
id: trust-strip
displayName: "Trust strip"
version: 1.0.0
semanticRole: trust-evidence-row
description: |
  Horizontal row of 3-5 short, equally-weighted trust signals (price openness,
  ownership, exit terms, founder signal). Used early on home/product/segment pages.

expectedIntents: [trust, proof]
expectedIndustryFit: [ngo, nonprofit, b2b-services, handwerk, professional-services]
layoutHint: horizontal-row
recommendedItemCount: { min: 3, max: 5 }

propsSchema:
  $shape: zod
  shape: |
    z.object({
      heading: z.string().optional(),
      items: z.array(z.object({
        label: z.string(),
        value: z.string().optional(),
        icon: z.string().optional(),
      })).min(3).max(5),
      tone: z.enum(["neutral", "warm", "engineered"]).default("neutral"),
      hideSectionNumber: z.boolean().default(true),
    })

acceptedCosmicNames:
  - Mimas
  - Tethys
  - Dione

constraints:
  forbidPhrases: ["günstig", "garantiert"]
  forbidIconLibraryTags: [stock-handshake, stock-thumbs-up]
```

The catalog ships with ~30 archetypes covering the existing 15 `@gogol/ui` sections plus everything `36-wireframe.md` needs. New archetypes are added by writing a YAML and re-running `archetype.registry.build`.

### `archetype.registry.build` / `archetype.registry.validate`

```sh
pnpm exec site-kernel run archetype.registry.build
pnpm exec site-kernel run archetype.registry.validate
```

`build` rewrites `packages/ontology/archetypes/index.json` from all YAMLs. `validate` exits non-zero if the index is stale. Both are added to `PACKAGES_CHECK_PIPELINE`.

### `cosmic.name.pick` — deterministic picker

```sh
# Pick the first available Planet name from a given archetype's accepted list
pnpm exec site-kernel run cosmic.name.pick \
  --catalog planet \
  --archetype trust-strip \
  --exclude-used apps/webgogol-handwerk/src/content/system.md \
  --json
```

Behavior:

- Loads the relevant cosmic catalog (`PlanetCatalog` or `MoonCatalog`).
- Loads the archetype's `acceptedCosmicNames`.
- Subtracts any names currently used in `--exclude-used` (a `system.md`, a manifest, or a comma list passed via `--exclude-names`).
- Returns the first remaining name in catalog order.
- Output: `{ "cosmicName": "Mimas", "catalog": "planet", "candidatesConsidered": ["Mimas", "Tethys", "Dione"], "excludedReason": {} }`.

Determinism: the picker walks the archetype's accepted list in declaration order. Re-running with the same exclusion set yields the same answer.

### `section.scaffold` — single command, file-system operation

```sh
pnpm exec site-kernel run section.scaffold \
  --archetype trust-strip \
  --slug trust-strip \
  --cosmic-name Mimas \
  --industry handwerk
```

Creates exactly this layout:

```
packages/ui/src/sections/trust-strip/
  trust-strip-section.astro              # imports @gogol/share helpers; renders propsSchema fields
  trust-strip.css                        # uses only --ds-* tokens; no raw values
  trust-strip-section.manifest.yaml      # archetype, cosmicName, intent, industryFit, version, propsSchema reference
  trust-strip.props.schema.ts            # Zod schema from archetype, exported
  trust-strip-section.story.md           # one usage example with realistic props
```

The skeleton is _complete enough to compile and pass `section.contract.validate`_, but it is intentionally minimal in visuals — the agent (in the compose or author phase) fills in the real layout and authoring is reviewed by a human in the Windsurf changelist.

After scaffolding, the agent:

1. Edits `<slug>-section.astro` to implement the layout from the wireframe.
2. Adjusts `<slug>.css` to fit the biome's geometry/density/motion axes (still tokens-only).
3. Updates `trust-strip-section.story.md` with the real propsHint from the site-plan.
4. Runs `section.contract.validate` and `packages-check.run` to gate.

No `.draft` sentinel. The file is there or it isn't. If it isn't done, validators say so.

### `section.contract.validate` — single command, single purpose

For every directory under `packages/ui/src/sections/<slug>/`:

- The five required files are present.
- The manifest validates against `manifestSchema` (RFC-0023) and carries `archetype: <id>` resolving to a real archetype.
- The manifest's `cosmicName` is in `acceptedCosmicNames` for the archetype.
- `<slug>.props.schema.ts` exports a Zod schema; the schema's keys are a superset of `propsSchema` declared by the archetype (the section may add optional keys, never required ones the archetype does not declare).
- `<slug>-section.astro` imports only from `@gogol/share`, `@gogol/ui`, `@gogol/tokens` (no `apps/<id>/` imports).
- `<slug>.css` contains no raw colors / sizes (covered by `tokens.colors.lint` / `tokens.ds.lint` but cross-checked here).

### `section.similarity.report` — utility (not a gate)

Pairwise similarity over sections using:

- Archetype id (high weight)
- propsSchema field set + types
- Intent + industryFit overlap
- CSS class-name bag-of-words

Outputs a markdown table sorted by similarity. Findings at similarity ≥ 0.85 are surfaced as a `warn` in `PACKAGES_CHECK_PIPELINE`; humans decide to merge or keep separate.

### `system-md.compile` — pure projector

Reads the agent's `onboarding/.output/03-compose/site-plan.md` plus the chosen biome and writes the _final_ `apps/<id>/src/content/system.md`. The site-plan markdown is a structured-but-readable document the agent authors during compose; it has a strict heading and list shape so the compiler can parse it. Example:

```markdown
# Site plan — webgogol-handwerk

## Biome
handwerk-material-warm

## Constellation
handwerk-trust-funnel

## Pages

### home
- pageId: home
- routes:
  - de: ""
- cosmicStar: Vega
- blocks:
  - id: hero
    archetype: hero-decision-card
    cosmicPlanet: Europa
  - id: trust-strip
    archetype: trust-strip
    cosmicPlanet: Mimas
  - id: comparison
    archetype: comparison-cards
    cosmicPlanet: Hyperion
  …
- shell:
  - header: { cosmicMoon: Oberon }
  - footer: { cosmicMoon: Titania }
  - background: { cosmicMoon: Desdemona }

### product
…
```

`system-md.compile` parses this with a small, strict grammar (defined in `@gogol/site-kernel-codegen/src/site-plan-parser.ts`) and writes the YAML `system.md` content. The same site-plan twice produces the same `system.md`. The compiler's grammar is fixed; if the wireframe needs something the grammar cannot express, the wireframe writer extends the grammar via a successor RFC.

### `constellation.contract.validate` — single command, single purpose

For every `packages/ontology/constellations/*.yaml`:

- Schema valid (RFC-0025 extension: `slots[].cosmicName` is scalar, never array).
- `family` resolves to a real family YAML, and that family lists this constellation among `candidateConstellations`.
- Every `slots[].cosmicName` exists in `PlanetCatalog` and has an entry in `PLANET_IMPORT_PATHS` (RFC-0025).
- `required` slots come before `optional` slots within the same logical group (a configurable rule per constellation).

### TypeScript contracts

```ts
// packages/ontology/src/archetype.ts
export const SectionArchetypeContract = z.object({
  id: z.string(),
  displayName: z.string(),
  version: z.string(),
  semanticRole: z.string(),
  description: z.string(),
  expectedIntents: z.array(UniIntent).min(1),
  expectedIndustryFit: z.array(UniIndustryFit).min(1),
  layoutHint: z.enum(["horizontal-row", "card-grid", "split", "single-column", "table", "media-text", "form", "decision-card"]),
  recommendedItemCount: z.object({ min: z.number(), max: z.number().optional() }).optional(),
  propsSchema: z.object({ $shape: z.literal("zod"), shape: z.string() }),
  acceptedCosmicNames: z.array(z.string()).min(1),
  constraints: SectionArchetypeConstraints.optional(),
}).strict();
```

### File system responsibilities

| Path                                              | Role                                         |
| ------------------------------------------------- | -------------------------------------------- |
| `packages/ontology/archetypes/sections/<id>.yaml` | Archetype definition.                        |
| `packages/ontology/archetypes/index.json`         | Generated index (committed).                 |
| `packages/ontology/constellations/<id>.yaml`      | Constellation definition.                    |
| `packages/ui/src/sections/<slug>/*`               | Section sources.                             |
| `apps/<id>/src/content/system.md`                 | Generated by `system-md.compile`.            |
| `onboarding/.output/03-compose/site-plan.md`      | Agent-written input for `system-md.compile`. |

### Failure modes

- `archetype: <id>` missing from a manifest → `manifest.contract.validate` fails.
- A scaffolded section's manifest references an `archetype` id that does not exist in the catalog → `section.contract.validate` fails.
- `cosmic.name.pick` exhausted (all names in `acceptedCosmicNames` already used) → the picker exits non-zero; the agent must either expand the archetype's accepted list (an RFC change) or pick a different archetype.
- `system-md.compile` cannot parse the site-plan markdown (missing required heading, bad list shape) → fail with line number; agent rewrites the site-plan rather than the generated system.md.
- A section in `packages/ui/src/sections/` does not pass `section.contract.validate` → blocks `PACKAGES_CHECK_PIPELINE`.

## Rollout

1. Ship the archetype catalog with ~30 starter archetypes (covers the existing 15 `@gogol/ui` sections + everything `36-wireframe.md` needs).
2. Backfill `archetype: <id>` in every existing manifest.
3. Make `archetype` required in `manifestSchema` (no grace period).
4. Implement the eight new commands.
5. Register `archetype.registry.validate`, `section.contract.validate`, `constellation.contract.validate` in `PACKAGES_CHECK_PIPELINE`.
6. Register `system-md.compile` so the workflow can invoke it during compose.
7. Update `packages/share/src/page.ts` `PLANET_IMPORT_PATHS` and `MOON_IMPORT_PATHS` automatically from the archetype catalog (the catalog is authoritative for which Planet/Moon names exist; the import paths are populated as new sections land).

## Alternatives considered

- **Embed archetypes inside manifests.** Rejected — the same archetype is shared across many sections; centralizing keeps `propsSchema` and constraints DRY.
- **LLM-based matching as a kernel command.** Rejected — matching is the agent's prompt-time decision; the kernel provides the catalog and the picker.
- **Hand-author `system.md`.** Rejected — the file is a pure projection; hand-authoring is busywork and a drift surface.
- **Allow array `cosmicName` in constellation slots.** Rejected — DNA-23 invariant. Two slots in sequence with `optional: true` are the way.

## Risks

- **Archetype explosion.** Mitigated by grouping archetypes under `packages/ontology/archetypes/sections/<group>/<id>.yaml` (the registry walks recursively).
- **`section.scaffold` template drift.** Mitigated by keeping the template in a single canonical place (`packages/os/site-kernel-codegen/templates/section/`) and unit-testing it.
- **`system-md.compile` grammar too rigid for unusual wireframes.** Mitigated by an explicit `extensions:` block in the site-plan markdown that the parser preserves into `system.md` verbatim.
- **Agent invents archetype names on the fly.** Mitigated by the workflow file forbidding it and by `manifest.contract.validate` rejecting unknown ids.

## Acceptance criteria

- [x] `SectionArchetypeContract` Zod schema in `@gogol/ontology`. (evidence: packages/ directory, package exists)
- [x] ~30 starter archetype YAMLs committed. (evidence: implemented historically)
- [x] `archetype: <id>` made required in every existing manifest under `packages/ui/src/{sections,components}/`. (evidence: packages/ directory, package exists)
- [x] All eight commands listed in the frontmatter registered with workspace scope. (evidence: implemented historically)
- [x] `archetype.registry.build` integrated into the build-prepare pipeline. (evidence: implemented historically)
- [x] `archetype.registry.validate`, `section.contract.validate`, `constellation.contract.validate` listed in `PACKAGES_CHECK_PIPELINE` (RFC-0075). (evidence: implemented historically)
- [x] `system-md.compile` produces a valid `system.md` from a sample site-plan that passes `system.manifest.validate`. (evidence: implemented historically)
- [x] `rfc.validate` passes on this file. (evidence: implemented historically)

## Implementation notes for agents

- Agents MUST run `section.scaffold` to create a new section. Never copy an existing section folder by hand.
- Agents MUST use `cosmic.name.pick` for any new section. Never hand-pick a name from the catalog.
- Agents MUST author the site-plan markdown (`onboarding/.output/03-compose/site-plan.md`) using the strict grammar that `system-md.compile` understands. Never edit `apps/<id>/src/content/system.md` directly.
- Agents MAY refine a scaffolded section's `.astro` and `.css` to match the wireframe and biome. Each iteration MUST keep `section.contract.validate` green.
- Agents MUST NOT add new archetype ids on the fly. If the wireframe demands an archetype not in the catalog, stop and write the YAML first; the human reviews the addition in the changelist.
- Agents MUST run `archetype.registry.validate`, `section.contract.validate`, and `constellation.contract.validate` before declaring the compose phase complete.
