# `@warpgogol/star-map` — Agent Guide

Deterministic SSG-rendered SVG diagram of an app's cosmic universe (DNA-32, RFC-0028).

## What lives here

| Entry point | Module | What it provides |
| --- | --- | --- |
| `@warpgogol/star-map` | `src/index.ts` | Barrel: `renderStarMap`, `manifestToStarMapInput`, `emitStarMap`, types (`StarMapInput`, `StarMapOutput`, `StarMapManifestSubset`, ...) |
| `@warpgogol/star-map/render` | `src/render.ts` | `renderStarMap(input)` — produces deterministic SVG + SHA-256 hash; `manifestToStarMapInput` adapter (accepts `StarMapManifestSubset`); `emitStarMap` helper |

## Hierarchy depth

| Level | Cosmic name   | Source                             |
| ----- | ------------- | ---------------------------------- |
| 0     | Constellation | `system.md identity.constellation` |
| 1     | Stars         | Pages (from `StarCatalog`)         |
| 2     | Planets       | Sections (from `PlanetCatalog`)    |
| 3     | Moons         | Components (from `MoonCatalog`)    |

## Rules for AI agents

- The Star Map is embedded in the Cosmic Passport and has no runtime dependencies.
- The SVG uses only static attributes — no IDs, no random values — so it is diff-friendly in version control.
- Never inject `Date.now()` or random values into any path that feeds SVG generation — the output must remain byte-stable.
- Generated at build time from `system.md` and manifest files.

## Usage

```typescript
import { manifestToStarMapInput, emitStarMap } from "@warpgogol/star-map/render";
const input = manifestToStarMapInput(manifest, registry, 3);
const { svg, hash } = await emitStarMap(input, "dist/.well-known/cosmic-star-map.svg");
```

## Validation

```sh
pnpm --filter @warpgogol/star-map build:check
```
