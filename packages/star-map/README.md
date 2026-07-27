# @gogol/star-map

Deterministic SSG-rendered SVG diagram of an app's cosmic universe: constellation → stars (pages) → planets (sections) → moons (components, depth 4) (DNA-32, RFC-0028).

## Purpose

The Star Map is a visual, machine-readable diagram of an app's component hierarchy, embedded in the Cosmic Passport. It is generated at build time from `system.md` and the app's manifest files — it has no runtime dependencies.

## Public API

```typescript
import {
  renderStarMap,
  manifestToStarMapInput,
  emitStarMap,
  type StarMapInput,
  type StarMapOutput,
  type StarMapManifestSubset,
} from "@gogol/star-map";
```

### `renderStarMap(input: StarMapInput): StarMapOutput`

Accepts a resolved cosmic hierarchy (constellation, pages/stars, sections/planets, components/moons) and returns:

```typescript
{
  svg: string;   // deterministic SVG markup, safe to embed inline
  hash: string;  // SHA-256 of the SVG content for change detection
}
```

The SVG uses only static attributes — no IDs, no random values — so it is diff-friendly in version control.

### `manifestToStarMapInput(manifest: StarMapManifestSubset, registry, depth): StarMapInput`

Adapter that converts a manifest subset + `UniRegistry` into a `StarMapInput`. Accepts `StarMapManifestSubset` — a structural interface that both `@gogol/ontology/schemas` `SystemManifest` and `@gogol/site-kernel-content` `SystemManifest` satisfy, eliminating the need for type casts in consumers.

### `emitStarMap(input, outPath): Promise<StarMapOutput>`

Renders the star map and writes the SVG to `outPath`, creating parent directories as needed. Returns the same `{ svg, hash }` as `renderStarMap`.

## Hierarchy depth

| Level | Cosmic name   | Source                             |
| ----- | ------------- | ---------------------------------- |
| 0     | Constellation | `system.md identity.constellation` |
| 1     | Stars         | Pages (from `StarCatalog`)         |
| 2     | Planets       | Sections (from `PlanetCatalog`)    |
| 3     | Moons         | Components (from `MoonCatalog`)    |

## Usage in the Passport pipeline

```typescript
import { manifestToStarMapInput, emitStarMap } from "@gogol/star-map/render";
import { computeNebulaScore } from "@gogol/nebula";

const input = manifestToStarMapInput(manifest, registry, 3);
const { svg, hash } = await emitStarMap(input, "dist/.well-known/cosmic-star-map.svg");
const nebulaScore = computeNebulaScore(inputs);
// both are embedded into the Cosmic Passport
```

## Validation

```sh
pnpm --filter @gogol/star-map build:check
```
