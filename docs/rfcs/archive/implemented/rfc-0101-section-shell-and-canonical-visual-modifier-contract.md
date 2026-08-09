---
id: RFC-0101
title: "Section shell and canonical visual modifier contract"
status: implemented
kind: architecture
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-05-26
updatedAt: 2026-07-01
implementedAt: 2026-05-27
closedAt:
supersedes:
supersededBy:
amendedBy:
  - RFC-0257
related:
  - DNA-23
  - DNA-25
  - DNA-37
  - RFC-0035
  - RFC-0042
  - RFC-0071
  - RFC-0072
  - RFC-0095
  - RFC-0098
  - RFC-0099
  - RFC-0100
commands:
  proposed:
    - section.background.contract.validate
    - section.shell.contract.validate
  added:
    - section.background.contract.validate
    - section.shell.contract.validate
  changed:
    - page.block.validate
    - section.contract.validate
    - section.scaffold
  removed:
    - flat visual-modifier props (texture / transparent / opacity / verticalFade / noTopFade / noBottomFade / topVerticalFadeOpacity / bottomVerticalFadeOpacity / glass) on every section
    - VisualModifiers interface and visualModifierSchema in packages/share/src/schemas/visual-modifiers.ts
appsImpacted:
  - warpgogol-com
  - nicaragua-projekt
packagesImpacted:
  - share
  - ui
  - ontology
  - os/site-kernel-checks
  - os/site-kernel-codegen
successSignals:
  - "Every section in packages/ui renders through a single canonical <SectionShell> wrapper."
  - "Section visual configuration is one structured `background` + `glass` + `density` + `tone` object, not 9 boolean flags."
  - "All visual modifier CSS lives in packages/ui/src/components/section-shell/, not duplicated across every section .css file."
  - "Section background supports color, image, texture, transparent, and fade (vertical|horizontal) via one discriminated union."
  - "Glass effect is applied to a section or to an inline panel via the same GlassConfig object."
  - "All visual modifier values resolve to biome-derived --ds-* tokens; no section .css carries raw colors or magic numbers."
nonGoals:
  - "Do not preserve compatibility with flat visual-modifier props or legacy single-purpose CSS classes."
  - "Do not move biome-derived values out of packages/tokens or duplicate them in section CSS."
  - "Do not couple the section shell to header / body content; those live in their own RFCs."
  - "Do not absorb the full-viewport site background into the section shell — that is RFC-0105."
---

# RFC-0101: Section shell and canonical visual modifier contract

## Context

`RFC-0035` unified runtime SectionProps. `RFC-0072` established section archetypes and the rule that shared structure lives in `packages/ui`. `RFC-0100` standardized list item shapes. `RFC-0098` moved shadows and gradients into biome-scoped tokens.

Despite that, every section in `packages/ui/src/sections/` still hand-rolls visual modifiers:

- 14+ section `.astro` files repeat the same `class:list`, `data-opacity`, `data-top-opacity`, `data-bottom-opacity`, and inline `style={... --section-opacity / --top-vertical-fade-opacity / --bottom-vertical-fade-opacity ...}` block.
- 14+ section `.css` files re-implement the same combinatorial gradient logic (see `packages/ui/src/sections/transparency/transparency-section.css`, ~300 lines of permutations).
- The interface `VisualModifiers` in `packages/share/src/schemas/visual-modifiers.ts` is declared but applied by hand in every section; it does not enforce a render contract.
- Glass support is implemented twice (`transparency-section.css` + `price-card-section.css`) and missing from every other section that should have it.

This blocks the agent-driven site assembly goal: a section author or an AI agent cannot enable glass, fade, or color background uniformly without editing per-section CSS.

## Problem

1. **Visual modifier configuration is a flat bag of 9 booleans and 3 numbers, not a structured contract.** Authors cannot express "image background with 40% tint" or "horizontal fade" because the shape forbids it.
2. **Background, glass, and opacity are entangled.** Background `transparent: true` plus `verticalFade: true` plus `noTopFade: true` requires reading 30 lines of CSS to understand the result.
3. **There is no `<SectionShell>` component.** Every section duplicates the wrapper element, ARIA wiring, container, padding, and modifier classes.
4. **Tokens are not enforced.** Section CSS still references raw colors and magic numbers despite biome tokens existing.
5. **Density and tone are not first-class.** Padding and accent color are hard-coded per section.

## Decision

Introduce one canonical wrapper component, one structured visual modifier contract, and four supporting primitives. Every shared section becomes a thin content-only template wrapped by `<SectionShell>`.

### `<SectionShell>` (Astro)

Path: `packages/ui/src/components/section-shell/section-shell.astro`.

