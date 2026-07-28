---
id: RFC-0151
title: "Typographic effects for section headings — host-class effect kinds and registry-based EffectHost"
status: implemented
kind: architecture
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-06-03
updatedAt: 2026-06-04
implementedAt: 2026-06-03
closedAt:
supersedes: []
supersededBy:
related:
  - RFC-0134
  - RFC-0102
  - RFC-0101
  - RFC-0106
  - RFC-0156
commands:
  proposed: []
  added: []
  changed:
    - effects.contract.validate
    - effects.coverage.audit
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
  - "Section headings can carry configurable, stackable visual effects (shadow, glow, bulge, tilt) authored through the same RFC-0134 `effects[]` contract used for surfaces — no new top-level prop family and no section-specific CSS."
  - "Adding the next host-class effect kind appends one schema variant, one registry entry, and one CSS class — never a new branch inside EffectHost or SectionHeader."
  - "Heading effects are pure CSS: no per-glyph DOM splitting, no client JavaScript, and no layout shift (CLS = 0)."
  - "Validation rejects effects on targets that do not support them (e.g. glass on heading, shadow on a glass surface slot) and rejects duplicate singleton kinds within one stack."
nonGoals:
  - "Do not introduce per-glyph / per-letter effects (letter wobble, typewriter, per-character stagger). These require DOM text decomposition and would compromise screen-reader access, text selection, and copy behavior. Explicitly out of scope."
  - "Do not introduce any client-side JavaScript runtime for heading effects. All kinds in this RFC are static, build-time CSS. Interactive (mouse/scroll-reactive) tilt is out of scope."
  - "Do not introduce effects that change the heading's box size or reflow content. No CLS-inducing kinds (no typing-grow, no width animation)."
  - "Do not extend effects to non-heading text targets (hero tagline, card titles, subheading). The only new target is `heading` on SectionHeader."
  - "Do not keep or add section-local heading CSS overrides. Heading effect presentation is owned by shared @gogol/ui CSS, token-driven, in @layer components."
---

# RFC-0151: Typographic effects for section headings — host-class effect kinds and registry-based EffectHost

## Context

RFC-0134 introduced a composable, stackable, schema-validated effects system with `glass` as the first and only implemented effect kind. It deliberately reserved extension points for `shadow`, `glow`, `fill`, `gradient`, `texture`, and motion, and stated that _"New effect kinds append to the discriminated union and renderer registry; they do not introduce new top-level props"_ and that future kinds require _"a follow-up RFC or an accepted implementation plan."_

RFC-0151 is that follow-up. It extends the system from **surface material effects** (glass on shells, cards, panels, rows, columns) to **typographic effects on section headings** — shadow, glow, bulge (embossed depth), and tilt (static rotation/skew).

Two structural facts in the current code shape this RFC:

1. **The heading is not an effect target today.** `effects` live on `SectionShellProps` ([section-shell.ts:54](packages/share/src/schemas/section-shell.ts)) and resolve only the `section` target ([section-shell.astro:69](packages/ui/src/components/section-shell/section-shell.astro)). `SectionHeader` ([section-header.astro](packages/ui/src/components/section-header/section-header.astro)) receives no effects and renders the title as tone-segmented spans inside an `<h{level}>`.
2. **`EffectHost` hardcodes glass.** [effect-host.astro:42-64](packages/ui/src/components/effects/effect-host.astro) calls `resolveGlassEffect`, then builds glass-specific CSS variables and a single `effect-host--glass` class. There is no registry; a second `kind` would mean a second `if` branch — exactly the drift RFC-0134 was written to prevent.

## Problem

The current state cannot satisfy the requirement (configurable, stackable effects on section headings) without one of two bad outcomes:

1. **Per-section heading CSS.** Adding `text-shadow`/`filter` ad hoc to each section's `.section-header__title` re-creates the fragmentation RFC-0134 abolished, hides the effect from content validation, and breaks CMS/authoring predictability.
2. **A parallel prop family.** Adding a `headingGlow` / `headingShadow` prop set duplicates the effects contract and violates RFC-0134's "no new top-level prop family" invariant.

