/*
<MODULE_CONTRACT>
<purpose>Defines type stubs for Astro virtual modules to facilitate type safety in TypeScript without requiring a full Astro project context (RFC-0466).</purpose>
<non-goals>
  <item>Do not implement actual data fetching logic.</item>
  <item>Do not handle raw content parsing.</item>
  <item>Do not manage module loading or orchestration.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Established by RFC-0466 — Astro virtual module type stubs for standalone tsc.</item>
</CHANGE_SUMMARY>
*/

/// <reference types="astro/client" />

// Minimal type stubs for Astro virtual modules used in loaders.ts and astro.ts.
// Full type safety is provided by astro:content declarations at the app level.
// These stubs allow standalone tsc (build:check) to pass without an Astro project context.
declare module "astro:content" {
  export function getEntry(collection: string, id: string): Promise<any>;
  export function getCollection(collection: string, filter?: any): Promise<any[]>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export type CollectionEntry<T extends string> = {
    id: string;
    data: Record<string, unknown>;
    collection: T;
  };
}
