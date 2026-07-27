---
id: RFC-0040
title: "Add GSAP as shared motion library and animated stat counter for impact sections"
status: implemented
kind: architecture
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-05-04
updatedAt: 2026-05-04
implementedAt: 2026-05-04
closedAt:
supersedes: []
supersededBy:
related:
  - RFC-0011
  - RFC-0026
  - RFC-0031
  - RFC-0034
  - RFC-0035
  - RFC-0103
  - RFC-0106
  - RFC-0113
commands:
  proposed: []
  added: []
  changed: []
  removed: []
appsImpacted:
  - nicaragua-projekt
packagesImpacted:
  - share
  - ui
successSignals:
  - "GSAP loads only on pages that contain `.js-stat-counter` elements (DOM guard in orchestrator)"
  - "INP / TBT scores on nicaragua-projekt home page remain within RFC-0006 Lighthouse budget"
  - "Stat counter animates once on first viewport entry; does not replay on scroll-back"
  - "`prefers-reduced-motion: reduce` bypasses all GSAP animation; values render static instantly"
  - "Ganymede section renders without JS as a plain static fallback"
nonGoals:
  - "Bundling GSAP into `packages/ui` components directly (avoids duplication and keeps component JS-free at build time)"
  - "Implementing digit-roll / odometer-style animation (assessed as over-engineered for current KPI count of 3 items)"
  - "Replacing Lenis with GSAP ScrollSmoother"
  - "Adding GSAP to every page unconditionally"
  - "Using GSAP for non-counter animations in this RFC (parallax, reveal, stagger of sections)"
---

# RFC-0040: Add GSAP as shared motion library and animated stat counter for impact sections

## Context

> **Updated by RFC-0103 + RFC-0106 (RFC-0113, 2026-05-27).** The animated stat counter remains canonical; the page-authoring surface moved from a section-level `animated: boolean` to the `body.kind: stats` field `body.animated` consumed by `<SectionStats>` (RFC-0103). The `<SectionStats>` body component bridges the same `js-stat-counter` markup that `gsap-counter.ts` already consumes via the `counters: true` orchestrator opt-in (RFC-0106). No script-level migration is required; only the authoring shape changed.

The `Ganymede` impact section (`packages/ui/src/sections/impact/`) renders KPI stats as static text. The `nicaragua-projekt` home page uses `Ganymede` for the "Wirkung in Zahlen" block with three counters (`11 Dörfer`, `14 Brigadistas`, `monatlich`). These values carry strong persuasive weight but currently appear as plain text with no motion feedback.

The site already uses Lenis for smooth scroll (via `@gogol/share/scripts`) and LordIcon for micro-animations. There is no shared motion library for scroll-triggered numeric or reveal animations.

RFC-0011 established the script placement contract: component-scoped interactive behavior lives in S-1 scripts (`src/scripts/components/{name}.ts`), and layout-global deferred loading lives in the S-2 orchestrator (`layout-orchestrator.ts`) using DOM guards and `await import()`. The orchestrator already defers Lenis and LordIcon via `scheduleTask` / `requestIdleCallback`.

RFC-0031 (pending) introduces colocated `*.client.ts` per feature. Until RFC-0031 is `accepted`, client scripts for `packages/ui` sections still follow the RFC-0011 S-1 pattern.

## Problem

1. **No shared motion library.** Each app would need to re-evaluate and re-bundle GSAP independently. GSAP is the natural fit because it unifies scroll-triggered animation with the existing Lenis smooth-scroll stack and is already used in expert tooling references for this codebase.

2. **Stat values are not classified as animated.** The `ImpactStat.value` field is typed as `string`, which accommodates both numeric (`"11"`, `"14"`) and non-numeric (`"monatlich"`) values. An animated counter must know at runtime which values are numeric and what their target, prefix, suffix, and decimal places are. This structured data is not captured in the current schema.

3. **No deferred-load path for GSAP.** Loading GSAP unconditionally on every page would add ~60 KB (minified+gzip) to every page's JS budget regardless of whether motion is used, harming the INP and TBT metrics tracked by RFC-0006.

4. **`prefers-reduced-motion` is not honored** in any current animation path for the impact section.

## Decision

1. **GSAP is adopted as the shared motion library** for all apps in `apps/*`. It is installed as a workspace-level dependency (root `package.json`) and imported via `@gogol/share/scripts/gsap` re-exports, keeping the import surface stable. Apps never import from `gsap` directly in component code — they import from `@gogol/share/scripts`.

