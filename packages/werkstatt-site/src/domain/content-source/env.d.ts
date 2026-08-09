/***********************************************
<MODULE_CONTRACT>
<purpose>Ambient module declarations so this package's standalone `tsc --noEmit` can
resolve the Astro virtual `astro:content` module. Mirrors @warpgogol/werkstatt-site/share/src/env.d.ts.
At app build time Astro replaces these loose declarations with the real generated types.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0141: created alongside the Content Source Provider package.</item>
</CHANGE_SUMMARY>
***********************************************/

/// <reference types="astro/client" />
declare module "astro:content" {
  export function getEntry(collection: string, id: string): Promise<any>;
  export function getCollection(collection: string, filter?: any): Promise<any[]>;
}