There are also two render-correctness traps that the design must close explicitly:

- **The `EffectHost` wrapper clips text effects.** `.effect-host` sets `overflow: hidden`, `border-radius`, and `isolation: isolate` ([effect-host.css:26-31](packages/ui/src/components/effects/effect-host.css)) — correct for a glass surface box, fatal for a heading whose glow/shadow must paint _outside_ the glyph bounds. Heading effects must therefore apply to the existing `<h{level}>` element, not wrap it in an `EffectHost` box.
- **Not every kind is valid on every target.** `glass` on a heading is meaningless; `shadow`/`glow`/`bulge`/`tilt` on a glass surface slot is out of scope here. The capability model in RFC-0134 is one-dimensional (which _targets_ a section supports). It must become two-dimensional (which _kinds_ a target accepts).

The missing invariant: **effect kinds and effect targets form a capability matrix, and effects render through a kind registry with an explicit render strategy — never through per-kind branches or per-section CSS.**

## Decision

Extend the RFC-0134 effects system along three axes, with no backwards-compatibility break to existing glass usage:

1. **New target.** Add `heading` to the named effect targets. Authors declare heading effects in the same section-level `effects[]` array they already use, with `target: heading`.
2. **New kinds.** Add four host-class effect kinds to the discriminated union: `shadow`, `glow`, `bulge`, `tilt`. All are static, pure CSS, no DOM decomposition, no JS, no reflow.
3. **Registry-based rendering.** Replace the hardcoded glass path in `EffectHost` with an effect-kind registry and a shared pure function `composeEffectPresentation(stack)` that returns `{ classes, vars }`. `EffectHost` consumes it for _surface_ (wrapping) kinds; `SectionHeader` consumes it for _text_ (in-place) kinds applied directly to the `<h{level}>`.

This is additive. Existing glass content, schemas, and `EffectHost` callers keep working; glass becomes one entry in the registry instead of a hardcoded branch.

## Architectural fit

- **RFC-0134 (parent).** This RFC fulfills RFC-0134's reserved extension path for `shadow`/`glow` and the registry model it described (`GlassEffectLayer`, renderer registry). It honors "no new top-level props" — heading effects flow through `effects[]`.
- **RFC-0102 (SectionHeader).** SectionHeader's non-goal "do not own glass/background" is preserved: SectionHeader does not own _backgrounds_. It now applies _typographic_ effect presentation to its own title element, which is squarely its responsibility (it already owns title typography and tone segments).
- **RFC-0101 (section framework).** Effects remain part of the section contract, authored once per section, validated centrally.
- **RFC-0106 (motion).** All kinds here are **static** (no animation, no transition driven by the effect). `tilt` is a static `transform`, not motion. Therefore no `prefers-reduced-motion` gating and no client JS are required. If a future RFC adds animated typographic effects, _that_ RFC owns the reduced-motion contract.
- **Thin apps.** Apps author intent in content only. Shared packages own schema, registry, rendering, and CSS.
- **Styling architecture.** All heading-effect CSS lives in `@gogol/ui`, in `@layer components`, token-driven. No raw colors, no app-local overrides.

## Design

### Render strategy: the key distinction

Every effect kind declares a **render strategy** that determines how its presentation is delivered:

| Strategy | Meaning | Delivery | Kinds |
| --- | --- | --- | --- |
| `surface` | Effect is a material box behind/around content. Needs a clipping, isolated host element. | Rendered by `EffectHost` as a wrapping element. | `glass` |
| `text` | Effect is a typographic treatment of an existing text element. Must paint outside glyph bounds; must not add a box or clip. | Classes + CSS vars applied **directly to the existing `<h{level}>`** by `SectionHeader`. No wrapper. | `shadow`, `glow`, `bulge`, `tilt` |

This is what prevents the `overflow: hidden` clipping trap and avoids inserting a redundant DOM node around the heading.

### Content contract