2. **`initGsapCounter` is added to `packages/share/src/scripts/`** as a new module that encapsulates GSAP + ScrollTrigger initialization for stat counters. It is re-exported from `@gogol/share/scripts`. This function is never called unconditionally; it is always guarded by a DOM presence check.

3. **The `layout-orchestrator.ts` S-2 script** in each app is updated to include a DOM guard for `.js-stat-counter` elements. When present, it defers `initGsapCounter()` via `scheduleTask` so GSAP loads only on pages that contain counters, after the critical rendering path completes.

4. **`Ganymede` impact section (`packages/ui/src/sections/impact/`)** gains:
   - A new optional `animated` boolean prop (default `false`) in `propsSchema` and `ImpactSectionComponentContent`.
   - A new optional structured field `numericValue` on `ImpactStat` (alongside the existing `value: string` fallback).
   - Data attributes `data-numeric`, `data-prefix`, `data-suffix`, `data-decimals`, `data-duration` on each `.js-stat-counter` element when `animated: true`.
   - The `.astro` file emits `data-animated="true"` on the section root when `animated: true`, and renders each stat value span with `class="js-stat-counter"` plus the data attributes.
   - When `animated: false` (default), the section renders identically to today — no JS, no data attributes, full static SSG output.

5. **`prefers-reduced-motion: reduce`** causes `initGsapCounter` to skip all GSAP tweens and render final values immediately (static fallback, no animation). This is implemented inside `initGsapCounter`, not in the component.

6. **nicaragua-projekt home page** (`src/content/pages/de/index.md` and `en/index.md`) opts in to the counter by adding `animated: true` to the `Ganymede` block props and splitting its numeric stats into structured `numericValue` fields. The non-numeric stat (`"monatlich"`) keeps `numericValue` absent and renders static.

## Architectural fit

- **RFC-0011 (script placement):** GSAP loading stays in the S-2 orchestrator behind a DOM guard. The per-component initialization function lives in `@gogol/share/scripts`, not in the component `.astro` file itself. This preserves the invariant that components are JS-free at build time.
- **RFC-0026 (block-declarative pages):** The `animated` opt-in is a `blocks[].props` field, fully declarative in page frontmatter. No route file changes required.
- **RFC-0034 (content types colocated with components):** `ImpactStat` and `ImpactSectionComponentContent` in `impact-section.types.ts` gain the new optional fields.
- **RFC-0035 (unified section/component props contract):** `animated` and `numericValue` are added to the `propsSchema` in `impact-section.manifest.yaml` as optional, additionalProperties-safe fields.
- **DNA-22 (client surface):** `animated: true` is an authoring prop in `blocks[].props`, inside the client-editable whitelist (`src/content/pages/**`). No engineering-surface changes required from content editors.
- **RFC-0006 (Lighthouse budget):** GSAP is deferred and only loaded when `.js-stat-counter` elements exist on the page. This prevents budget regressions on pages without counters.

## Design

### GSAP installation

GSAP is added to the workspace root `package.json` as a direct dependency so all apps share a single resolved version:

```sh
pnpm add gsap --workspace-root
```

Version constraint: `^3.12.x` (latest stable as of 2026-05). ScrollTrigger is bundled with GSAP core — no separate package needed.

### `@gogol/share/scripts` additions

New file `packages/share/src/scripts/gsap-counter.ts` exports:

```ts
export interface GsapCounterOptions {
  prefersReducedMotion?: boolean;
}

/**
 * Finds all `.js-stat-counter` elements within sections marked `data-animated="true"`
 * and animates them using GSAP + ScrollTrigger.
 * Safe to call multiple times — elements are guarded with `data-gsap-ready`.
 * No-ops instantly when `prefersReducedMotion` is true.
 */
export async function initGsapCounter(options?: GsapCounterOptions): Promise<void>;
```

`packages/share/src/scripts/index.ts` re-exports `initGsapCounter` alongside existing exports.

Internally, `gsap-counter.ts` dynamically imports GSAP and ScrollTrigger at call time so the GSAP bundle is not included in the orchestrator's initial chunk:

```ts
const { gsap } = await import("gsap");
const { ScrollTrigger } = await import("gsap/ScrollTrigger");
gsap.registerPlugin(ScrollTrigger);
```

Number formatting uses `Intl.NumberFormat` with locale `"de-DE"` as the default, matching the existing site locale. Each app may pass a `locale` option to override.

