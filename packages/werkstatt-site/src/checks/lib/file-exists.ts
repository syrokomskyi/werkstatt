/*
<MODULE_CONTRACT>
<purpose>Maintains packages/os/site-kernel-checks/src/lib/file-exists.ts as an authored site-kernel-checks authored module so agents can evolve it without rediscovering local boundaries.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0303: became a thin re-export shim over the canonical @warpgogol/werkstatt-site/share/fs fileExists; kept so existing "./lib/file-exists.ts" imports keep working.</item>
</CHANGE_SUMMARY>
*/

export { fileExists } from "@warpgogol/werkstatt-site/share/fs";