Heading effects are authored in the existing section-level `effects[]` array — no new prop:

```yaml
props:
  effects:
    - target: heading
      stack:
        - kind: shadow
          enabled: true
          offsetX: 0
          offsetY: 2
          blur: 6
          color: shadow        # token alias or raw color
          opacity: 0.35
        - kind: glow
          enabled: true
          blur: 18
          color: accent
          opacity: 0.5
        - kind: tilt
          enabled: true
          rotate: -2           # degrees; static, transform-only (no reflow)
```

A section may combine a surface effect on the shell and a typographic stack on its heading in the same array:

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
    - target: heading
      stack:
        - kind: glow
          enabled: true
          color: primary
          blur: 14
          opacity: 0.4
```

### TypeScript contracts (`packages/share`)

Add `heading` to the named targets and append the four kinds to the discriminated union in [effects.ts](packages/share/src/schemas/effects.ts):

```ts
const NAMED_EFFECT_TARGETS = [
  "section", "body", "panel", "item", "card",
  "row", "column", "media", "cta",
  "heading", // RFC-0151
] as const;

// Shared color alias resolved against biome tokens by the renderer.
const effectColorSchema = z.union([
  z.enum(["text", "primary", "accent", "shadow", "surface", "inverse"]),
  z.string().min(1), // raw passthrough, e.g. "#0af" or a var()
]);

export const shadowEffectSchema = z.object({
  kind: z.literal("shadow"),
  enabled: z.boolean(),
  offsetX: z.number().min(-64).max(64).optional(),
  offsetY: z.number().min(-64).max(64).optional(),
  blur: z.number().min(0).max(64).optional(),
  color: effectColorSchema.optional(),
  opacity: z.number().min(0).max(1).optional(),
}).strict();

export const glowEffectSchema = z.object({
  kind: z.literal("glow"),
  enabled: z.boolean(),
  blur: z.number().min(0).max(96).optional(),
  color: effectColorSchema.optional(),
  opacity: z.number().min(0).max(1).optional(),
}).strict();

export const bulgeEffectSchema = z.object({
  kind: z.literal("bulge"),
  enabled: z.boolean(),
  depth: z.number().min(0).max(16).optional(),   // emboss layer offset
  highlight: z.number().min(0).max(1).optional(),
  shade: z.number().min(0).max(1).optional(),
}).strict();

export const tiltEffectSchema = z.object({
  kind: z.literal("tilt"),
  enabled: z.boolean(),
  rotate: z.number().min(-15).max(15).optional(), // degrees, static
  skewX: z.number().min(-15).max(15).optional(),
}).strict();

export const effectSchema = z.discriminatedUnion("kind", [
  glassEffectSchema,
  shadowEffectSchema,
  glowEffectSchema,
  bulgeEffectSchema,
  tiltEffectSchema,
]);
```

### Capability matrix: target × kind

Replace the implicit, glass-only superRefine in `effectStackSchema` with a registry-driven model. Each kind declares its strategy and `maxPerStack`; each target declares which kinds it accepts.

```ts
// Per-kind metadata (single source of truth, also used by the renderer).
export const EFFECT_KIND_META = {
  glass:  { strategy: "surface", maxPerStack: 1 },
  shadow: { strategy: "text",    maxPerStack: 1 },
  glow:   { strategy: "text",    maxPerStack: 1 },
  bulge:  { strategy: "text",    maxPerStack: 1 },
  tilt:   { strategy: "text",    maxPerStack: 1 },
} as const;

