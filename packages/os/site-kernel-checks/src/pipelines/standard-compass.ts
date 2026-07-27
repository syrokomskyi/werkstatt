/*
<MODULE_CONTRACT>
<purpose>Compass markup generation and validation pipeline, including v2 migration as the first step.</purpose>
<non-goals>
  <item>Do not implement validation logic; only define ordering.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0348: added compass.markup.migrate as first step; updated header to v2 two-block contract.</item>
  <item>RFC-0538: removed compass.markup.migrate and compass.annotate steps.</item>
</CHANGE_SUMMARY>
*/

import type { KernelPipelineStep } from "@gogol/site-kernel";

export const STANDARD_COMPASS_PIPELINE: KernelPipelineStep[] = [
  { command: "compass.inventory" },
  { command: "compass.validate" },
  { command: "compass.changesummary.validate" },
];
