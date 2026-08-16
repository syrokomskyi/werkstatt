/*
<MODULE_CONTRACT>
<purpose>Shared deploy types for Godot deploy adapters.</purpose>
<keywords>deploy, types, shared, godot</keywords>
<non-goals>
  <item>Do not import from any @warpgogol/* package — pure type definitions.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial shared deploy types — extracted DeployResult from itch-io to remove cross-module dependency.</item>
</CHANGE_SUMMARY>
*/

export interface DeployResult {
  success: boolean;
  url?: string;
  errors?: string[];
}
