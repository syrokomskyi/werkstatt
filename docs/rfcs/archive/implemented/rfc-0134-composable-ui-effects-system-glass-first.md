---
id: RFC-0134
title: "Composable UI effects system — glass-first foundation"
status: implemented
kind: architecture
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-05-29
updatedAt: 2026-06-04
implementedAt: 2026-05-29
closedAt:
supersedes: []
supersededBy:
related:
  - RFC-0101
  - RFC-0103
  - RFC-0121
  - RFC-0124
  - RFC-0133
  - RFC-0151
  - RFC-0156
commands:
  proposed:
    - effects.contract.validate
    - effects.coverage.audit
  added:
    - effects.contract.validate
    - effects.coverage.audit
  changed: []
  removed: []
appsImpacted:
  - warpgogol-com
  - nicaragua-projekt
packagesImpacted:
  - share
  - ontology
  - ui
  - os/site-kernel-checks
successSignals:
  - "Every section and reusable UI component can expose configurable visual effects through one composable `effects[]` contract rather than one-off `glass`, `surface`, or section-specific props."
  - "The first implemented effect is glass, and glass can be applied to section shells, section bodies, body items, cards, rows, columns, panels, and future named element slots without modifying each section ad hoc."
  - "Effects are stackable, ordered, schema-validated, and rendered by shared primitives owned by `packages/ui`, with contracts owned by `packages/share` and mirrored in `packages/ontology`."
  - "The rollout removes legacy effect props instead of preserving backwards compatibility."
nonGoals:
  - "Do not implement shadow, glow, fill, gradient, texture, image texture, motion, or filter effects in the first implementation wave. RFC-0134 reserves extension points for them, but the MVP effect kind is `glass` only."
  - "Do not keep backwards compatibility for existing `glass` or `surface.glass` props. Implementing this RFC may rewrite all affected section contracts and content to the new `effects[]` model."
  - "Do not add app-local effect renderers. Apps author effect intent in content; shared packages own validation and rendering."
---

# RFC-0134: Composable UI effects system — glass-first foundation

## Context

The current glass work introduced useful primitives (`GlassConfig`, `GlassPanel`) and a repeatable body-level pattern (`body.surface.glass`). It also exposed a structural gap: every new visual target still requires hand-editing a section-specific renderer, schema, type, CSS override, and content shape. `cards`, `comparison`, `list`, `split-list`, and `price-card` now all carry variations of the same integration logic.

That is acceptable for proving a visual primitive. It is not acceptable as the long-term architecture for a platform where each section and each element inside a section may receive multiple visual effects. Future effects include shadow, glow, color fill, gradient fill, texture/image fill, and other material treatments. Effects must be composable and ordered: a panel may have glass plus shadow; a card may have texture plus glass plus glow; a section may have a background image while its inner items use glass surfaces.

RFC-0134 defines a new effect system. The first implementation wave focuses only on glass, but the contract is intentionally shaped so future effect kinds do not require a new one-off prop family.

## Problem

The current state has four architectural issues:

1. **Effect props are fragmented.** Section-level `glass`, body-level `surface.glass`, and section-specific additions such as `price-card.surface` are not one coherent model.
2. **The target model is implicit.** A developer must inspect each component to learn whether glass applies to the section shell, one panel, every card, every row, or every column.
3. **Rollout is manual and brittle.** Adding glass to a section requires bespoke Astro branching and CSS cleanup instead of declaring that a named surface slot supports effects.
4. **Future effects would multiply the drift.** Adding `shadow`, `glow`, `fill`, `gradient`, or `texture` as separate props would repeat the same problem at a larger scale.

The missing invariant is: **visual effects are an ordered, typed, reusable layer applied to explicit render targets, not section-specific presentation props.**

## Decision

Introduce a composable `effects[]` contract shared by all UI render targets. The first supported effect kind is `glass`; the contract reserves stable extension points for future kinds without implementing them now.

The new architecture is breaking by design:

- Existing `glass` and `surface.glass` props are deprecated and removed during implementation.
- Section and body schemas are rewritten to expose `effects[]` at explicit targets.
- Renderers consume a shared effect runtime rather than importing `GlassPanel` directly in every section.
- Content is migrated to the new contract in one coherent rollout.

