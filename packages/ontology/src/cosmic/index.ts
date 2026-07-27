/*
<MODULE_CONTRACT>
<purpose>
Barrel export for the @warpgogol/ontology/cosmic sub-path.
Re-exports all three closed catalogs, their union types, and Zod schemas
so consumers can import from a single entry point (DNA-23, RFC-0025).
</purpose>
<non-goals>
  <item>Do not add runtime logic.</item>
  <item>Do not import from outside the cosmic directory or zod.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Wave 1 (RFC-0025): Initial creation — cosmic barrel with cross-catalog union.</item>
</CHANGE_SUMMARY>
*/

import { z } from "zod";
import { StarCatalog } from "./star-catalog.ts";
import { PlanetCatalog } from "./planet-catalog.ts";
import { MoonCatalog } from "./moon-catalog.ts";

// Re-export individual catalogs, schemas, and types
export { StarCatalog, starNameSchema } from "./star-catalog.ts";
export type { StarName } from "./star-catalog.ts";

export { PlanetCatalog, planetNameSchema } from "./planet-catalog.ts";
export type { PlanetName } from "./planet-catalog.ts";

export { MoonCatalog, moonNameSchema } from "./moon-catalog.ts";
export type { MoonName } from "./moon-catalog.ts";

// ── Cross-catalog union ────────────────────────────────────────────────────
// CosmicName is the full set of valid cosmicName values across all layers.
// Use the per-layer schemas (starNameSchema, planetNameSchema, moonNameSchema)
// for layer-specific validation; cosmicNameSchema accepts any catalog entry.

export type CosmicName =
  | import("./star-catalog.ts").StarName
  | import("./planet-catalog.ts").PlanetName
  | import("./moon-catalog.ts").MoonName;

/** Runtime schema that accepts any name from any catalog. */
export const cosmicNameSchema = z.union([
  z.enum(StarCatalog),
  z.enum(PlanetCatalog),
  z.enum(MoonCatalog),
]);
