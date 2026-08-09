/*
<MODULE_CONTRACT>
<purpose>Maintains packages/share/src/content-discipline/index.ts as an authored share authored module so agents can evolve it without rediscovering local boundaries.</purpose>
<non-goals>
  <item>Do not define validation logic here.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Added barrel exports for content-discipline submodules.</item>
</CHANGE_SUMMARY>
*/

export * from "./types.ts";
export * from "./parsers.ts";
