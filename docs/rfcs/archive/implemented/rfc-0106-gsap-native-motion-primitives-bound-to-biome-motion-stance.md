---
id: RFC-0106
title: "GSAP-native motion primitives bound to biome motion stance"
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
  - DNA-37
  - RFC-0040
  - RFC-0041
  - RFC-0071
  - RFC-0101
  - RFC-0103
  - RFC-0104
  - RFC-0105
commands:
  proposed:
    - section.motion.contract.validate
  added:
    - section.motion.contract.validate
  changed:
    - layout.orchestrator.lint
    - page.block.validate
  removed:
    - per-image parallax CSS hand-rolled in section .css
    - per-section ad-hoc `animated: boolean` flag where it duplicates the biome motion stance
appsImpacted:
  - warpgogol-com
  - nicaragua-projekt
packagesImpacted:
  - share
  - ui
  - ontology
  - os/site-kernel-checks
successSignals:
  - "Section motion (reveal / parallax / stagger) is a single structured `motion` prop on <SectionShell> resolved against the biome motion stance."
  - "GSAP scripts (counter, inline numbers, reveal, parallax) load via runStandardLayoutOrchestration with opt-in flags; no section ships its own GSAP boilerplate."
  - "`prefers-reduced-motion` and `biome.motion.reduceMotionRespect: true` reliably disable motion across all shared primitives."
  - "RFC-0040 stat counters and RFC-0041 inline number animation are uniformly bridged from data attributes emitted by <SectionStats> and <SectionRich>."
nonGoals:
  - "Do not introduce a new animation library besides GSAP."
  - "Do not implement page-level transition animations (out of scope for the section contract)."
  - "Do not override biome.motion settings from page content; pages may downgrade motion but never upgrade beyond the biome stance."
---

# RFC-0106: GSAP-native motion primitives bound to biome motion stance

## Context

The platform already ships GSAP via `packages/share/src/scripts/`:

- `gsap-counter.ts` (RFC-0040) — animates stat counters when `runStandardLayoutOrchestration({ counters: true })`.
- `inline-number-animation.ts` (RFC-0041) — animates numbers inside prose when `runStandardLayoutOrchestration({ inlineNumbers: true })`.
- `lenis.ts` — smooth scroll.
- `scheduler.ts` — deferred task scheduler.
- `orchestrator.ts` — the platform initializer.

Biomes already carry a `motion` block (`durationFast / durationMedium / durationSlow / easing / reduceMotionRespect`) and an `axes.motionStance` enum (`static | restrained | expressive`). The DNA exists; sections do not consume it uniformly.

What is missing:

- A canonical "reveal" animation (fade-up on scroll-in) for sections that explicitly opt in.
- A canonical parallax primitive for images and site backgrounds.
- A canonical stagger primitive for lists, card grids, and stat groups.
- A single rule mapping `biome.motion.motionStance` to which animations are even available.
- A uniform way for `<SectionStats>` (RFC-0103) and `<SectionRich>` (RFC-0103) to opt in to RFC-0040 / RFC-0041 animations without sections inlining the `js-stat-counter` and `js-inline-number` boilerplate.

## Problem

1. **`animated: boolean` is ad-hoc** on `hero` and `impact`; sections decide per-instance whether counters animate, even though the biome already declares a motion stance.
2. **No reveal / parallax / stagger primitives** exist, although `motionStance: expressive` biomes (e.g. handwerk-material-warm if axes shift) would expect them.
3. **GSAP scripts must be opt-in** in each app's layout orchestrator; without a clear contract, agents add the flag inconsistently or forget it.
4. **`prefers-reduced-motion` enforcement is informal**, scattered across each script.
5. **Counter / inline-number markup is duplicated** by every section that renders stats or prose, including duplicate `data-*` attribute sets.

## Decision

Introduce a unified `SectionMotion` config on `<SectionShell>`, a canonical set of GSAP scripts (reveal, parallax, stagger) gated by orchestrator flags, and a strict `motionStance → available primitives` mapping enforced by validators.

