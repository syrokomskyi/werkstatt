/*
<MODULE_CONTRACT>
<purpose>Defines type stubs for Astro virtual modules to facilitate type safety in
TypeScript without requiring a full Astro project context (RFC-0475). Mirrors
@gogol/pbp/src/env.d.ts and @gogol/content-source/src/env.d.ts.</purpose>
<non-goals>
  <item>Do not implement actual data fetching logic.</item>
  <item>Do not handle raw content parsing.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0475: created alongside the FAQ package — Astro virtual module type stubs for standalone tsc.</item>
</CHANGE_SUMMARY>
*/

/// <reference types="astro/client" />

declare module "astro:content" {
  export function getEntry(collection: string, id: string): Promise<any>;
  export function getCollection(collection: string, filter?: any): Promise<any[]>;
  export type CollectionEntry<T extends string> = {
    id: string;
    data: Record<string, unknown>;
    collection: T;
  };
}
