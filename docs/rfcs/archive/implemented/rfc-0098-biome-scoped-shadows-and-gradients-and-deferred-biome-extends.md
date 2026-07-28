---
id: RFC-0098
title: "Biome-scoped shadows and gradients"
status: implemented
kind: contract
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-05-24
updatedAt: 2026-06-04
implementedAt: 2026-05-24
closedAt:
supersedes: []
supersededBy:
related:
  - RFC-0023
  - RFC-0025
  - RFC-0071
appsImpacted:
  - nicaragua-projekt
  - warpgogol-com
packagesImpacted:
  - ontology
  - os/site-kernel-codegen
  - tokens
successSignals:
  - Every `--ds-shadow-*` and `--ds-gradient-*` referenced by `@gogol/ui` resolves to the biome's value (not a nicaragua-tinted studio default).
  - Adding a new biome with a different `shadows` / `gradients` set changes the rendered shadows on every consuming site without code edits.
  - Two existing apps build byte-identical to before the refactor (for nicaragua) and gain a coherent warm-material elevation language (for warpgogol-com).
nonGoals:
  - Removing `@gogol/tokens` studio defaults — they remain the fallback when a biome doesn't declare a key.
  - Implementing `biome.extends` — that decision stays deferred (see § biome.extends).
  - Backfilling shadows / gradients in every consumer component — existing `var(--ds-shadow-md)` references resolve to the new biome-scoped values automatically.
---

# RFC-0098: Biome-scoped shadows and gradients

## Context

Two original ecosystem decisions were deferred until a second real onboarding existed:

1. **`biome.extends`** — letting a biome inherit from a parent in the same family. Deferred until two biomes in the same family existed.
2. **Promote semantic gradients/shadows into the biome schema** — deferred until the second onboarding revealed which tokens are actually shared between sites.

After the May 2026 warpgogol-com onboarding, the second condition is met and the first is not:

- `packages/ontology/biomes/` carries `nonprofit-trust` (family: `charity-donation-trust`) and `handwerk-material-warm` (family: `handwerk-trust-engineering`). **Different families.**
- `packages/tokens/src/tokens.css` holds 8 shadow tokens and 3 gradient tokens. The gradient defaults bake nicaragua's brand RGB into the studio: `--ds-gradient-primary: linear-gradient(135deg, rgb(26 67 50) 0%, rgb(45 90 69) 100%)` is the nicaragua brand green, not a generic value.
- `handwerk-material-warm.yaml` has NO `components`, `shadows`, or `gradients` block at all. warpgogol-com inherits the nicaragua-tinted gradients silently — a visible cross-app leak.

## Problem

1. **Studio tokens carry app-specific brand colors.** `--ds-gradient-primary`'s default is nicaragua's green. warpgogol-com (warm brown) reading the same default is wrong; the fix is per-app, but the fix surface should be the biome, not the app.
2. **Shadows are visual-DNA, not a workspace constant.** A "warm material handwerk" biome wants softer, browner shadow tints than a "documentary nonprofit" biome. Hardcoding `--ds-shadow-md: 0 4px 20px rgb(26 32 44 / 0.12)` in studio tokens denies biome authors that lever.
3. **`biome.components` already covers per-component colors, but shadows and gradients live elsewhere.** That asymmetry pushes biome authors to override via app-local CSS instead of declaring in the biome.

## Decision

Promote `shadows` and `gradients` from studio tokens into the biome schema as optional blocks. The studio `tokens.css` keeps the existing values as fallback when a biome doesn't declare a key (back-compat). When the biome declares the key, the biome wins via the `@layer biome.<id>` cascade.

### Biome schema additions

```ts
biomeShadowsSchema = z.object({
  sm: cssValue.optional(),
  md: cssValue.optional(),
  lg: cssValue.optional(),
  xl: cssValue.optional(),
  glass: cssValue.optional(),
  glow: cssValue.optional(),
  header: cssValue.optional(),
  appeal: cssValue.optional(),
}).strict().optional();

biomeGradientsSchema = z.object({
  accent: cssValue.optional(),
  primary: cssValue.optional(),
  vignetteDark: cssValue.optional(),
}).strict().optional();
```

Both blocks are optional at every level — biomes that don't care about elevation/gradients omit them, and the studio fallback applies.

### biome.css.generate mapping

`packages/os/site-kernel-codegen/src/biome-css.ts` adds 11 new dotted-path entries:

```
shadows.sm     → --ds-shadow-sm
shadows.md     → --ds-shadow-md
shadows.lg     → --ds-shadow-lg
shadows.xl     → --ds-shadow-xl
shadows.glass  → --ds-shadow-glass
shadows.glow   → --ds-shadow-glow
shadows.header → --ds-shadow-header
shadows.appeal → --ds-shadow-appeal
gradients.accent       → --ds-gradient-accent
gradients.primary      → --ds-gradient-primary
gradients.vignetteDark → --ds-gradient-vignette-dark
```

Each biome's `biome.css.generate` output now overrides the studio default in the `@layer biome.<id>` cascade.

### Concrete values