### `SectionMotion` config

Path: `packages/share/src/schemas/section-motion.ts`.

```ts
export type RevealVariant = "fade" | "fade-up" | "fade-up-stagger";
export type ParallaxVariant = "subtle" | "balanced" | "dramatic";

export interface SectionMotionConfig {
  reveal?: { variant?: RevealVariant; once?: boolean; threshold?: number };
  parallax?: { variant?: ParallaxVariant; speed?: number };  // applies to <SectionImage parallax>
  stagger?: { delay?: number; childSelector?: string };       // for body cards/lists/stats
  /** Disable all motion on this section regardless of biome stance. */
  off?: boolean;
}
```

`<SectionShell>` (RFC-0101) gains an optional `motion?: SectionMotionConfig` prop. The shell emits `data-motion-reveal`, `data-motion-stagger`, etc. data attributes that the GSAP scripts pick up via selectors.

### `motionStance` envelope

| `axes.motionStance` | `reveal` | `parallax` | `stagger` | counters (RFC-0040) | inlineNumbers (RFC-0041) |
| --- | --- | --- | --- | --- | --- |
| `static` | denied | denied | denied | denied | denied |
| `restrained` | allowed (`fade` / `fade-up`) | denied | allowed | allowed | allowed |
| `expressive` | allowed (all) | allowed (all) | allowed | allowed | allowed |

`section.motion.contract.validate` enforces the envelope: a section authoring `motion.parallax` while the biome is `restrained` is a hard error (the biome forbids it; the page cannot override upward).

`reduceMotionRespect: true` (biome) plus the user's `prefers-reduced-motion: reduce` → every script short-circuits, emits no transforms, leaves content in final state.

### Per-page motion declaration

Pages do not opt in motion globally; sections do, individually, via `<SectionShell motion>`. The orchestrator in `apps/*/src/scripts/layout-orchestrator.ts` enables the platform-level scripts whenever the page declares any motion-using section. Generated by `kernel.wire` from page composition; agents do not edit it.

### Reveal script

Path: `packages/share/src/scripts/gsap-reveal.ts` (new). Behavior:

- Selector: `[data-motion-reveal]`.
- Uses GSAP's `ScrollTrigger` to trigger the reveal at `threshold` (default 0.15).
- Variant `fade` → opacity 0 → 1 over `biome.motion.durationMedium` with `biome.motion.easing`.
- Variant `fade-up` → opacity 0 + translateY(`16px`) → final.
- Variant `fade-up-stagger` → applies above to immediate children with `stagger.delay`.
- Respects `prefers-reduced-motion`.
- Idempotent on hot reload.

### Parallax script

Path: `packages/share/src/scripts/gsap-parallax.ts` (new). Behavior:

- Selector: `[data-parallax-speed]` (emitted by `<SectionImage parallax>` and `<SiteBackground kind: image>` from RFC-0105).
- Variants `subtle | balanced | dramatic` map to `speed` defaults `0.2 | 0.4 | 0.7`; an explicit numeric `speed` wins.
- Updates `transform: translate3d(0, calc(progress * speed * height * -1), 0)` inside a single rAF tick.
- Respects `prefers-reduced-motion`.

### Stagger script

Reuses GSAP timeline + `from` / `stagger` for children whose parent has `data-motion-stagger`. Default child selector `[data-motion-child]`; overridable per call.

### Orchestrator extension

`packages/share/src/scripts/orchestrator.ts`:

```ts
export interface OrchestrationOptions {
  headerOffset?: number;
  counters?: boolean;       // RFC-0040
  inlineNumbers?: boolean;  // RFC-0041
  reveal?: boolean;         // RFC-0106
  parallax?: boolean;       // RFC-0106
  stagger?: boolean;        // RFC-0106
}
```

Each opt-in lazy-loads its script via the existing scheduler. The orchestrator is a single function; apps call `runStandardLayoutOrchestration({...})` exactly once at the bottom of the layout (already the convention).

### `<SectionStats>` and RFC-0040 bridge

