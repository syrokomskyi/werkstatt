/*
<MODULE_CONTRACT>
<purpose>Maintains packages/os/site-kernel-checks/src/pipelines/sites-check.ts as an authored site-kernel-checks authored module so agents can evolve it without rediscovering local boundaries.</purpose>
<non-goals>
  <item>Do not define new steps; only compose existing pipelines.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Extracted from module.ts.</item>
</CHANGE_SUMMARY>
*/

import type { KernelPipelineStep } from "@warpgogol/werkstatt/kernel";
import { SITES_CHECK_AUTHOR_PIPELINE } from "./sites-check-author.ts";
import { SITES_CHECK_POSTBUILD_PIPELINE } from "./sites-check-postbuild.ts";

export const SITES_CHECK_PIPELINE: KernelPipelineStep[] = [
  ...SITES_CHECK_AUTHOR_PIPELINE,
  ...SITES_CHECK_POSTBUILD_PIPELINE,
];