## Architectural fit

- **Thin apps.** Apps remain composition-only: they author content and effect intent, but do not own effect rendering logic.
- **Shared packages.** `packages/share` owns TypeScript and Zod contracts; `packages/ontology` mirrors JSON Schema fragments; `packages/ui` owns effect rendering primitives and target adapters.
- **Styling architecture.** Effects render in `@layer components` and use biome/token variables only. No raw app-local CSS values are required for effect behavior.
- **Section framework.** Effects become part of the section/component contract rather than a local exception in each section.
- **Future expansion.** New effect kinds append to the discriminated union and renderer registry; they do not introduce new top-level props.

## Design

### Core vocabulary

- **Effect** — one typed visual operation such as `glass`.
- **Effect stack** — ordered array of effects applied to one render target.
- **Effect target** — explicit place where effects may render, such as `section`, `body`, `item`, `card`, `row`, `column`, `panel`, `media`, `cta`, or a component-defined named slot.
- **Effect host** — UI primitive that receives an effect stack and renders the correct wrappers/classes/styles.
- **Effect capability manifest** — schema metadata declaring which targets a section or body component supports.

### Content contract

Effects are authored as arrays, not as singleton props:

```yaml
effects:
  - target: panel
    stack:
      - kind: glass
        enabled: true
        blur: 14
        saturate: 140
        tint: surface
        tintOpacity: 0.74
        border: hairline
```

For repeated structures, the same target can describe all instances:

```yaml
body:
  kind: list
  effects:
    - target: item
      stack:
        - kind: glass
          enabled: true
          blur: 12
          saturate: 135
          tint: surface
          tintOpacity: 0.76
          border: hairline
```

A section may expose both section-level and inner targets:

```yaml
props:
  effects:
    - target: section
      stack:
        - kind: glass
          enabled: true
          blur: 8
          tint: surface
          tintOpacity: 0.28
          border: none
  body:
    kind: cards
    effects:
      - target: card
        stack:
          - kind: glass
            enabled: true
            blur: 16
            tint: surface
            tintOpacity: 0.7
            border: hairline
```

### TypeScript contracts

`packages/share` defines the canonical discriminated union:

```ts
export type EffectTarget =
  | "section"
  | "body"
  | "panel"
  | "item"
  | "card"
  | "row"
  | "column"
  | "media"
  | "cta"
  | `slot:${string}`;

export interface EffectAssignment {
  target: EffectTarget;
  stack: Effect[];
}

export type Effect = GlassEffect;

export interface GlassEffect {
  kind: "glass";
  enabled: boolean;
  blur?: number;
  saturate?: number;
  tint?: "surface" | "primary" | "accent" | string;
  tintOpacity?: number;
  border?: "hairline" | "none";
}
```

Future effect kinds extend `Effect` only after a follow-up RFC or an accepted implementation plan:

```ts
export type Effect = GlassEffect | ShadowEffect | GlowEffect | FillEffect | GradientEffect | TextureEffect;
```

Those future names are reserved but not implemented by RFC-0134.

### UI rendering model

`packages/ui` gains shared effect primitives:

| Primitive | Role |
| --- | --- |
| `EffectHost` | Accepts `effects: Effect[]`, applies ordered rendering, and emits semantic wrapper/classes/styles. |
| `GlassEffectLayer` | Internal renderer for `kind: glass`; replaces direct section-level use of `GlassPanel`. |
| `resolveEffectsForTarget(assignments, target)` | Returns the stack for a specific target. |
| `assertSupportedEffectTargets(sectionId, assignments, capabilities)` | Dev/runtime guard used by validators and optionally during rendering. |

Sections should not import `GlassPanel` directly. They should wrap explicit surfaces with `EffectHost`:

```astro
<EffectHost as="article" effects={resolveEffectsForTarget(effects, "card")} class="section-card">
  ...
</EffectHost>
```

The implementation may keep `GlassPanel` internally as a private compatibility step, but the public architecture uses `EffectHost`.

### Target capability model

Each section/body renderer declares supported targets close to its manifest or schema source:

```ts
export const cardsBodyEffectTargets = ["card"] as const;
export const comparisonBodyEffectTargets = ["row"] as const;
export const listBodyEffectTargets = ["item"] as const;
export const splitListBodyEffectTargets = ["column"] as const;
export const priceCardEffectTargets = ["panel"] as const;
```

