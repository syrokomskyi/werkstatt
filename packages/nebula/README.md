# @gogol/nebula

Nebula Score computation pipeline — composite 0–100 quality metric across four pillars: Performance, Accessibility, Content Health, and Architectural Compliance (DNA-33, RFC-0028).

## Purpose

The Nebula Score is embedded in the Cosmic Passport (see `@gogol/passport`) and surfaced in the Star Map. It gives a single, versioned quality signal for each app build.

## Why Nebula?

The name follows the platform's cosmic metaphor (constellations → apps, stars → pages, planets → sections, moons → components). A nebula is a multi-layered cloud of gas and dust in space; similarly, the Nebula Score is a composite metric that blends four quality pillars (Performance, Accessibility, Content Health, Architectural Compliance) into a single 0–100 signal—like a spectrum revealing the health of a site.

## Pillars and weights

| Pillar                                | Default weight |
| ------------------------------------- | -------------- |
| Performance (Lighthouse)              | 30 %           |
| Accessibility (axe-core)              | 30 %           |
| Content Health (OS content checks)    | 20 %           |
| Architectural Compliance (DNA checks) | 20 %           |

Weights are defined in `src/weights.ts` under `NEBULA_WEIGHTS` and versioned via `NEBULA_WEIGHTS_VERSION`.

## Public API

```typescript
import {
  computeNebulaScore,
  createStubNebulaInputs,
  collectNebulaInputs,
  toPassportScores,
  derivePerformanceScore,
  deriveAccessibilityScore,
  deriveContentHealthScore,
  deriveArchitecturalComplianceScore,
} from "@gogol/nebula";
import type { NebulaInputs, NebulaScore, PassportScores } from "@gogol/nebula";
```

### `computeNebulaScore(inputs: NebulaInputs): NebulaScore`

Accepts pre-collected pillar results and returns:

```typescript
{
  nebula: number;           // 0–100 composite score
  pillars: {
    performance: NebulaPillarScore;
    accessibility: NebulaPillarScore;
    contentHealth: NebulaPillarScore;
    architecturalCompliance: NebulaPillarScore;
  };
  weightsVersion: string;
  computedAt: string;       // ISO timestamp
}
```

### `createStubNebulaInputs(): NebulaInputs`

Creates all-passing stub inputs (performanceScore: 100, accessibilityScore: 100, no violations, all checks passing) — useful for development builds before real Lighthouse/axe data is available.

### `collectNebulaInputs(options): Promise<NebulaInputs>`

Reads CI artifact files (`.lighthouse-results.json`, `.axe-results.json`, `.content-checks.json`, `.dna-checks.json`) from an app directory and assembles a complete `NebulaInputs` object. Missing or malformed files fall back to stub values with a warning log.

```typescript
import { collectNebulaInputs } from "@gogol/nebula/collect";

const inputs = await collectNebulaInputs({ appDirectory: "./apps/webgogol-com" });
```

### `toPassportScores(score: NebulaScore): PassportScores`

Projects a `NebulaScore` into the passport schema's scores shape (strips `contribution`, `weightsVersion`, `computedAt`). Used by `@gogol/passport` emit pipeline.

### Derive functions

Four exported pillar derive functions for direct unit testing:

- `derivePerformanceScore(lighthouse)` — clamped Lighthouse performance score
- `deriveAccessibilityScore(lighthouse, axe)` — Lighthouse a11y score minus axe violations
- `deriveContentHealthScore(contentChecks)` — passing/total ratio scaled to 100
- `deriveArchitecturalComplianceScore(dnaChecks)` — passing/total ratio scaled to 100

## Sub-path imports

```typescript
import { NEBULA_WEIGHTS, NEBULA_WEIGHTS_VERSION } from "@gogol/nebula/weights";
import { computeNebulaScore, toPassportScores } from "@gogol/nebula/compute";
import { collectNebulaInputs } from "@gogol/nebula/collect";
import type { NebulaInputs, NebulaScore } from "@gogol/nebula/types";
```

## Testing

```sh
pnpm --filter @gogol/nebula test
```

24 vitest tests cover derive functions, composite scoring, stub inputs, passport projection, and weights invariant.

## Validation

```sh
pnpm --filter @gogol/nebula build:check
```
