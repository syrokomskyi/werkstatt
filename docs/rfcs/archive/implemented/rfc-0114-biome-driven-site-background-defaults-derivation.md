---
id: RFC-0114
title: "Biome-driven site-background defaults derivation"
status: implemented
kind: architecture
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-05-27
updatedAt: 2026-06-04
implementedAt: 2026-05-29
closedAt:
supersedes:
supersededBy:
related:
  - RFC-0025
  - RFC-0071
  - RFC-0098
  - RFC-0101
  - RFC-0105
  - RFC-0106
  - RFC-0108
commands:
  proposed:
    - biome.site-background.derive
  added:
    - biome.site-background.derive
  changed:
    - biome.tokens.derive
  removed: []
appsImpacted:
  - warpgogol-com
  - nicaragua-projekt
packagesImpacted:
  - ontology
  - os/site-kernel-checks
  - os/site-kernel-codegen
successSignals:
  - "Every biome under packages/ontology/biomes/<id>.yaml can declare an optional `siteBackground` block whose layer list seeds the default SiteBackgroundConfig used by a freshly onboarded app."
  - "biome.tokens.derive produces the siteBackground block deterministically from biome.axes (decorativeAllowed, photoStance, motionStance) when the block is absent."
  - "Apps onboarded after this RFC do not hand-write the SiteBackground layers when the biome already encodes them."
  - "Apps that want a custom site background still override the biome default in apps/<id>/src/content/system.md."
nonGoals:
  - "Do not couple SiteBackground to a single image — biomes may declare layered gradients only."
  - "Do not force every biome to declare siteBackground; the block is optional and defaults to a solid --ds-color-bg paint."
  - "Do not move the per-page background out of system.md — pages still pick whether the biome default is used or overridden."
---

# RFC-0114: Biome-driven site-background defaults derivation

## Context

RFC-0105 defined the `<SiteBackground>` shell archetype. Today each app hand-declares the full layer list in `apps/<id>/src/content/system.md`:

```yaml
shell:
  background:
    enabled: true
    cosmicMoon: Hermippe
    pin: "1.0.0"
    props:
      layers:
        - kind: image
          imageName: "home-bg"
          fit: cover
          quality: high
          loading: eager
```

Two issues:

1. **Repetition across siblings.** Two apps in the same biome family re-declare the same layer pattern.
2. **No biome-level default.** A new app onboarded into an existing biome must figure out the layer shape by hand instead of inheriting one from `biome.tokens.derive` (RFC-0071).

## Problem

1. **Biomes lack a `siteBackground` block.** The schema covers palette, typography, spacing, motion, geometry, shadows, gradients — but not site background.
2. **Onboarding friction.** RFC-0078 thin-client scaffold cannot seed a page background; the agent always writes it by hand.
3. **Visual-DNA drift.** Sibling apps in the same biome can diverge on background presence purely because nobody anchored the default.

## Decision

Add an optional `siteBackground` block to the biome schema and derive its defaults from biome axes when the block is absent. New apps onboarded into a biome inherit the block automatically.

### Biome schema additions

`packages/ontology/src/schemas/biome.ts`:

```ts
export const biomeSiteBackgroundLayerSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("color"),
    color: z.string().min(1).optional(),
  }).strict(),
  z.object({
    kind: z.literal("image"),
    imageName: z.string().min(1),
    fit: z.enum(["cover", "tile", "stretch-width", "stretch-height"]).optional(),
    quality: z.enum(["low", "mid", "high", "max"]).optional(),
    loading: z.enum(["eager", "lazy"]).optional(),
    tint: z.object({
      color: z.string().optional(),
      opacity: z.number().min(0).max(1).optional(),
    }).optional(),
    parallax: z.object({
      speed: z.number().min(0).max(2).optional(),
      respectReducedMotion: z.boolean().optional(),
    }).optional(),
  }).strict(),
  z.object({
    kind: z.literal("gradient"),
    direction: z.enum(["vertical", "horizontal", "radial"]),
    stops: z.array(z.object({
      at: z.number().min(0).max(1),
      color: z.string().min(1),
      opacity: z.number().min(0).max(1).optional(),
    })).min(2),
  }).strict(),
]);

export const biomeSiteBackgroundSchema = z.object({
  layers: z.array(biomeSiteBackgroundLayerSchema).min(1),
}).strict();
```

`biomeSchema` gains:

```ts
siteBackground: biomeSiteBackgroundSchema.optional(),
```

### Deriver behaviour

`biome.tokens.derive` (RFC-0071) gains a `siteBackground` step:

1. If the biome YAML already declares `siteBackground`, leave it untouched.
2. Else derive based on axes:

| `decorativeAllowed` | `photoStance` | `motionStance` | Derived `siteBackground.layers` |
| --- | --- | --- | --- |
| false | none / founder | static | one `color` layer using `--ds-color-bg` |
| false | documentary | restrained | `color` + subtle `gradient` (vignetteDark) |
| true | editorial | expressive | `color` + `gradient` with biome `accent` |
| (any) | (any) | (any) | always include `color` as bottom layer |