Animation contract per counter element:

- Card: `opacity 0 → 1`, `translateY 18px → 0`, `scale 0.985 → 1`, `duration 0.7s`, `power3.out`
- Number: `0 → numericValue`, `duration` from `data-duration` (default `1.8s`), `power2.out`
- Prefix/suffix spans: `opacity 0 → 1`, `translateY 4px → 0`, staggered after card reveal
- ScrollTrigger: `start: "top 82%"`, `once: true`, `fastScrollEnd: true`
- `prefers-reduced-motion`: skip all tweens, set final values synchronously

### Stable width / layout shift prevention

To prevent text jumping during count-up:

1. **Tabular nums:** All counter spans use `font-variant-numeric: tabular-nums` (monospace digit rendering).

2. **Digit-stable start value:** The SSR renders the counter with the same character count as the final formatted value. The start value uses "1" in the highest digit position and "0" in remaining positions (e.g., final `"1,250"` → start `"1,000"`; final `"14"` → start `"10"`). This ensures visual width matches the final value throughout the animation.

3. **Min-width enforcement:** Components may optionally set `min-width` via inline style or CSS custom property based on the formatted length of the target value.

4. **Consistent suffix/prefix:** If suffix/prefix is present, it renders immediately (or fades in) so width does not change mid-animation.

5. **Shared utilities:** `packages/share/src/counter-utils.ts` exports `resolveCounterStats`, `formatNumber`, `parseNumeric`, and `getStartValue` to ensure consistent behavior across all counter-using sections without code duplication.

### `Ganymede` section changes

**`impact-section.manifest.yaml`** — new optional props:

```yaml
propsSchema:
  properties:
    animated:
      type: boolean
      default: false
      description: Opt in to GSAP scroll-triggered counter animation
    stats:
      type: array
      items:
        properties:
          value: { type: string }
          label: { type: string }
          numericValue:
            type: number
            description: Numeric target for animated counter; absent means value renders static
          prefix:
            type: string
            description: Currency or symbol rendered before the number (e.g. "€")
          suffix:
            type: string
            description: Unit rendered after the number (e.g. "+", "%", "K")
          decimals:
            type: integer
            minimum: 0
            default: 0
          duration:
            type: number
            minimum: 0.1
            default: 1.8
            description: GSAP tween duration in seconds
```

**`impact-section.types.ts`** — updated `ImpactStat`:

```ts
export interface ImpactStat {
  value: string;          // static display fallback (always required)
  label: string;
  numericValue?: number;  // present → animated counter target
  prefix?: string;
  suffix?: string;
  decimals?: number;
  duration?: number;
}

export interface ImpactSectionComponentContent {
  heading: string;
  ariaLabel: string;
  stats: ImpactStat[];
  texture: boolean;
  animated: boolean;      // new
}
```

**`impact-section.astro`** — when `animated` is true, each stat with a `numericValue` renders:

```html
<span
  class="impact-section__value js-stat-counter"
  data-numeric="14"
  data-prefix=""
  data-suffix=""
  data-decimals="0"
  data-duration="1.8"
>0</span>
```

Stats without `numericValue` render the `value` string as before.

### Layout orchestrator update (nicaragua-projekt)

`apps/nicaragua-projekt/src/scripts/layout-orchestrator.ts` gains one new guarded branch inside `runStandardLayoutOrchestration` — or, if the orchestrator is thin enough to delegate fully to `@gogol/share/scripts`, the shared orchestrator gains a new optional `counters` option:

```ts
// Option A — thin app orchestrator delegates to updated shared function:
await runStandardLayoutOrchestration({ counters: true });

// Option B — app orchestrator adds a local guard before delegating:
if (document.querySelector("[data-animated='true'] .js-stat-counter")) {
  scheduleTask(async () => {
    const { initGsapCounter } = await import("@gogol/share/scripts");
    await initGsapCounter({ prefersReducedMotion });
  });
}
```

The shared `runStandardLayoutOrchestration` gains an optional `counters?: boolean` option (default `false`) so apps opt in explicitly. When `counters: true`, the function applies the DOM guard and `scheduleTask` internally.

### nicaragua-projekt content update

`src/content/pages/de/index.md` — `impact` block updated:

