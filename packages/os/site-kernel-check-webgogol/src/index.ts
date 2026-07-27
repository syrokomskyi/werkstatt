/*
<MODULE_CONTRACT>
<purpose>Re-export barrel for @gogol/site-kernel-check-webgogol: aggregates command handlers and utilities for the Check Webgogol product surface.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial implementation as part of check-webgogol package extraction.</item>
</CHANGE_SUMMARY>
*/

export * from "./commands.ts";