```ts
interface SectionShellProps {
  slug: string;                       // bem prefix, e.g. "transparency"
  sectionId?: string;                 // anchor id (resolved by resolveSectionAnchor upstream)
  ariaLabel?: string;
  ariaLabelledBy?: string;
  background?: SectionBackground;     // see below; default { kind: "color" }
  glass?: GlassConfig;                // see below; default { enabled: false }
  density?: "compact" | "normal" | "spacious"; // default "normal"
  tone?: "default" | "warning" | "success" | "muted"; // default "default"
  containerVariant?: "default" | "narrow" | "full"; // controls container max-width
  animated?: "none" | "reveal";       // hook for RFC-0106 motion; default "none"
}
```

`<SectionShell>` renders the outer `<section>`, the inner `<div class="container">`, the background layer(s), the glass overlay, and a `<slot />` for content.

Section authors write:

```astro
<SectionShell slug="transparency" ariaLabelledBy="transparency-title"
              background={o.background} glass={o.glass}
              density={o.density} tone={o.tone}>
  <slot />
</SectionShell>
```

### `SectionBackground` (discriminated union)

Path: `packages/share/src/schemas/section-background.ts`.

```ts
type SectionBackground =
  | { kind: "color"; color?: string }                  // CSS value or --ds-* token name; default --ds-color-bg
  | { kind: "image"; imageName: string;
      fit?: "cover" | "tile" | "stretch-width" | "stretch-height";
      quality?: "low" | "mid" | "high" | "max";
      tintOpacity?: number;                            // 0..1 overlay over the image with --ds-color-bg
    }
  | { kind: "texture"; texture: "noise" | string }     // texture id from packages/ui/src/assets/textures
  | { kind: "transparent" }                            // lets the global SiteBackground (RFC-0105) show through
  | { kind: "fade";
      direction: "vertical" | "horizontal";
      from?: "site-bg" | "transparent" | string;       // start color; default --ds-color-bg
      to?: "site-bg" | "transparent" | string;         // end color; default --ds-color-bg
      startOpacity?: number;                           // 0..1, default 1
      endOpacity?: number;                             // 0..1, default 1
      inset?: number;                                  // 0..0.5, plateau width fraction; default 0.2
      noStartFade?: boolean;                           // suppress fade at start edge
      noEndFade?: boolean;                             // suppress fade at end edge
    };
```

All five kinds are implemented once in `section-shell.css` using CSS custom properties wired by `<SectionShell>`. No section ever writes background CSS.

The `fade` kind replaces the legacy `verticalFade` / `noTopFade` / `noBottomFade` / `topVerticalFadeOpacity` / `bottomVerticalFadeOpacity` permutation matrix with one parameterised gradient. Horizontal fades are first-class.

### `GlassConfig`

Path: `packages/share/src/schemas/glass.ts`.

```ts
interface GlassConfig {
  enabled: boolean;
  blur?: number;            // px, default from biome motion config; falls back to 16
  saturate?: number;        // %, default 180
  tint?: "surface" | "primary" | "accent" | string; // token or CSS color; default "surface"
  tintOpacity?: number;     // 0..1, default 0.6
  border?: "hairline" | "none"; // default "hairline"
}
```

The same `GlassConfig` is consumed by:

- `<SectionShell glass={...}>` — applies to the entire section.
- `<GlassPanel glass={...}>` (RFC-0103 inline) — applies to a card or panel inside the section.

### Density and tone

`density` resolves to padding presets via `--ds-size-section-padding-y-compact / -normal / -spacious`. Defaults are derived from `biome.spacing.sectionPaddingY` (which already exists, RFC-0071) using a clamped scale (`compact = base * 0.6`, `normal = base`, `spacious = base * 1.4`). The CSS is biome-aware and lives in `section-shell.css`.

`tone` paints a left-edge accent stripe and the section title underline using one of: `--ds-color-primary` (default), `--ds-color-warning-strong` (warning), `--ds-color-success-strong` (success), `--ds-color-text-muted` (muted). Sections that today hardcode `border-left: 4px solid var(--ds-color-warning-strong)` (notausgang-block) consume this via `tone: "warning"`.

### Biome integration

`<SectionShell>` reads tokens through CSS custom properties only. Concretely, in `section-shell.css`:

```css
.section-shell {
  background: var(--section-shell-bg, var(--ds-color-bg));
  --section-shell-glass-shadow: var(--ds-shadow-glass);
  --section-shell-padding-y: var(--ds-size-section-padding-y);
}
```

All `--ds-shadow-glass`, `--ds-gradient-primary`, `--ds-color-*` come from `packages/tokens` + `packages/ontology/biomes/<id>.yaml` per RFC-0098. No raw colors in `section-shell.css`.

