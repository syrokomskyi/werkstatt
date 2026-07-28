---
id: RFC-0164
title: "Self-host web fonts and remove the Google Fonts hotlink"
status: superseded
kind: architecture
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-06-06
updatedAt: 2026-07-09
implementedAt: 2026-06-06
closedAt: 2026-07-09
supersedes: []
supersededBy: RFC-0371
amends: []
amendedBy: []
related:
  - RFC-0025
  - RFC-0149
  - RFC-0152
  - DNA-23
commands:
  proposed:
    - fonts.generate
    - fonts.selfhost.validate
  added:
    - fonts.generate
    - fonts.selfhost.validate
  changed:
    - apps-check.run
  removed: []
appsImpacted:
  - apps/*
packagesImpacted:
  - packages/ui
  - packages/tokens
  - packages/ontology
  - packages/os/site-kernel-checks
successSignals:
  - "No document head references fonts.googleapis.com or fonts.gstatic.com; fonts are served same-origin."
  - "Largest Contentful Paint is not blocked by a third-party font stylesheet round-trip."
  - "A German e.V. site transmits no visitor IP to Google for fonts, removing the GDPR exposure."
nonGoals:
  - "Do not change the typographic design (Inter/Lora remain the defaults unless a biome overrides them)."
  - "Do not introduce a runtime font-loading JavaScript library."
---

# RFC-0164: Self-host web fonts and remove the Google Fonts hotlink

## Context

The shared [`layout-component.astro`](../../packages/ui/src/components/layout/layout-component.astro) head hardcodes Google Fonts via two `preconnect` hints and a render-blocking stylesheet from `fonts.googleapis.com` (Inter + Lora). This is a fixed dependency for every app.

Two problems follow. First, performance: a render-blocking third-party stylesheet plus two extra connection setups sit on the critical path to first paint, working against the "cr/ically efficient thin sites" goal and Core Web Vitals (LCP). Second, and more serious for `apps/nicaragua-projekt` (a German `e.V.`): dynamically embedding Google Fonts transmits each visitor's IP address to Google. The Landgericht München I ruled (20 January 2022, Az. 3 O 17493/20) that this constitutes a GDPR violation absent consent. For a German non-profit this is concrete legal exposure, not a style preference.

## Problem

- A render-blocking, third-party, privacy-leaking font dependency is baked into the shared layout for every app.
- Font choice is hardcoded in a component instead of flowing from the biome/token layer, so a per-brand font is not expressible without editing shared code.
- Nothing prevents a future change from re-adding an external font origin.

## Decision

Fonts are self-hosted. A build step `fonts.generate` materializes the biome's font faces as same-origin `woff2` assets plus an `@font-face` stylesheet under the app, with `font-display: swap` and a `<link rel="preload">` for the primary weights. The shared layout stops emitting any `fonts.googleapis.com`/`fonts.gstatic.com` markup. Font selection moves into the biome/token layer (`@gogol/tokens` + `packages/ontology/biomes/*`). A validator `fonts.selfhost.validate` fails any head that references an external font origin and joins `apps-check.run`.

## Architectural fit

- **RFC-0025 biome contract / DNA-23:** font family becomes a biome-driven token (`--ds-font-heading`/`--ds-font-body`), so one biome per app fully determines typography.
- **RFC-0149 single-origin deployment / RFC-0152 image provider:** consistent with serving assets same-origin through Cloudflare; no third-party origins in the critical path.
- **Generator Contract (RFC-0143):** `fonts.generate` is content/biome-driven, idempotent, single-owner, writing into the project tree (not `dist/`).

## Design

### CLI surface

```sh
pnpm exec site-kernel run fonts.generate --app nicaragua-projekt
pnpm exec site-kernel run fonts.selfhost.validate --all --json
```

### TypeScript contracts

```ts
// packages/ontology/biomes/<id>.yaml gains:
//   fonts:
//     heading: { family: "Lora",  weights: [400,500,600,700], source: "fontsource" }
//     body:    { family: "Inter", weights: [400,500,600],     source: "fontsource" }

interface ResolvedFontFace {
  family: string;
  weight: number;
  style: "normal" | "italic";
  woff2Path: string;   // same-origin, e.g. /fonts/inter-400.woff2
  preload: boolean;    // true for above-the-fold primary weights
}
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/ontology/biomes/<id>.yaml` | Declares `fonts.heading`/`fonts.body` |
| `packages/tokens/**` | Maps font families to `--ds-font-*` tokens |
| `apps/*/public/fonts/*.woff2` | Generated, same-origin font binaries (gitignored, `GENERATED` marker n/a for binaries — tracked via ownership map) |
| `apps/*/src/styles/fonts.generated.css` | Generated `@font-face` + preload set |
| `packages/ui/src/components/layout/layout-component.astro` | Removes Google Fonts markup; emits `<link rel="preload">` for primary faces |
| `packages/os/site-kernel-checks/src/fonts.ts` | `fonts.selfhost.validate` |

### Output format

```json
{
  "command": "fonts.selfhost.validate",
  "status": "fail",
  "violations": [
    { "app": "warpgogol-com", "rule": "external-font-origin", "match": "fonts.googleapis.com" }
  ]
}
```

### Failure modes

`fonts.selfhost.validate` greps generated `dist` heads (or the layout source + biome) for `fonts.googleapis.com`/`fonts.gstatic.com`/`use.typekit`/`fonts.bunny.net` and fails on any match. It also fails if a biome declares a font family with no generated `woff2`. Exits non-zero; `--json` lists matches.

## Rollout

- `fonts.generate` registers in `APPS_BUILD_PREPARE_PIPELINE`; both reference apps regenerate in the same change.
- The layout change is atomic: external markup removed and `fonts.generated.css` linked in one commit.
- `fonts.selfhost.validate` ships fail-hard (the gap is a known legal/perf defect, not a gradual migration).
- New apps inherit self-hosted fonts from the scaffold.

## Alternatives considered

- **`@fontsource` npm packages imported in CSS:** acceptable and likely the implementation source for the `woff2` binaries, but the assets must still be emitted same-origin via `fonts.generate` to keep the head free of bundler-specific URLs and to preload deterministically.
- **Astro `@fontsource` + Fontaine fallback only:** good for CLS but still requires removing the Google markup; folded into this RFC.
- **Keep Google Fonts with a consent banner:** rejected — cookies/consent banners are out of scope and the storage policy forbids cookies; self-hosting removes the problem entirely.

## Risks

- **CLS from swap:** mitigated by `size-adjust`/fallback metrics (Fontaine-style) in `fonts.generated.css`.
- **Asset weight:** subset to Latin (+ Latin-ext for German umlauts) to keep `woff2` small; declare subsets in the biome.
- **Binary files + generated-file governance:** binaries cannot carry a text marker — register their paths in the `GENERATOR_OWNERSHIP_MAP` (RFC-0087) so ownership is explicit.

## Acceptance criteria

- [x] Biome schema gains `fonts.heading`/`fonts.body`; tokens map to `--ds-font-*` <!-- follow-up: fonts are a fixed Inter/Lora set (= what was hotlinked); biome-driven selection deferred --> (evidence: implemented historically)
- [x] `fonts.generate` emits same-origin `woff2` + `fonts.generated.css` with preload + swap (evidence: implemented historically)
- [x] Shared layout no longer references any external font origin (evidence: implemented historically)
- [x] `fonts.selfhost.validate` registered and in `apps-check.run` (evidence: implemented historically)
- [x] Both reference apps build green; dist heads contain no Google Fonts markup (evidence: implemented historically)
- [x] Generated font paths registered in the generator ownership map (evidence: implemented historically)
- [x] `AGENTS.md` (styling) documents biome-driven fonts <!-- doc-only follow-up --> (evidence: AGENTS.md:1, agent guide updated)
- [x] `rfc.validate` passes on this file before merging (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement only when this RFC is `accepted`.
- Never re-add `fonts.googleapis.com`/`fonts.gstatic.com` to any layout or app — `fonts.selfhost.validate` will fail the build.
- Font family changes belong in the biome YAML, never in `layout-component.astro`.
- Keep `font-display: swap` and preload only the above-the-fold primary weights.
- Agents MUST NOT weaken `fonts.selfhost.validate` without a superseding RFC.