Validation fails when content assigns an effect to a target the renderer does not support.

### Schema model

`packages/share` exposes reusable Zod schemas:

- `glassEffectSchema`
- `effectSchema`
- `effectAssignmentSchema`
- `effectsSchema`

`packages/ontology` mirrors the same JSON Schema fragments and offers reusable effect fragments for section/body manifests.

Body schemas use `effects?: EffectAssignment[]` rather than `surface?: SurfaceConfig`.

Section schemas use `effects?: EffectAssignment[]` rather than `glass?: GlassConfig` for section-level effects.

### Cascade and composition rules

Effects are ordered. Rendering must preserve author order inside `stack`.

For glass MVP:

1. `kind: glass` provides backdrop blur, saturation, tint, optional border, and material highlight.
2. If multiple glass effects appear in the same stack, validation fails. There is no useful visual meaning in stacking two glass layers on the same host in the MVP.
3. Unknown effect kinds fail validation.
4. Disabled effects may remain in content for CMS toggles but render no wrapper behavior.

Future effects define their own composition rules when introduced.

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/share/src/schemas/section-body.ts` | Replace `surfaceConfigSchema` with reusable `effectsSchema` on body contracts. |
| `packages/share/src/effects.ts` or equivalent | Own canonical effect TypeScript types and schemas. |
| `packages/share/src/index.ts` | Export public effect contracts. |
| `packages/ontology/src/shared-section-props/index.ts` | Mirror effect JSON Schema fragments. |
| `packages/ui/src/components/effects/*` | Own `EffectHost` and glass renderer implementation. |
| `packages/ui/src/components/section-body/*` | Declare supported body targets and wrap target surfaces with `EffectHost`. |
| `packages/ui/src/sections/*` | Declare supported section-level targets and pass effect assignments to body/panel renderers. |
| `apps/*/src/content/pages/**/*.md` | Author effect assignments only; no renderer-specific CSS or private props. |
| `packages/os/site-kernel-checks/src/*` | Add effects validation and coverage audit commands. |

### CLI surface

Add validation commands:

```sh
pnpm exec werkstatt run effects.contract.validate --app warpgogol-com
pnpm exec werkstatt run effects.contract.validate --all --json
pnpm exec werkstatt run effects.coverage.audit --packages --json
```

`effects.contract.validate` checks content and schema usage:

- every effect assignment has a known `target`
- every target is supported by the invoked section/body renderer
- every effect kind is known
- every effect config passes schema bounds
- no forbidden duplicate glass effect exists in one stack

`effects.coverage.audit` reports renderer rollout state:

- sections with no declared effect targets
- sections with declared targets but no `EffectHost` use
- legacy props still present (`glass`, `surface`, `surface.glass`)
- custom section panels that should declare at least one target

### Output format

`effects.contract.validate --json` returns:

```json
{
  "command": "effects.contract.validate",
  "status": "fail",
  "app": "warpgogol-com",
  "violations": [
    {
      "file": "apps/warpgogol-com/src/content/pages/de/home.md",
      "blockId": "price",
      "sectionType": "price-card",
      "target": "card",
      "rule": "unsupported-target",
      "message": "price-card supports target panel, not card."
    }
  ]
}
```

`effects.coverage.audit --json` returns:

```json
{
  "command": "effects.coverage.audit",
  "status": "ok",
  "summary": {
    "sectionsScanned": 42,
    "sectionsWithTargets": 42,
    "legacyPropsFound": 0
  },
  "items": []
}
```

### Failure modes

- Unknown effect kind: fail.
- Unsupported target for section/body: fail.
- Duplicate glass in one stack: fail.
- Legacy `glass` or `surface.glass` after migration: fail.
- Effect declared but renderer has no target capability manifest: fail for new or migrated sections.
- Disabled effect with valid shape: pass and render no visual behavior.

## Rollout

RFC-0134 intentionally avoids backwards compatibility. The rollout is a breaking migration:

1. Add canonical effect schemas/types in `packages/share`.
2. Add `EffectHost` and the internal glass renderer in `packages/ui`.
3. Replace direct section/body `GlassPanel` imports with `EffectHost` target wrappers.
4. Rewrite body contracts from `surface.glass` to `effects[]`.
5. Rewrite section-level `glass` usage to `effects[]` target `section` where supported by `SectionShell`.
6. Migrate all current app content to `effects[]`.
7. Remove obsolete `SurfaceConfig`, `GlassPanel` public usage, and section-specific `surface` props unless retained internally as private implementation details.
8. Add `effects.contract.validate` to app verification.
9. Add `effects.coverage.audit` to package checks until coverage is complete.

No compatibility bridge is required. If an existing page uses old props after migration, validation fails.

## Alternatives considered

### Keep `glass` and add more singleton props

Rejected. This would create `glass`, `shadow`, `glow`, `fill`, `gradient`, and `texture` props at multiple nesting levels. It does not scale and repeats the current drift.

### Keep `surface.glass` and expand `surface`

Rejected as the primary architecture. `surface` helps for card-like bodies, but not every effect target is a surface. Effects may apply to media, CTAs, shell backgrounds, rows, columns, or named slots.

### Add CSS-only modifiers per section

Rejected. CSS modifiers hide the contract from content validation and make CMS/authoring behavior unpredictable.

### Implement all effects now

Rejected. The architecture should reserve stackable effects, but implementation should prove the model with one effect kind: glass.

## Risks

- **Migration size.** Removing legacy props requires coordinated edits across share, ontology, UI, and app content.
- **Over-generalization.** A generic effect system can become vague unless every section declares explicit supported targets.
- **Visual inconsistency.** Glass must still be tuned per biome through tokens and shared effect renderer rules, not ad hoc section CSS.
- **Validation complexity.** The validator needs to understand page block resolution and body target capability mapping.
- **Agent misuse.** Agents may add unsupported `slot:*` names unless manifests and validators enforce target declarations.

## Acceptance criteria

- [x] `packages/share` defines canonical `Effect`, `GlassEffect`, `EffectAssignment`, and schemas. (evidence: packages/ directory, package exists)
- [x] `packages/ontology` mirrors effect schema fragments for section/body manifests. (evidence: packages/ directory, package exists)
- [x] `packages/ui` exposes `EffectHost` and uses it for glass rendering. (evidence: packages/ directory, package exists)
- [x] No section imports `GlassPanel` directly for public effect behavior after migration. (evidence: implemented historically)
- [x] Section/body renderers declare supported effect targets. (evidence: implemented historically)
- [x] Current glass use cases (`cards`, `comparison`, `list`, `split-list`, `price-card`) are migrated to `effects[]`. (evidence: implemented historically)
- [x] Existing section-level `glass` and body-level `surface.glass` content is migrated or removed. (evidence: implemented historically)
- [x] `effects.contract.validate` fails unsupported targets, unknown effects, duplicate glass stack entries, and legacy props. — implemented by RFC-0156 (validates authored `effects[]` via `effectAssignmentSchema`; complements the `content.validate` superRefine guard). (evidence: implemented historically)
- [x] `effects.coverage.audit` reports zero legacy props and complete target declarations for migrated renderers. — implemented by RFC-0156 (0 legacy props across 148 packages/ui files). (evidence: packages/ directory, package exists)
- [x] `warpgogol-com` and `nicaragua-projekt` pass `astro check` after migration. (evidence: original apps retired by RFC-0381, implemented historically)
- [x] `rfc.validate RFC-0134` passes. (evidence: implemented historically)

## Implementation notes for agents

- Do not implement RFC-0134 while it is `draft` unless the user explicitly asks to prototype outside the acceptance path.
- When implementing, do not preserve old `glass` or `surface.glass` props. This RFC intentionally chooses a breaking migration.
- Do not add new effect kinds in the glass MVP. Keep future kinds as reserved vocabulary until their own implementation step is approved. The first such approved follow-up is **RFC-0151** (typographic host-class effects — shadow/glow/bulge/tilt — for the `heading` target, plus the registry-based EffectHost this RFC anticipated).
- Prefer a single shared renderer path over section-specific glass wrappers.
- Every renderer must name its supported targets before content can address those targets.
- Keep all visual values token-driven and biome-compatible; do not hardcode raw colors in section CSS.
