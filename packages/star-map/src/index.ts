/*
<MODULE_CONTRACT>
<purpose>Facilitates the export of star map rendering functionalities and type definitions for use in other modules.</purpose>
<non-goals>
  <item>Do not implement rendering logic directly in this module.</item>
  <item>Do not handle user input or configuration management here.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Tidied by compass.changesummary.tidy; see git history for prior entries.</item>
</CHANGE_SUMMARY>
*/

/**
 * @gogol/star-map — Deterministic SSG SVG star map renderer
 * DNA-32 / RFC-0028
 */

export { renderStarMap, manifestToStarMapInput, emitStarMap } from "./render.ts";
export type {
  StarMapInput,
  StarMapOutput,
  StarMapStar,
  StarMapPlanet,
  StarMapMoon,
  StarMapManifestSubset,
  StarMapDepth,
  StarMapGraph,
  StarMapNode,
  StarMapEdge,
  NodePosition,
  UniRegistry,
  RegistryEntry,
} from "./types.ts";
