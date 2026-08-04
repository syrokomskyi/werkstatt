# `@warpgogol/nebula` — Agent Guide

Nebula Score computation pipeline — composite 0–100 quality metric across four pillars (DNA-33, RFC-0028).

## What lives here

| Entry point | Module | What it provides |
| --- | --- | --- |
| `@warpgogol/nebula` | `src/index.ts` | Barrel: `computeNebulaScore`, `createStubNebulaInputs`, `collectNebulaInputs`, `toPassportScores`, 4 derive functions, types |
| `@warpgogol/nebula/weights` | `src/weights.ts` | `NEBULA_WEIGHTS`, `NEBULA_WEIGHTS_VERSION`, `NEBULA_PILLAR_IDS` |
| `@warpgogol/nebula/compute` | `src/compute.ts` | `computeNebulaScore(inputs)`, `toPassportScores(score)`, derive functions, `createStubNebulaInputs()` |
| `@warpgogol/nebula/collect` | `src/collect.ts` | `collectNebulaInputs(options)` — reads CI artifact files and assembles `NebulaInputs` |
| `@warpgogol/nebula/types` | `src/types.ts` | `NebulaInputs`, `NebulaScore`, `NebulaPillarScore`, `LighthouseResult`, `AxeResult`, etc. |

## Pillars and default weights

| Pillar                                | Weight |
| ------------------------------------- | ------ |
| Performance (Lighthouse)              | 30%    |
| Accessibility (axe-core)              | 30%    |
| Content Health (OS content checks)    | 20%    |
| Architectural Compliance (DNA checks) | 20%    |

## Rules for AI agents

- The Nebula Score is embedded in the Cosmic Passport (`@warpgogol/passport`) and surfaced in the Star Map.
- Weights are versioned via `NEBULA_WEIGHTS_VERSION`. Changing weights requires bumping the version.
- Use `createStubNebulaInputs()` for development builds before real Lighthouse/axe data is available.
- Use `collectNebulaInputs({ appDirectory })` in CI/build pipelines to read real artifact files. Missing files fall back to stubs with a warning.
- Use `toPassportScores(score)` to project a `NebulaScore` into the passport scores shape (no `contribution`, `weightsVersion`, or `computedAt`).
- Derive functions (`derivePerformanceScore`, etc.) are exported for direct unit testing — do not reimplement pillar logic in consumers.

## Usage

```typescript
import { computeNebulaScore, createStubNebulaInputs, collectNebulaInputs, toPassportScores } from "@warpgogol/nebula";

// Development
const score = computeNebulaScore(createStubNebulaInputs());
// score.nebula: 0–100, score.pillars: { performance, accessibility, contentHealth, architecturalCompliance }

// CI pipeline
const inputs = await collectNebulaInputs({ appDirectory: "./apps/warpgogol-com" });
const ciScore = computeNebulaScore(inputs);
const passportScores = toPassportScores(ciScore);
```

## Testing

```sh
rtk pnpm --filter @warpgogol/nebula test
```

## Validation

```sh
rtk pnpm --filter @warpgogol/nebula build:check
```
