/*
<MODULE_CONTRACT>
<purpose>Type shim for the official `hls.js/light` export used by the lazy feature-video runtime.</purpose>
<non-goals>
  <item>Do not change runtime resolution; this file only fills the missing package declaration.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Use the hls.js light runtime without losing TypeScript strictness.</item>
</CHANGE_SUMMARY>
*/

declare module "hls.js/light" {
  export { default } from "hls.js";
  export * from "hls.js";
}