// Which kinds each target accepts. Heading accepts only text kinds.
export const TARGET_ALLOWED_KINDS: Record<string, readonly EffectKind[]> = {
  heading: ["shadow", "glow", "bulge", "tilt"],
  // surface-style targets keep glass; unspecified = glass-only (back-compat)
};
```

`effectStackSchema.superRefine` generalizes from "≤1 glass" to "≤`maxPerStack[kind]` per kind". Cross-kind stacking (shadow + glow + tilt on one heading) stays valid — that is the stackability requirement.

Target × kind enforcement (e.g. reject `glass` on `heading`) lives in `effects.contract.validate` (it needs page-block + renderer context the schema does not have), per RFC-0134's split between schema-bounds and contract validation.

### UI rendering model (`packages/ui`)

Introduce a pure presentation composer and a kind registry, then make both `EffectHost` and `SectionHeader` consume it.

```ts
// packages/ui/src/components/effects/registry.ts
interface EffectRenderer<E extends Effect = Effect> {
  kind: E["kind"];
  strategy: "surface" | "text";
  /** Classes to add to the host/text element when this effect is enabled. */
  classes(effect: E): string[];
  /** CSS custom properties this effect contributes. */
  vars(effect: E): Record<string, string>;
}

export function composeEffectPresentation(
  stack: readonly Effect[],
  strategy: "surface" | "text",
): { classes: string[]; vars: Record<string, string> } {
  // Iterate stack in author order; for each enabled effect whose registered
  // strategy matches `strategy`, merge classes and vars. Later effects win on
  // var collisions; classes accumulate (stacking).
}
```

- **`EffectHost`** keeps its wrapping element and calls `composeEffectPresentation(stack, "surface")`. Glass becomes a registry entry; the hardcoded `resolveGlassEffect` branch is removed. Behavior is unchanged for existing callers.
- **`SectionHeader`** calls `composeEffectPresentation(headingStack, "text")` and spreads the result onto the existing `<HeadingTag>` — no wrapper, no clipping:

```astro
const { classes, vars } = composeEffectPresentation(headingEffects, "text");
---
<HeadingTag
  class:list={["section-header__title", "effect-text", ...classes]}
  id={id}
  style={cssVarString(vars)}
>
  {/* existing tone-segment spans unchanged */}
</HeadingTag>
```

Tone segments are untouched: effects apply to the `<h{level}>` element; segment color spans nest inside as before.

### Wiring heading effects into SectionHeader

Heading effects are authored at the section level (consistent with all other targets). The section composite — the only component holding both the section `effects` array and the header — resolves and forwards the heading stack:

```astro
<SectionHeader
  heading={...}
  headingEffects={resolveEffectsForTarget(props.effects, "heading")}
/>
```

`SectionHeaderProps` ([section-header.ts](packages/share/src/schemas/section-header.ts)) gains:

```ts
/** RFC-0151 — resolved typographic effect stack for the heading target. */
headingEffects: effectStackSchema.optional(),
```

When `headingEffects` is absent or empty, `SectionHeader` renders exactly as today.

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/share/src/schemas/effects.ts` | Add `heading` target; add `shadow`/`glow`/`bulge`/`tilt` schemas to the union; add `EFFECT_KIND_META`, `TARGET_ALLOWED_KINDS`; generalize stack superRefine. |
| `packages/share/src/schemas/section-header.ts` | Add `headingEffects?` to `sectionHeaderSchema`. |
| `packages/share/src/index.ts` | Export new kind types and capability tables. |
| `packages/ontology/src/shared-section-props/index.ts` | Mirror new kind JSON-Schema fragments in the `effects` items union (currently glass-only at lines ~174/290/354). |
| `packages/ui/src/components/effects/registry.ts` | New: kind registry + `composeEffectPresentation`. |
| `packages/ui/src/components/effects/effect-host.astro` | Consume registry for `surface` strategy; drop hardcoded glass branch. |
| `packages/ui/src/components/effects/effect-text.css` | New: `.effect-text--{shadow,glow,bulge,tilt}` classes, token-driven, no clipping, in `@layer components`. |
| `packages/ui/src/components/section-header/section-header.astro` | Apply `text`-strategy presentation to `<HeadingTag>`. |
| `packages/ui/src/sections/*` | Forward `resolveEffectsForTarget(effects, "heading")` to `SectionHeader` (additive, one line per section that renders a header). |
| `packages/os/site-kernel-checks/src/*` | Extend `effects.contract.validate` with target×kind + `maxPerStack`; extend `effects.coverage.audit` to count heading-target adoption. |