**nonprofit-trust.yaml** — preserves the existing visual identity by porting the values currently in `tokens.css` 1:1 into the biome (no rendered diff for nicaragua-projekt).

**handwerk-material-warm.yaml** — defines softer, browner shadows (`rgb(58 38 22 / …)` tint) and brand-derived gradients (linear from the brand brown `#7A4A2A` and accent green `#1E4D3B`) appropriate to the "warm material" axis.

## Design

See `## Decision` above for the full biome schema additions, `biome-css.ts` mapping table, and concrete values for each biome.

## Architectural fit

- **RFC-0023** defined the design-system token cascade. This RFC extends biome.components' scope to shadows + gradients without disturbing the cascade.
- **RFC-0025 / RFC-0071** introduced biome.generated.css and the layer order. This RFC's outputs land in the existing `@layer biome.<id>` block via the existing codegen path.

## biome.extends — still deferred

The two biomes in the workspace today belong to different families. `biome.extends` would let a biome inherit from a parent in the same family — useful when, say, `nonprofit-trust-dark` shares everything with `nonprofit-trust` except a few inverted color tokens. Until two biomes in the same family actually exist, every implementation choice would be theoretical.

Conditions for promoting `biome.extends` from "deferred" to "RFC-0099 (or later)":

- At least two biomes in `packages/ontology/biomes/` declare the same `family: <id>`.
- The pair shares more tokens than it diverges on (otherwise extension adds cost without removing duplication).
- A real visual-DNA decision exists to encode (e.g. dark mode variant, regional flavor) — not a hypothetical.

When those land, the schema change is small (one new `extends?: kebabId` field; one resolver step that deep-merges parent's tokens before applying the child's overrides; one cycle-detection check). For now, the existing manual approach (copy-paste-modify) covers the only legitimate use case (a single biome per family) without false economy.

## Rollout

1. Land schema additions in `packages/ontology/src/schemas/biome.ts` (`biomeShadowsSchema`, `biomeGradientsSchema`).
2. Land codegen mapping in `packages/os/site-kernel-codegen/src/biome-css.ts`.
3. Populate `nonprofit-trust.yaml` and `handwerk-material-warm.yaml` with their respective shadow + gradient blocks.
4. Re-run `biome.css.generate` for both apps; assert nicaragua's biome.generated.css matches the previous baseline (no rendered diff) and warpgogol-com gains the new handwerk-specific values.
5. Verify `pnpm build` workspace-wide is clean.

## Alternatives considered

- **Strip nicaragua-specific gradients from studio tokens entirely.** Would force every biome to declare them or accept blank gradients. Migration risk for any consumer not yet covered. Optional + fallback keeps the move safe.
- **Add `gradients` as a free-form `Record<string, string>` in biome.** Loses type safety; promotes biome-key drift across files. Closed enum is friendlier.
- **Use CSS `light-dark()` instead of biome scope.** Solves a different problem (dark mode within one biome), not cross-biome divergence.

## Risks

- A biome forgets to declare a gradient and the page silently falls back to nicaragua's brand-tinted default. Mitigation: a future `biome.coverage.hint` could surface "your biome inherits a gradient that names another brand's RGB"; the studio defaults will eventually become uncolored / `currentColor`-based fallbacks. Not in v1.
- Existing component CSS still references `--ds-shadow-md` etc; if a biome forgets to set `shadows.md`, the studio default fires. Same fallback semantics as today — no regression.

## Acceptance criteria

- [x] `biomeShadowsSchema` and `biomeGradientsSchema` exported from `packages/ontology/src/schemas/biome.ts`. (evidence: packages/ directory, package exists)
- [x] `biomeSchema` accepts optional `shadows` and `gradients` blocks. (evidence: implemented historically)
- [x] `biome-css.ts` BIOME_KEY_TO_CSS_VAR map carries 8 shadow + 3 gradient entries. (evidence: implemented historically)
- [x] `nonprofit-trust.yaml` carries the previously-studio-default values for shadows + gradients (1:1 port). (evidence: implemented historically)
- [x] `handwerk-material-warm.yaml` carries handwerk-specific shadow + gradient values. (evidence: implemented historically)
- [x] `biome.css.generate --app warpgogol-com` and `--app nicaragua-projekt` emit `--ds-shadow-*` and `--ds-gradient-*` from their respective biomes. (evidence: original apps retired by RFC-0381, implemented historically)
- [x] `pnpm build` workspace-wide passes. (evidence: implemented historically)
- [x] `biome.extends` remains deferred; this RFC documents the conditions for promotion. Tracked separately. (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement this RFC ONLY when status: accepted.
- Agents MUST NOT change RFC status.
- When adding a new biome, populate `shadows` and `gradients` from the biome's visual-DNA brief if elevation / brand gradients are part of the visual language. Omit the blocks when the biome inherits studio defaults intentionally.
- Do NOT add per-app `--ds-shadow-*` / `--ds-gradient-*` declarations in `apps/<id>/src/styles/global.css`. The biome layer is the right place; promote any app-local exception by extending the biome YAML, not by overriding in app CSS.
- The `biome.extends` field is intentionally absent. Adding it later is a small schema change; do not pre-implement against an undecided design surface.
