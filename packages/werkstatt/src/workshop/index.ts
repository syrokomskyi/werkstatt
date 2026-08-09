/*
<MODULE_CONTRACT>
  <purpose>Barrel exports for the workshop module — workshop.scaffold command (RFC-0779).</purpose>
  <non-goals>
    <item>Do not re-export Node-only modules — this barrel may be imported by client-side code.</item>
  </non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0779: initial workshop module barrel.</item>
</CHANGE_SUMMARY>
*/

export { createWorkshopModule } from "./workshop.module.ts";
export { runWorkshopScaffold, type ScaffoldWorkshopResult } from "./workshop-scaffold.ts";
export { getWorkshopFiles, STACK_PLUGIN_MAP, type WorkshopTemplateVars, type WorkshopFile } from "./templates.ts";