```yaml
- id: impact
  use: Ganymede
  props:
    heading: "Wirkung in Zahlen"
    ariaLabel: "Wirkung in Zahlen"
    animated: true
    stats:
      - value: "11"
        numericValue: 11
        suffix: "+"
        label: "betreute Dörfer"
      - value: "14"
        numericValue: 14
        label: "ausgebildete Brigadistas"
      - value: "monatlich"
        label: "mobile Sprechstunden und Versorgung vor Ort"
```

`src/content/pages/en/index.md` — equivalent update with `lang: en` values.

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/share/src/scripts/gsap-counter.ts` | New — GSAP counter initialization module |
| `packages/share/src/scripts/index.ts` | Updated — re-exports `initGsapCounter` |
| `packages/share/src/scripts/orchestrator.ts` | Updated — gains `counters` option |
| `packages/share/src/counter-utils.ts` | New — shared `resolveCounterStats`, `formatNumber`, `parseNumeric`, `getStartValue` |
| `packages/share/src/index.ts` | Updated — re-exports counter utilities |
| `packages/ui/src/sections/impact/impact-section.types.ts` | Updated — new optional fields on `ImpactStat` and `ImpactSectionComponentContent` |
| `packages/ui/src/sections/impact/impact-section.manifest.yaml` | Updated — new props in `propsSchema` |
| `packages/ui/src/sections/impact/impact-section.astro` | Updated — conditional data attributes and `js-stat-counter` class |
| `packages/ui/src/sections/impact/impact-section.css` | Updated — `font-variant-numeric: tabular-nums` for counter value |
| `packages/ui/src/sections/hero/hero-section.astro` | Updated — conditional data attributes, `js-stat-counter` class, `data-start` for stable-width |
| `packages/ui/src/sections/hero/hero-section.css` | Updated — `font-variant-numeric: tabular-nums` for counter value |
| `apps/nicaragua-projekt/src/scripts/layout-orchestrator.ts` | Updated — opts in to counter orchestration |
| `package.json` (root) | Updated — adds `gsap` as workspace dependency |

## Rollout

1. **Phase 1 — library and shared module:** Install GSAP at workspace root. Add `gsap-counter.ts` to `packages/share/src/scripts/`. Update `orchestrator.ts`. All existing apps are unaffected — `counters` defaults to `false`.

2. **Phase 2 — Ganymede section update:** Extend `impact-section.types.ts`, `impact-section.manifest.yaml`, and `impact-section.astro`. All changes are backward-compatible (new fields are optional; sections without `animated: true` render identically to today).

3. **Phase 3 — nicaragua-projekt opt-in:** Update page frontmatter and app orchestrator. Run `pnpm --filter nicaragua-projekt build:check` and validate Lighthouse scores.

4. **New apps** may opt in to counter animation by passing `animated: true` in their `Ganymede` block and setting `counters: true` in their orchestrator call. No scaffolding changes required.

5. **Other animation use cases** (parallax, section reveal stagger, hero motion) are out of scope for this RFC. They require their own RFC if/when needed.

## Alternatives considered

- **CountUp.js** — lighter (~4 KB) but provides only numeric animation with no shared motion stack for future use. GSAP amortizes its cost across all future motion needs.
- **Odometer.js** — visually compelling "digit-roll" effect but requires theme CSS injection and does not integrate with GSAP timelines. Assessed as premature for 3-item KPI blocks.
- **IntersectionObserver + requestAnimationFrame** — viable vanilla approach with zero deps but requires reimplementing easing, ScrollTrigger restart logic, and reduced-motion handling manually. Maintenance burden outweighs the bundle saving.
- **Colocating GSAP import inside `impact-section.astro` directly** — violates RFC-0011 (S-1 scripts must live in `src/scripts/components/`, not inside `.astro` files). Also prevents deferred loading.

## Risks

- **Bundle size:** GSAP core + ScrollTrigger is ~60 KB gzip. Mitigated by DOM guard — the module is only loaded on pages with `.js-stat-counter` elements, not on every page.
- **GSAP license:** GSAP 3 is free for most use cases including non-profit/charity websites. Commercial-use SplitText and other premium plugins are not used in this RFC.
- **Scroll event conflicts:** GSAP ScrollTrigger and Lenis both listen to scroll events. GSAP provides `ScrollTrigger.scrollerProxy()` and `ScrollTrigger.addEventListener("refresh", ...)` to integrate with custom scroll containers. `initGsapCounter` must call `ScrollTrigger.refresh()` after Lenis initializes, or use Lenis's native GSAP integration (`lenis.on("scroll", ScrollTrigger.update)`). This integration detail is resolved during Phase 1 implementation.
- **Agent misapplication:** Agents must not add `animated: true` to sections that contain only non-numeric values, or to sections on pages where the orchestrator does not have `counters: true`. The `initGsapCounter` function is a no-op for stats without `data-numeric`, so breakage is contained, but authoring guidance must be added to the site `AGENTS.md`.

## Acceptance criteria

- [x] `gsap` added to root `package.json` at `^3.12.x` (evidence: implemented historically)
- [x] `packages/share/src/scripts/gsap-counter.ts` exists and exports `initGsapCounter` (evidence: packages/ directory, package exists)
- [x] `@gogol/share/scripts` index re-exports `initGsapCounter` (evidence: packages/ directory, package exists)
- [x] `packages/share/src/counter-utils.ts` exists with shared `resolveCounterStats`, `formatNumber`, `parseNumeric`, `getStartValue` (evidence: packages/ directory, package exists)
- [x] Counter animations read `data-start` attribute from `.js-stat-counter` and initialize counter object with parsed start value instead of 0 (evidence: implemented historically)
- [x] `runStandardLayoutOrchestration` accepts `counters` option; defaults to `false` (evidence: implemented historically)
- [x] `ImpactStat` interface has `numericValue?`, `prefix?`, `suffix?`, `decimals?`, `duration?` (evidence: implemented historically)
- [x] `ImpactSectionComponentContent` has `animated: boolean` (evidence: implemented historically)
- [x] `impact-section.manifest.yaml` propsSchema includes all new optional fields (evidence: implemented historically)
- [x] `impact-section.astro` renders `data-*` attributes and `js-stat-counter` class only when `animated: true` (evidence: implemented historically)
- [x] `impact-section.astro` renders `data-start` attribute for stable-width counter initialization (evidence: implemented historically)
- [x] `impact-section.astro` renders identically to today when `animated: false` (default) (evidence: implemented historically)
- [x] `hero-section.astro` renders `data-*` attributes and `js-stat-counter` class only when `animated: true` (evidence: implemented historically)
- [x] `hero-section.astro` renders `data-start` attribute for stable-width counter initialization (evidence: implemented historically)
- [x] Stats with no `numericValue` render their `value` string statically even when `animated: true` (evidence: implemented historically)
- [x] `prefers-reduced-motion: reduce` causes `initGsapCounter` to skip tweens and set final values immediately (evidence: implemented historically)
- [x] Counter animation uses stable width — starts with same digit count as final value (e.g., "1,000" → "1,250") to prevent layout shift (evidence: implemented historically)
- [x] All counter spans use `font-variant-numeric: tabular-nums` for consistent digit width (evidence: implemented historically)
- [x] nicaragua-projekt home page (`de` + `en`) updated with `animated: true` and structured stat props (evidence: original apps retired by RFC-0381, implemented historically)
- [x] nicaragua-projekt `layout-orchestrator.ts` opts in with `counters: true` (evidence: original apps retired by RFC-0381, implemented historically)
- [x] Lighthouse performance scores on nicaragua-projekt home page remain within RFC-0006 budget (evidence: original apps retired by RFC-0381, implemented historically)
- [x] `rfc.validate` passes on this file before merging (evidence: implemented historically)
- [x] `apps/nicaragua-projekt/AGENTS.md` updated with authoring guidance for `animated: true` (evidence: original apps retired by RFC-0381, implemented historically)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has `status: accepted`.
- Agents MUST NOT change the `status` field of this RFC.
- When implementing Phase 1, the Lenis ↔ GSAP ScrollTrigger integration must be verified first: confirm that `lenis.on("scroll", ScrollTrigger.update)` is called inside `initGsapCounter` or that `ScrollTrigger.refresh()` is invoked after Lenis initializes.
- Agents MUST NOT import `gsap` directly in `.astro` component files. All GSAP usage goes through `@gogol/share/scripts`.
- Agents MUST NOT add `animated: true` to any section other than `Ganymede` without a separate RFC.
- Agents MUST NOT load GSAP unconditionally in the orchestrator — the DOM guard on `.js-stat-counter` (or `[data-animated="true"] .js-stat-counter`) is mandatory.
- The `value: string` field on `ImpactStat` remains required and must always contain the correct display string — it is the static SSG fallback and the accessible text node before JS runs.
- When updating nicaragua-projekt content, preserve the `hideSectionNumber: true` prop on the `Ganymede` block (per biome invariant in `apps/nicaragua-projekt/AGENTS.md`).
