---
id: RFC-0105
title: "Site background as a distinct shell layer independent from section shell"
status: implemented
kind: architecture
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-05-26
updatedAt: 2026-05-27
implementedAt: 2026-05-27
closedAt:
supersedes:
supersededBy:
related:
  - DNA-25
  - RFC-0026
  - RFC-0036
  - RFC-0053
  - RFC-0098
  - RFC-0101
commands:
  proposed:
    - site.background.contract.validate
  added:
    - site.background.contract.validate
  changed:
    - archetype.registry.validate
    - page.block.validate
    - section.scaffold
  removed:
    - any implicit coupling between section-level background and global site background
    - the ambiguous shared "background" component name (renamed to site-background)
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
  - "There is one canonical shell-layer component `<SiteBackground>` that paints the global viewport background."
  - "The `<SiteBackground>` archetype lives in the constellation as a `shell` block, not as a section block (per RFC-0036)."
  - "Section-level `background` (RFC-0101) and site-level `<SiteBackground>` are independent: a section with `background.kind: transparent` lets the site background show through."
  - "Site background supports image (with fit/quality), color, gradient, and optional GSAP parallax — declared once per page."
  - "The old `background-component` slug no longer exists; nothing in apps/* imports it under the old name."
nonGoals:
  - "Do not merge site-level and section-level background into one component."
  - "Do not move site background into the section pipeline."
  - "Do not require every page to declare a site background — pages without it render solid `--ds-color-bg`."
---

# RFC-0105: Site background as a distinct shell layer independent from section shell

## Context

`packages/ui/src/components/background/background-component.astro` exists today as the only `shell`-layer block (RFC-0036). The blocks renderer detects `block.layer === "shell"` and renders such components above `<main>`. The current `background-component` lays a full-viewport image at z-index -1 with `fit: cover | tile | stretch-width | stretch-height` and quality presets.

RFC-0101 introduces `<SectionShell>` with its own `background: SectionBackground` prop. The naming collision and the question "which background does this control" must be resolved deterministically before AI agents author pages at scale.

## Problem

1. **Naming collision.** `background-component` (full-page shell) and `SectionShell.background` (per-section) read the same word for two different layers.
2. **Implicit coupling concerns.** When a section has `background.kind: transparent`, what shows through is undefined unless the site background contract is explicit.
3. **`background-component` props are not validated** against a strict schema; passthrough authoring is possible today.
4. **GSAP parallax for site background** is not supported, although the platform already loads GSAP optionally; expressive biomes (`motionStance: expressive`) would benefit.
5. **Archetype catalog** does not include a shell archetype for the site background, so `page.block.validate` cannot ensure it.

## Decision

Rename and re-scope the existing component to `<SiteBackground>`, define a strict `SiteBackgroundConfig` schema, register a `site-background` shell archetype, and codify the independence rule.

### `<SiteBackground>` (Astro)

Path: `packages/ui/src/components/site-background/site-background.astro` (renamed from `packages/ui/src/components/background/`).

```ts
export type SiteBackgroundLayer =
  | { kind: "color"; color?: string }                  // CSS value or --ds-color-* token; default --ds-color-bg
  | { kind: "image"; imageName: string;
      fit?: "cover" | "tile" | "stretch-width" | "stretch-height";
      quality?: "low" | "mid" | "high" | "max";
      loading?: "eager" | "lazy";
      tint?: { color?: string; opacity?: number };     // overlay over the image
      parallax?: { speed?: number; respectReducedMotion?: boolean }; // RFC-0106 hook
    }
  | { kind: "gradient";
      direction: "vertical" | "horizontal" | "radial";
      stops: Array<{ at: number; color: string; opacity?: number }>; // 0..1 positions
    };

export interface SiteBackgroundConfig {
  layers: SiteBackgroundLayer[];   // rendered bottom-up; at least one
  lang?: string;                   // for image resolution
}
```

Rendering order: layers paint bottom-up, all positioned `fixed; inset: 0; z-index: -1` inside a single `<div data-volume="site-bg" aria-hidden="true">` placed above `<main>`.

### Authoring as a shell block

Per RFC-0036, shell blocks have `layer: shell` and receive props directly (not wrapped in `SectionProps`). Pages declare:

```yaml
blocks:
  - id: site-bg
    type: site-background
    layer: shell                   # explicit; archetype enforces
    props:
      layers:
        - kind: color
          color: "--ds-color-bg"
        - kind: image
          imageName: "site-bg"
          fit: cover
          quality: max
          loading: eager
          tint: { color: "--ds-color-bg", opacity: 0.4 }
          parallax: { speed: 0.4 }

  # ... section blocks follow
```