The deriver writes the result back into the biome YAML in place when called with `--inplace` (existing behaviour).

### New CLI surface

```sh
pnpm exec site-kernel run biome.site-background.derive \
  --biome packages/ontology/biomes/<id>.yaml \
  --inplace
```

A narrower deriver focused only on the `siteBackground` block, useful when the biome already has palette / typography but missed the new block.

### Scaffold integration

`onboarding.scaffold` (RFC-0078) reads `biome.siteBackground` and writes the matching `system.md` shell block when the new app is materialised. The app author may override the inherited block before the first page ships.

### Page-level override

Apps that want a different background per page continue to declare it in `system.md` directly; the biome default applies only when the app manifest is silent.

## Design

See `## CLI surface`, `## TypeScript contracts`, and `## File system responsibilities` above for the full biome `siteBackground` schema additions and derivation pipeline specification.

## Architectural fit

- **RFC-0025 / RFC-0071** — biome is the single source of visual DNA; this RFC extends it.
- **RFC-0098** — biome already owns shadows / gradients; site background is the next natural extension.
- **RFC-0101 + RFC-0105** — section and site backgrounds remain independent; nothing changes at the consumer side.
- **RFC-0106** — motion stance bounds parallax availability in derived defaults.

## CLI surface

```sh
pnpm exec site-kernel run biome.tokens.derive \
  --biome packages/ontology/biomes/<id>.yaml \
  --inplace
pnpm exec site-kernel run biome.site-background.derive \
  --biome packages/ontology/biomes/<id>.yaml \
  --inplace
pnpm exec site-kernel run biome.contract.validate
```

## TypeScript contracts

```ts
export type BiomeSiteBackground = z.infer<typeof biomeSiteBackgroundSchema>;
```

## File system responsibilities

| Path | Edit |
| --- | --- |
| `packages/ontology/src/schemas/biome.ts` | `biomeSiteBackgroundSchema` + `biome.siteBackground?` |
| `packages/ontology/src/index.ts` | export the new type / schema |
| `packages/os/site-kernel-checks/src/biome.ts` | `biome.contract.validate` accepts the new block |
| `packages/os/site-kernel-onboarding/src/scaffold.ts` | seed `system.md` shell.background from biome |
| `packages/ontology/biomes/handwerk-material-warm.yaml` | optional opt-in to a derived siteBackground |
| `packages/ontology/biomes/nonprofit-trust.yaml` | optional opt-in to a derived siteBackground |

## Failure modes

- A biome declares `siteBackground` without at least one layer → `biome.contract.validate` fails.
- A derived layer references an image asset missing from the consuming app's content collection → existing `resolveImage` path warns (graceful degradation per RFC-0053).
- A biome declares `parallax` on a derived layer while `motionStance: static` → RFC-0106 envelope rule denies via `section.motion.contract.validate` extension.

## Rollout

1. Land the schema additions (purely additive — existing biomes pass without changes).
2. Implement `biome.site-background.derive` with deterministic axes mapping.
3. Update `onboarding.scaffold` to consume biome defaults.
4. (Optional) Backfill the two existing biomes with explicit `siteBackground` blocks so future apps inherit them.

## Alternatives considered

- **Bake site-background into `biome.tokens.derive` without a separate command.** Considered — the separate `biome.site-background.derive` makes the step composable and easier to re-run when the axes change.
- **Author the background per-app only.** Rejected — duplicates the biome DNA across siblings and contradicts the "biome is visual DNA" principle.
- **Move site background to a global stylesheet.** Rejected — section authors lose control over per-page transparency / parallax.

## Risks

- Biomes that don't declare `siteBackground` silently inherit no default, leaving the page without a background. Mitigation: `site.background.contract.validate` can surface pages with no background when the biome declares one as recommended.
- The derivation pipeline may produce stale output if the biome YAML changes but the generator isn't re-run. Mitigation: `build:prepare` always re-runs the full generator pipeline.

## Acceptance criteria

- [x] `biomeSiteBackgroundSchema` exists and is exported. (evidence: implemented historically)
- [x] `biome.tokens.derive` produces `siteBackground` from axes when the block is absent. (evidence: implemented historically)
- [x] `biome.site-background.derive` exists as a focused command. (evidence: implemented historically)
- [x] At least one biome carries an explicit `siteBackground` block. (evidence: implemented historically)
- [x] `onboarding.scaffold` seeds `system.md` shell.background from the biome. (evidence: implemented historically)

## Implementation notes for agents

- Agents MUST NOT hand-author the `system.md` shell.background block for a new app when the biome already declares one; rely on `onboarding.scaffold` and the biome inheritance.
- Agents MUST keep biome-declared backgrounds in block-style YAML.
- Agents MUST run `biome.contract.validate` after editing the biome YAML.
