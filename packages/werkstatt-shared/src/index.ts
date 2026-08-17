/*
<MODULE_CONTRACT>
<purpose>Package barrel for @warpgogol/werkstatt-shared — stack-agnostic shared infrastructure extracted from werkstatt-site (RFC-0868).</purpose>
<non-goals>
  <item>Do not export site-specific validators, Astro components, or stack plugin logic.</item>
  <item>Do not import from @warpgogol/werkstatt-site or any stack plugin.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0868: initial extraction from werkstatt-site.</item>
</CHANGE_SUMMARY>
*/

export * from "./checks/index.ts";