### Independence rule

Site background and section background are layered:

```
[ z-index: -1 ]  SiteBackground (shell)        ← if declared
[ z-index:  0 ]  Section background            ← from SectionShell.background
[ z-index:  1 ]  Section glass overlay         ← from SectionShell.glass
[ z-index:  2 ]  Section content               ← header + body + cta
```

- A section with `background.kind: transparent` makes the section's own paint absent → SiteBackground shows through (if declared) or the page is solid `--ds-color-bg`.
- A section with `background.kind: color` covers SiteBackground completely.
- A section with `background.kind: fade` interpolates from SiteBackground (when one of the endpoints is `transparent`) to the fade endpoints.
- The two layers never share props; agents reason about them separately.

### Shell archetype

New file `packages/ontology/archetypes/components/shell/site-background.yaml`:

```yaml
id: site-background
displayName: "Site Background"
version: 1.0.0
layer: shell
description: |
  Full-viewport, page-level background. Declared at most once per page as a shell block.
propsSchema:
  $shape: zod
  shape: |
    siteBackgroundConfigSchema
acceptedCosmicNames:
  - SagittariusA
constraints:
  maxPerPage: 1
```

`archetype.registry.validate` extends to discover archetypes under both `archetypes/sections/` and `archetypes/shells/`. `page.block.validate` enforces:

- `layer: shell` is allowed only for archetypes whose YAML declares `layer: shell`.
- At most one `site-background` shell block per page.
- Section blocks never carry `layer: shell`.

### Page composition (existing route)

The thin proxy route in `apps/*/src/pages/[lang]/[...slug].astro` already calls `<BlocksRenderer>` twice — once for shell blocks, once for the rest under `<main>`. No changes needed except the renamed component path.

### Default behaviour for pages without `<SiteBackground>`

A page that does not declare a `site-background` shell block paints `--ds-color-bg` (current Astro body background, per app `global.css`). This is the documented fallback. Agents do not have to declare a site background.

### Reading SiteBackground from biomes

`SiteBackgroundConfig` is page-scoped (`apps/*/src/content/pages/{lang}/*.md`), not biome-scoped. The colors used inside it MUST be biome tokens (`--ds-color-bg`, `--ds-color-surface`, `--ds-color-primary`, etc.) — raw values are linted out. Biomes do not pick the page background; pages do. This avoids forcing two sibling sites in the same biome to share an image background.

### GSAP parallax

When `kind: image` declares `parallax: { speed: 0.4 }`, the layout orchestrator script must enable `parallax: true` via `runStandardLayoutOrchestration({ parallax: true })` (RFC-0106). The `<SiteBackground>` component emits a `data-parallax-speed="0.4"` attribute on the image layer; GSAP attaches a ScrollTrigger that updates `transform: translate3d(0, calc(scrollProgress * speed * viewportH * -1), 0)`. Respects `prefers-reduced-motion` per platform rules.

### Removals

- The directory `packages/ui/src/components/background/` is renamed to `packages/ui/src/components/site-background/`.
- The `@gogol/ui/components/background` import path is removed; downstream consumers use `@gogol/ui/components/site-background`.
- Any app declaring `type: background` in a page block is migrated to `type: site-background`.

## Design

See `## CLI surface`, `## TypeScript contracts`, and `## File system responsibilities` above for the full `<SiteBackground>` component contract, shell layer rules, and validation specification.

## Architectural fit

- **RFC-0026**: block-declarative pages unchanged; site background is one more block type.
- **RFC-0036**: shell-block contract preserved; site background is a shell block by archetype.
- **RFC-0053**: image name resolution rule preserved.
- **RFC-0098**: SiteBackground reads `--ds-gradient-*` and palette tokens from biome.
- **RFC-0101**: section-level background is strictly independent.
- **RFC-0106**: parallax flows through the orchestrator.

## CLI surface

```sh
pnpm exec site-kernel run site.background.contract.validate
pnpm exec site-kernel run archetype.registry.validate
pnpm exec site-kernel run page.block.validate --app <id>
```

Behavior:

- `site.background.contract.validate` — pages declaring `type: site-background` validate against `siteBackgroundConfigSchema`; at most one per page; layers list non-empty.
- `archetype.registry.validate` — discovers `archetypes/shells/` in addition to `archetypes/sections/`.
- `page.block.validate` — enforces `layer: shell` only on shell archetypes and `maxPerPage: 1`.

## TypeScript contracts

