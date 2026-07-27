/*
<MODULE_CONTRACT>
<purpose>Facilitates the export of core Nebula scoring functionalities and types for use in the Nebula Score pipeline.</purpose>
<non-goals>
  <item>Do not implement scoring algorithms or business logic directly.</item>
  <item>Do not handle data fetching or external API interactions.</item>
  <item>Do not manage configuration or environment settings.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Add collectNebulaInputs, toPassportScores, derive functions, and PassportScores types to barrel exports.</item>
</CHANGE_SUMMARY>
*/

/**
 * @warpgogol/nebula — Nebula Score pipeline
 * DNA-33 / RFC-0028
 */

export { NEBULA_WEIGHTS, NEBULA_WEIGHTS_VERSION, NEBULA_PILLAR_IDS } from "./weights.ts";
export type { NebulaWeightKey } from "./weights.ts";

export {
  computeNebulaScore,
  createStubNebulaInputs,
  derivePerformanceScore,
  deriveAccessibilityScore,
  deriveContentHealthScore,
  deriveArchitecturalComplianceScore,
  toPassportScores,
} from "./compute.ts";
export type {
  NebulaInputs,
  NebulaScore,
  NebulaPillarScore,
  LighthouseResult,
  AxeResult,
  ContentCheckReport,
  DnaCheckReport,
} from "./types.ts";
export type { PassportScores, PassportPillarScore } from "./compute.ts";

export { collectNebulaInputs } from "./collect.ts";
export type { CollectNebulaInputsOptions } from "./collect.ts";