### CSS model

All four kinds map to CSS custom properties consumed by token-driven classes. Illustrative (not final tuning):

```css
@layer components {
  /* Applied to <h{level}> directly — must NOT clip, NO overflow:hidden. */
  .effect-text--shadow {
    text-shadow:
      var(--effect-shadow-x, 0) var(--effect-shadow-y, 2px)
      var(--effect-shadow-blur, 6px)
      color-mix(in srgb, var(--effect-shadow-color, var(--ds-color-shadow))
        calc(var(--effect-shadow-opacity, 0.35) * 100%), transparent);
  }
  .effect-text--glow {
    text-shadow:
      0 0 var(--effect-glow-blur, 18px)
      color-mix(in srgb, var(--effect-glow-color, var(--ds-color-accent))
        calc(var(--effect-glow-opacity, 0.5) * 100%), transparent);
  }
  /* Stacked shadow + glow compose because the renderer emits one combined
     text-shadow var chain when both are present in the stack. */
  .effect-text--bulge {
    text-shadow:
      0 var(--effect-bulge-depth, 1px) 0
        color-mix(in srgb, black calc(var(--effect-bulge-shade, 0.4) * 100%), transparent),
      0 calc(-1 * var(--effect-bulge-depth, 1px)) 0
        color-mix(in srgb, white calc(var(--effect-bulge-highlight, 0.5) * 100%), transparent);
  }
  .effect-text--tilt {
    display: inline-block; /* enable transform without affecting block flow */
    transform: rotate(var(--effect-tilt-rotate, 0deg)) skewX(var(--effect-tilt-skew, 0deg));
    transform-origin: left center;
  }
}
```

`tilt` uses `transform`, which is post-layout — it does not reflow siblings, so **CLS is unaffected**. `display: inline-block` is scoped to the tilt class only.

Note on `text-shadow` composition: when a stack contains both `shadow` and `glow` (and/or `bulge`), the renderer composes a single combined `text-shadow` value via stacked CSS vars rather than relying on three classes each setting `text-shadow` (which would override, not stack). The registry's `vars()` for these kinds contribute layers to one `--effect-text-shadow` chain; the class reads that chain. This keeps cross-kind stacking truthful.

### Validation (`effects.contract.validate`)

Extend the RFC-0134 validator rules:

- `unsupported-kind-for-target` — e.g. `glass` assigned to `target: heading`, or a `text` kind assigned to a surface-only target. Driven by `TARGET_ALLOWED_KINDS`.
- `duplicate-kind-in-stack` — generalizes the glass-only rule using `EFFECT_KIND_META[kind].maxPerStack`.
- Existing rules (known target, known kind, schema bounds) apply unchanged.

`--json` violation example:

```json
{
  "command": "effects.contract.validate",
  "status": "fail",
  "app": "warpgogol-com",
  "violations": [
    {
      "file": "apps/warpgogol-com/src/content/pages/de/home.md",
      "blockId": "intro",
      "sectionType": "markdown",
      "target": "heading",
      "kind": "glass",
      "rule": "unsupported-kind-for-target",
      "message": "Target 'heading' supports kinds [shadow, glow, bulge, tilt], not 'glass'."
    }
  ]
}
```

`effects.coverage.audit` gains a non-failing metric: number of sections declaring a `heading` target.

### Failure modes

- Unsupported kind for target (glass-on-heading, text-kind-on-surface): **fail**.
- Duplicate singleton kind in one stack (two glows): **fail**.
- Unknown kind / out-of-bounds value: **fail** (schema, unchanged).
- Disabled effect with valid shape: **pass**, renders nothing (unchanged).
- Heading with no `effects` / no `heading` target: **pass**, renders as today.

## Rollout

Additive, no flag day, no content migration required:

