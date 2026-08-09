/*
<MODULE_CONTRACT>
<purpose>RFC-0517: Pre-materialize content quality gate pipeline constants for mission.materialize.</purpose>
<non-goals>
  <item>Does not define a standalone pipeline registration — these constants are imported and run directly by mission-materialize.ts.</item>
  <item>Does not include generated-artifact-dependent validators — those require full build.prepare and run in mission.validate.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0517: initial preflight pipeline constants for mission materialization gate.</item>
</CHANGE_SUMMARY>
*/

import type { KernelPipelineStep } from "@warpgogol/werkstatt/kernel";

export const MISSION_PREFLIGHT_CRITICAL: KernelPipelineStep[] = [
  { command: "content-types.validate" },
  { command: "schema.drift.validate" },
  { command: "cosmic.catalog.validate" },
  { command: "biome.contract.validate" },
  { command: "surface.context.validate" },
];

export const MISSION_PREFLIGHT_WARNING: KernelPipelineStep[] = [
  { command: "content.filename.validate" },
  { command: "naming.content.lint" },
  { command: "mirroring.validate" },
  { command: "semantic.drift.validate" },
  { command: "content.links.validate" },
  { command: "content.references.validate" },
  { command: "pbp.content.validate" },
];