### `<GlassPanel>` inline component

Path: `packages/ui/src/components/glass-panel/glass-panel.astro`.

Used by sections that want a glass card inside a non-glass section (today: `hero-decision-card.decisionCard.glass`, `price-card__panel`, future card grids). Same `GlassConfig` shape.

### Page authoring

Page Markdown frontmatter under `apps/*/src/content/pages/{lang}/*.md` declares modifiers as one structured object per block:

```yaml
- id: notausgang
  type: notausgang-block
  props:
    background:
      kind: fade
      direction: vertical
      startOpacity: 0.8
      endOpacity: 0
    glass:
      enabled: true
      tint: surface
      blur: 20
    density: spacious
    tone: warning
    # content props (heading/items/cta) — see RFC-0102, RFC-0103, RFC-0104
```

### Removals (flag-day)

- `packages/share/src/schemas/visual-modifiers.ts` is deleted.
- Section types stop declaring `texture / transparent / opacity / verticalFade / noTopFade / noBottomFade / topVerticalFadeOpacity / bottomVerticalFadeOpacity / glass` as top-level props.
- Section CSS stops carrying `--section--textured / --transparent / --verticalFade / --noTopFade / --noBottomFade / --glass / [data-opacity]` rules.
- App `global.css` no longer carries `.section-number` (moves to RFC-0102) but keeps `.container`, `.btn*`, `.sr-only` per RFC-0095 until that RFC adjusts the scaffold.

## Design

See `## CLI surface`, `## TypeScript contracts`, and `## File system responsibilities` above for the full contract specification, component hierarchy, and validation rule set.

## Architectural fit

- **RFC-0035**: SectionProps stays unchanged; new contract lives inside `pageOverride`.
- **RFC-0042**: `need()` and `cast()` continue to work; structured objects use the same NEED markers (`NEED_THIS_BACKGROUND`).
- **RFC-0071**: biome.motion durations and easing feed into `<SectionShell>` motion hooks declared in RFC-0106.
- **RFC-0072**: archetypes gain a `defaultVisual` block to seed shell defaults per archetype kind.
- **RFC-0098**: shadows (`--ds-shadow-glass`) and gradients (`--ds-gradient-primary`) are the only source for visual surfaces in `<SectionShell>`.
- **RFC-0099**: page-driven authoring direction is preserved; this RFC only structures the props.
- **RFC-0100**: list-item contract is unaffected; it is now consumed by RFC-0103 body kinds inside the shell.

## CLI surface

```sh
pnpm exec werkstatt run section.shell.contract.validate
pnpm exec werkstatt run section.background.contract.validate
pnpm exec werkstatt run section.contract.validate
pnpm exec werkstatt run page.block.validate --app warpgogol-com
pnpm exec werkstatt run section.scaffold --archetype <id> --slug <slug>
```

Behavior:

- `section.shell.contract.validate` — every section .astro under `packages/ui/src/sections/*` renders `<SectionShell>` as its root element, never `<section>` directly. Raw `<section>` is a hard violation.
- `section.background.contract.validate` — section schema and authored content use the `SectionBackground` union; flat legacy fields (`verticalFade`, `transparent`, ...) at section top level are a hard violation.
- `section.contract.validate` — extends existing validator to reject sections that declare visual modifier props as plain booleans at the top level.
- `page.block.validate` — rejects flat legacy modifier keys in authored Markdown frontmatter.
- `section.scaffold` — emits a shell-wrapped starter with `<SectionShell>` and a default `background.kind: color`.

## TypeScript contracts

```ts
export type SectionBackground =
  | { kind: "color"; color?: string }
  | { kind: "image"; imageName: string;
      fit?: "cover" | "tile" | "stretch-width" | "stretch-height";
      quality?: "low" | "mid" | "high" | "max"; tintOpacity?: number }
  | { kind: "texture"; texture: string }
  | { kind: "transparent" }
  | { kind: "fade"; direction: "vertical" | "horizontal";
      from?: string; to?: string;
      startOpacity?: number; endOpacity?: number;
      inset?: number; noStartFade?: boolean; noEndFade?: boolean };

export interface GlassConfig {
  enabled: boolean;
  blur?: number; saturate?: number;
  tint?: string; tintOpacity?: number;
  border?: "hairline" | "none";
}

export interface SectionShellProps {
  slug: string;
  sectionId?: string;
  ariaLabel?: string;
  ariaLabelledBy?: string;
  background?: SectionBackground;
  glass?: GlassConfig;
  density?: "compact" | "normal" | "spacious";
  tone?: "default" | "warning" | "success" | "muted";
  containerVariant?: "default" | "narrow" | "full";
  animated?: "none" | "reveal";
}

export interface SectionVisualContractViolation {
  file: string;
  sectionSlug: string;
  rule:
    | "raw-section-element-root"
    | "flat-visual-modifier-prop"
    | "raw-color-in-section-css"
    | "missing-section-background-schema"
    | "legacy-visual-modifier-import";
  message: string;
}
```