`<SectionStats>` (RFC-0103) emits the same `js-stat-counter` markup the existing `gsap-counter.ts` consumes. Section authors stop hand-writing `data-numeric / data-start / data-prefix / data-suffix` — the component does it. `animated` is no longer a top-level section flag; it is a `SectionStats` prop, and is automatically denied when the biome is `static`.

### `<SectionRich>` and RFC-0041 bridge

`<SectionRich>` (RFC-0103) calls `wrapInlineNumbers` on the rendered prose HTML when `animateNumbers: true` and the biome stance allows it. The script `inline-number-animation.ts` consumes `.js-inline-number`. Behavior preserved; coupling moves into the component.

### Removals

- `animated: boolean` at the section root for `hero`, `impact` — moves into `body.kind: stats` `animated`.
- Section-local CSS for image parallax (currently none, but pre-empts ad-hoc additions).
- Hand-rolled `data-animated`/`data-numeric`/`data-start`/`data-prefix`/`data-suffix` emission inside section .astro files — happens inside `<SectionStats>` only.

## Design

See `## CLI surface`, `## TypeScript contracts`, and `## File system responsibilities` above for the full GSAP motion primitive contracts, biome stance rules, and orchestrator wiring specification.

## Architectural fit

- **RFC-0035**: SectionProps unchanged; motion lives under `pageOverride`.
- **RFC-0040**: counter script untouched; consumer markup moves into `<SectionStats>`.
- **RFC-0041**: inline-number script untouched; consumer markup moves into `<SectionRich>`.
- **RFC-0071**: biome.motion fields (durations, easing, reduceMotionRespect) become CSS variables `--ds-motion-duration-*`, `--ds-motion-easing` consumed by GSAP scripts.
- **RFC-0101**: `<SectionShell>` exposes the `motion` prop and emits the data attributes.
- **RFC-0103**: `<SectionStats>` and `<SectionRich>` consume motion through the shell.
- **RFC-0105**: `<SiteBackground kind: image>` parallax routes through the same `parallax` script.

## CLI surface

```sh
pnpm exec site-kernel run section.motion.contract.validate
pnpm exec site-kernel run page.block.validate --app <id>
pnpm exec site-kernel run layout.orchestrator.lint --app <id>
```

Behavior:

- `section.motion.contract.validate` — every section's `motion` config is within the envelope dictated by the app's biome `motionStance`.
- `page.block.validate` — rejects `motion.parallax` when biome is `restrained`, etc.
- `layout.orchestrator.lint` — checks `apps/*/src/scripts/layout-orchestrator.ts` enables flags consistent with the sections used on the app's pages (e.g., a page that uses `motion.reveal` requires `reveal: true` in the orchestrator).

## TypeScript contracts

```ts
export const revealVariantSchema = z.enum(["fade", "fade-up", "fade-up-stagger"]);
export const parallaxVariantSchema = z.enum(["subtle", "balanced", "dramatic"]);

export const sectionMotionConfigSchema = z.object({
  reveal: z.object({
    variant: revealVariantSchema.optional(),
    once: z.boolean().optional(),
    threshold: z.number().min(0).max(1).optional(),
  }).optional(),
  parallax: z.object({
    variant: parallaxVariantSchema.optional(),
    speed: z.number().min(0).max(2).optional(),
  }).optional(),
  stagger: z.object({
    delay: z.number().min(0).max(2).optional(),
    childSelector: z.string().optional(),
  }).optional(),
  off: z.boolean().optional(),
});

export type SectionMotionConfig = z.infer<typeof sectionMotionConfigSchema>;
```

## File system responsibilities