```ts
export const siteBackgroundLayerSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("color"), color: z.string().optional() }),
  z.object({ kind: z.literal("image"),
             imageName: z.string().min(1),
             fit: z.enum(["cover", "tile", "stretch-width", "stretch-height"]).optional(),
             quality: z.enum(["low", "mid", "high", "max"]).optional(),
             loading: z.enum(["eager", "lazy"]).optional(),
             tint: z.object({ color: z.string().optional(),
                              opacity: z.number().min(0).max(1).optional() }).optional(),
             parallax: z.object({ speed: z.number().min(0).max(2).optional(),
                                  respectReducedMotion: z.boolean().optional() }).optional() }),
  z.object({ kind: z.literal("gradient"),
             direction: z.enum(["vertical", "horizontal", "radial"]),
             stops: z.array(z.object({ at: z.number().min(0).max(1),
                                       color: z.string(),
                                       opacity: z.number().min(0).max(1).optional() })).min(2) }),
]);

export const siteBackgroundConfigSchema = z.object({
  layers: z.array(siteBackgroundLayerSchema).min(1),
  lang: z.string().optional(),
});

export type SiteBackgroundLayer = z.infer<typeof siteBackgroundLayerSchema>;
export type SiteBackgroundConfig = z.infer<typeof siteBackgroundConfigSchema>;
```

## File system responsibilities

| Path | Role |
| --- | --- |
| `packages/ui/src/components/site-background/` | Canonical site-background component (renamed) |
| `packages/share/src/schemas/site-background.ts` | `SiteBackgroundConfig` + Zod |
| `packages/ontology/archetypes/components/shell/site-background.yaml` | Shell archetype declaration |
| `packages/share/src/schemas/site-background.ts` | New validator |
| `packages/share/src/page.ts` (`PLANET_IMPORT_PATHS`) | Adds `@gogol/ui/components/site-background` |
| `apps/*/src/content/pages/{lang}/*.md` | Authors `type: site-background` block when needed |

## Failure modes

- Page declares two `site-background` shell blocks → `site.background.contract.validate` fails.
- `kind: image` without `imageName` → Zod rejects.
- Section block authored with `layer: shell` → `page.block.validate` fails.
- App imports `@gogol/ui/components/background` (old path) → workspace export check fails.

## Rollout

1. Rename component directory and update `PLANET_IMPORT_PATHS`.
2. Add `siteBackgroundConfigSchema` to `@gogol/share`.
3. Add the `site-background` shell archetype.
4. Extend `archetype.registry.validate` to discover shell archetypes.
5. Add `site.background.contract.validate` validator.
6. Migrate any current consumer (search the repo for `type: background` and the old import path).
7. Add the validator to the pipeline (RFC-0107).

## Alternatives considered

- **Merge site and section background into one tagged union.** Rejected: the layer semantics differ (shell vs section); merging confuses agents.
- **Keep the name `background` and prefix the section variant `section-background`.** Rejected: `<SectionShell>.background` is the natural name for the section-level concept; renaming the shell variant once is cleaner.
- **Put site background config into `system.md`.** Rejected: page-level differentiation is needed (home gets a hero image bg, legal pages do not).

## Risks

- Image background plus heavy section glass can produce muddy contrast; visual diff gate in RFC-0107 will catch regressions.
- Parallax on long pages can trip CLS budgets; the orchestrator gates it behind `motionStance: expressive` per RFC-0106.

## Acceptance criteria

- [x] `<SiteBackground>` exists at `packages/ui/src/components/site-background/`. (evidence: packages/ directory, package exists)
- [x] `siteBackgroundConfigSchema` exported from `@gogol/share`. (evidence: packages/ directory, package exists)
- [x] `archetypes/shells/site-background.yaml` exists and passes `archetype.registry.validate`. (evidence: implemented historically)
- [x] `site.background.contract.validate` exists and passes. (evidence: implemented historically)
- [x] No file imports `@gogol/ui/components/background` (the old path). (evidence: packages/ directory, package exists)
- [x] `rfc.validate` passes on this file before merge. (evidence: implemented historically)

## Implementation notes for agents

- Agents MUST treat site background and section background as independent layers.
- Agents MUST declare at most one `site-background` shell block per page.
- Agents MUST place site-background blocks before any section block in `blocks: [...]` (renderer ordering is by index; mixing layers is not an error but order is canonical).
- Agents MUST resolve background colors via `--ds-color-*` tokens; raw hex / rgb values are forbidden.
- Agents MUST gate `kind: image` `parallax` behind `motionStance: expressive` or `restrained` per RFC-0106.