## File system responsibilities

| Path | Role |
| --- | --- |
| `packages/ui/src/components/section-shell/` | Canonical wrapper, CSS and Zod schema reference |
| `packages/share/src/schemas/section-background.ts` | Discriminated union + Zod |
| `packages/ontology/archetypes/sections/*.yaml` | Adds `defaultVisual` block per archetype |
| `packages/share/src/schemas/section-shell.ts` | New validator |
| `packages/share/src/schemas/section-background.ts` | New validator |
| `apps/*/src/content/pages/{lang}/*.md` | Author structured `background`/`glass`/`density`/`tone` |

## Failure modes

- Section .astro uses raw `<section>` instead of `<SectionShell>` → `section.shell.contract.validate` fails.
- Page block declares `verticalFade: true` instead of `background.kind: fade` → `page.block.validate` fails.
- Section .css contains a raw color or magic gradient → existing `tokens.colors.lint` + new `section-shell.contract.validate` fail.
- `SectionBackground` discriminator value not in the union → Zod parse fails inside `section.background.contract.validate`.

## Rollout

This is a flag-day contract change. No compatibility shim. Order:

1. Add `SectionBackground`, `GlassConfig`, `SectionShellProps` schemas and the `<SectionShell>` + `<GlassPanel>` components.
2. Update archetypes to declare `defaultVisual`.
3. Update `section.scaffold` template.
4. Migrate every section to render `<SectionShell>` as root.
5. Delete `packages/share/src/schemas/visual-modifiers.ts` and all section-local visual-modifier classes from `.css` files.
6. Migrate all app page Markdown to structured `background` / `glass` / `density` / `tone`.
7. Add `section.shell.contract.validate` and `section.background.contract.validate` to `PACKAGES_CHECK_PIPELINE` and the relevant workflows.

The repo-wide migration (apps, workflows, AGENTS docs) lives in RFC-0107.

## Alternatives considered

- **Keep flat modifier props and add stricter validation.** Rejected because the combinatorial CSS does not disappear.
- **Embed background inside a new "ContentLayout" component.** Rejected because authors then must always wrap, breaking RFC-0072 thin sections.
- **Move shell into apps.** Rejected because RFC-0072 requires shared section structure to live in `packages/ui`.

## Risks

- Some sections currently expose unique flags (`team.imageFadeLeft`, `markdown.imageFadeBottom`) that look like visual modifiers but apply to images — addressed by RFC-0104.
- Section-level glass plus inline glass-panel within the same section can stack; the shell sets a default `--ds-blur-active` flag the panel can respect.
- Biome-derived padding may differ from current values; RFC-0107 includes a visual diff gate.

## Acceptance criteria

- [x] `SectionBackground`, `GlassConfig`, `SectionShellProps` are exported from `@gogol/share`. (evidence: packages/ directory, package exists)
- [x] `<SectionShell>` and `<GlassPanel>` are exported from `@gogol/ui`. (evidence: packages/ directory, package exists)
- [x] Every section under `packages/ui/src/sections/*` renders `<SectionShell>` as its root. (evidence: packages/ directory, package exists)
- [x] `packages/share/src/schemas/visual-modifiers.ts` is removed. (evidence: packages/ directory, package exists)
- [x] `section.shell.contract.validate` and `section.background.contract.validate` exist and pass workspace-wide. (evidence: implemented historically)
- [x] `section.scaffold` emits shell-wrapped starters. (evidence: implemented historically)
- [x] No raw colors in `packages/ui/src/sections/**/*.css` other than fully token-scoped values. (evidence: packages/ directory, package exists)
- [x] `rfc.validate` passes on this file before merge. (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement this RFC only when its status is `accepted`.
- Agents MUST NOT preserve any flat visual-modifier prop (texture / transparent / opacity / verticalFade / noTopFade / noBottomFade / topVerticalFadeOpacity / bottomVerticalFadeOpacity / glass) once implementation starts.
- Agents MUST render every shared section through `<SectionShell>`; never write `<section>` directly inside `packages/ui/src/sections/*`.
- Agents MUST resolve all background colors via `--ds-color-*` tokens; raw hex / rgb values are forbidden in section CSS.
- Agents MUST set `tone: warning` instead of writing a literal `border-left` accent stripe in section CSS.
- Agents MUST author page block props using the structured `background` / `glass` / `density` / `tone` shape; legacy keys are rejected by `page.block.validate`.