| Path | Role |
| --- | --- |
| `packages/share/src/schemas/section-motion.ts` | `SectionMotionConfig` + Zod |
| `packages/share/src/scripts/gsap-reveal.ts` | Reveal animations |
| `packages/share/src/scripts/gsap-parallax.ts` | Parallax animations (used by site-background and section-image) |
| `packages/share/src/scripts/gsap-stagger.ts` | Stagger animations |
| `packages/share/src/scripts/orchestrator.ts` | Extended OrchestrationOptions |
| `packages/ui/src/components/section-shell/section-shell.astro` | Emits `data-motion-*` attributes |
| `packages/ui/src/components/section-body/stats/` | Emits RFC-0040 counter markup |
| `packages/ui/src/components/section-body/rich/` | Wraps inline numbers per RFC-0041 |
| `packages/ui/src/components/section-image/` | Emits `data-parallax-speed` when `parallax: true` |
| `packages/ui/src/components/site-background/` | Emits `data-parallax-speed` for `kind: image` layer |
| `packages/share/src/schemas/section-motion.ts` | New validator |

## Failure modes

- Page section declares `motion.parallax` while biome is `restrained` or `static` → `section.motion.contract.validate` fails.
- App's `layout-orchestrator.ts` does not enable `reveal: true` while a page uses `motion.reveal` → `layout.orchestrator.lint` fails.
- `prefers-reduced-motion: reduce` with `biome.motion.reduceMotionRespect: true` causes motion → bug in scripts; covered by integration tests.

## Rollout

1. Add `gsap-reveal.ts`, `gsap-parallax.ts`, `gsap-stagger.ts` to `packages/share/src/scripts/`.
2. Extend `orchestrator.ts` with the new opt-in flags.
3. Add `sectionMotionConfigSchema` and wire it into `<SectionShell>`.
4. Update `<SectionStats>` and `<SectionRich>` to consume the bridge.
5. Migrate `hero` and `impact` to remove their flat `animated` flag.
6. Add `section.motion.contract.validate` and `layout.orchestrator.lint`.
7. Update `kernel.wire` so generated layout orchestrators include the right opt-in flags based on the page composition.

## Alternatives considered

- **Embed motion into biome only (no per-section config).** Rejected: agents need to opt sections out (long-form text legal pages don't want reveal even when biome allows it) — the page wins downward, never upward.
- **CSS-only animations via `@keyframes`.** Rejected: GSAP is already in the stack and gives consistent ScrollTrigger semantics and `prefers-reduced-motion` handling.
- **Per-section JS hooks.** Rejected: scattered animation code is exactly what this RFC removes.

## Risks

- GSAP bundle size grows with new scripts; mitigated by `scheduler.scheduleTask` + dynamic imports already in place.
- ScrollTrigger refresh on layout shifts (web fonts, lazy images) requires a `ScrollTrigger.refresh()` call after font/image load — built into the scripts.
- `motionStance: expressive` plus parallax over an image-heavy hero can cause jank on low-end devices — `prefers-reduced-motion` plus a `devicePixelRatio < 2 && lowMemory` heuristic mitigates.

## Acceptance criteria

- [x] `SectionMotionConfig` exported from `@gogol/share`. (evidence: packages/ directory, package exists)
- [x] `gsap-reveal.ts` / `gsap-parallax.ts` / `gsap-stagger.ts` shipped in `packages/share/src/scripts/`. (evidence: packages/ directory, package exists)
- [x] `<SectionShell motion>` emits the data attributes. (evidence: implemented historically)
- [x] `<SectionStats>` and `<SectionRich>` no longer require section-level `animated` boolean. (evidence: implemented historically)
- [x] `section.motion.contract.validate` and `layout.orchestrator.lint` exist and pass. (evidence: implemented historically)
- [x] `rfc.validate` passes on this file before merge. (evidence: implemented historically)

## Implementation notes for agents

- Agents MUST treat `motionStance` as the upper bound; a page can downgrade motion but never bypass it.
- Agents MUST author motion as `motion: { reveal: { variant: "fade-up" } }` (or similar) on the section, never as direct GSAP calls inside section code.
- Agents MUST consume `<SectionStats>` for any animated counter; do not hand-roll `data-numeric` / `data-prefix` markup.
- Agents MUST ensure the generated `apps/<id>/src/scripts/layout-orchestrator.ts` enables the opt-in flags consistent with the pages composed; rely on `kernel.wire` rather than hand-editing.