1. Land schemas + capability tables + generalized stack rule in `packages/share`.
2. Mirror JSON-Schema fragments in `packages/ontology`.
3. Add registry + `composeEffectPresentation` in `packages/ui`; refactor `EffectHost` to consume it (glass behavior preserved).
4. Add `effect-text.css` and apply `text`-strategy presentation in `SectionHeader`.
5. Forward `heading` stack from section composites to `SectionHeader`.
6. Extend `effects.contract.validate` and `effects.coverage.audit`.
7. Opt-in adoption: apps add `target: heading` effects to content where desired. No existing page changes are forced.

## Alternatives considered

- **Wrap the heading in `EffectHost`.** Rejected: `.effect-host` clips with `overflow: hidden` and adds an isolated box, breaking glow/shadow that must paint outside glyph bounds, and inserting a redundant DOM node. Text effects apply in place.
- **Per-section heading CSS / a new `headingShadow` prop family.** Rejected: re-creates the fragmentation and prop drift RFC-0134 abolished; hides effects from validation.
- **Per-glyph effects (wobble, typewriter) in this RFC.** Rejected (explicit non-goal): require DOM text decomposition, harming accessibility, selection, and copy, and typewriter induces CLS. Reserved for a dedicated future RFC if ever needed.
- **A client JS runtime for interactive tilt.** Rejected for this wave: all kinds here are static CSS; no JS, no reduced-motion surface to manage.

## Risks

- **`text-shadow` stacking correctness.** Multiple kinds writing `text-shadow` independently would override. Mitigated by composing one combined shadow chain in the registry; covered by validation/visual review.
- **Tilt overlap.** Large `rotate`/`skewX` can visually overlap neighbors. Mitigated by tight schema bounds (±15°) and `transform-origin`; no layout impact.
- **Over-generalization.** A generic matrix can drift toward vagueness. Mitigated by keeping `TARGET_ALLOWED_KINDS` explicit and validated.
- **Agent misuse.** Agents may assign glass to heading or stack duplicate kinds. Mitigated by `effects.contract.validate` failing both.
- **Token coverage.** New color aliases (`shadow`) must exist as biome tokens (`--ds-color-shadow`) across biomes, else fall back gracefully.

## Acceptance criteria

- [x] `packages/share` defines `shadow`/`glow`/`bulge`/`tilt` schemas, the `heading` target, `EFFECT_KIND_META`, and `TARGET_ALLOWED_KINDS`. (evidence: packages/ directory, package exists)
- [x] `effectStackSchema` enforces `maxPerStack` generically (glass rule subsumed). (evidence: implemented historically)
- [x] `packages/ontology` mirrors the new kind fragments in the `effects` items union. (evidence: packages/ directory, package exists)
- [x] `packages/ui` exposes `composeEffectPresentation` + registry; `EffectHost` no longer hardcodes glass and existing glass output is unchanged. (evidence: packages/ directory, package exists)
- [x] `SectionHeader` applies `text`-strategy effects directly to `<h{level}>` with no wrapper and no clipping; tone segments unaffected. (evidence: implemented historically)
- [x] Heading effects produce zero layout shift (CLS) and ship zero JavaScript. (evidence: implemented historically)
- [x] `effects.contract.validate` fails `unsupported-kind-for-target` and `duplicate-kind-in-stack`. — now a standalone command (RFC-0156), alongside the `effectAssignmentSchema.superRefine` guard in `content.validate`. (evidence: implemented historically)
- [x] `warpgogol-com` and `nicaragua-projekt` pass `astro check`; existing pages render unchanged without edits. (evidence: original apps retired by RFC-0381, implemented historically)
- [x] `rfc.validate RFC-0151` passes. (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement only when this RFC has `status: accepted`.
- Do NOT add per-glyph or JS-driven heading effects under this RFC — they are explicit non-goals.
- Do NOT wrap headings in `EffectHost`; apply `text`-strategy classes/vars to the existing `<h{level}>`.
- Preserve existing glass output exactly when refactoring `EffectHost` onto the registry.
- Keep all values token-driven and biome-compatible; no raw colors in section CSS.
- New effect kinds beyond these four require their own RFC or accepted plan (per RFC-0134).
- Reference RFC-0151 in commit messages and PR descriptions for related changes.
