/*
<MODULE_CONTRACT>
<purpose>Defines types and interfaces for the star map rendering system, facilitating structured data representation.</purpose>
<non-goals>
  <item>Do not implement rendering logic or visual output here.</item>
  <item>Do not handle data fetching or external API interactions.</item>
  <item>Do not define application-specific business logic.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Architecture review: replace StarMapOptions with StarMapInput (resolved hierarchy). Remove phantom theme/BiomeId.</item>
  <item>wg-fix: add StarMapManifestSubset to eliminate type casts in consumers. Remove unused SystemManifest re-export.</item>
</CHANGE_SUMMARY>
*/

/**
 * @warpgogol/star-map — types
 * DNA-32 / RFC-0028
 */

/** Depth options for the star map renderer. */
export type StarMapDepth = 3 | 4;

// ---------------------------------------------------------------------------
// Public input / output types
// ---------------------------------------------------------------------------

/** A moon (component) entry in the resolved cosmic hierarchy. */
export interface StarMapMoon {
  cosmicName: string;
}

/** A planet (section) entry in the resolved cosmic hierarchy. */
export interface StarMapPlanet {
  cosmicPlanet: string;
  pin: string;
  /** Moons (components) associated with this planet — only populated at depth=4. */
  moons?: StarMapMoon[];
}

/** A star (page) entry in the resolved cosmic hierarchy. */
export interface StarMapStar {
  route: string;
  cosmicStar: string;
  planets: StarMapPlanet[];
}

/**
 * Resolved cosmic hierarchy — the sole input to `renderStarMap`.
 * Callers construct this directly or via the `manifestToStarMapInput` adapter.
 */
export interface StarMapInput {
  appId: string;
  constellation: string;
  depth: StarMapDepth;
  stars: StarMapStar[];
  /** SVG viewport width in pixels. Default: 1200 */
  width?: number;
  /** SVG viewport height in pixels. Default: 800 */
  height?: number;
}

/** Output of `renderStarMap` — SVG markup + SHA-256 hash for change detection. */
export interface StarMapOutput {
  svg: string;
  hash: string;
}

// ---------------------------------------------------------------------------
// Internal graph types (not part of the public interface)
// ---------------------------------------------------------------------------

/** A single node in the star-map graph. */
export interface StarMapNode {
  id: string;
  label: string;
  kind: "constellation" | "star" | "planet" | "moon";
  /** Cosmetic descriptors */
  cosmicName?: string;
  /** Route path (only for star nodes) */
  route?: string;
  /** Pin version (only for planet/moon nodes) */
  pin?: string;
}

/** An edge connecting two nodes. */
export interface StarMapEdge {
  from: string;
  to: string;
}

/** The parsed graph representation before SVG rendering. */
export interface StarMapGraph {
  nodes: StarMapNode[];
  edges: StarMapEdge[];
  /** App identifier from system.yaml */
  appId: string;
  /** Constellation slug */
  constellation: string;
}

/** Resolved x/y position of a node (deterministic layout output). */
export interface NodePosition {
  nodeId: string;
  x: number;
  y: number;
}

// ---------------------------------------------------------------------------
// Registry types (used by the manifest adapter)
// ---------------------------------------------------------------------------

/**
 * Structural subset of SystemManifest that `manifestToStarMapInput` consumes.
 * Both `@warpgogol/ontology/schemas` SystemManifest and `@warpgogol/site-kernel-content`
 * SystemManifest satisfy this interface, eliminating the need for type casts.
 */
export interface StarMapManifestSubset {
  app: string;
  constellations?: string[];
  i18n?: {
    default: string;
  };
  pages?: Array<{
    routes?: Record<string, string>;
    route?: string;
    cosmicStar: string;
    planets: Array<{
      cosmicPlanet: string;
      pin: string;
    }>;
  }>;
}

/**
 * External registry entry shape — minimal subset of uni.registry.yaml
 * entries needed for moon-depth rendering.
 */
export interface RegistryEntry {
  cosmicName: string;
  layer: "section" | "component" | "page";
  packagePath?: string;
}

export type UniRegistry = Record<string, RegistryEntry>;
