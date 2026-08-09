/*
<MODULE_CONTRACT>
<purpose>Deploy adapter barrel for the video plugin (RFC-0778).</purpose>
<keywords>deploy, barrel, video, editframe</keywords>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0778: initial deploy barrel.</item>
</CHANGE_SUMMARY>
*/

export { createLocalRenderAdapter } from "./local-render.ts";
export type {
  LocalRenderDeployConfig,
  LocalRenderAdapter,
  DeployResult,
} from "./local-render.ts";
