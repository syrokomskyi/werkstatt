/*
<MODULE_CONTRACT>
<purpose>
  [RFC-0141] Public barrel for @warpgogol/content-source — the source-agnostic surface.
  Exports the port contracts, the filesystem adapter capabilities, the relocated asset
  resolver, and the Astro collection loaders. Deliberately does NOT re-export ./astro.ts so
  node-side consumers (e.g. kernel checks) can import contracts without pulling astro:content.
</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0141: initial public surface.</item>
</CHANGE_SUMMARY>
*/

export type {
  ContentDomain,
  ContentEntryRef,
  ContentEntry,
  ContentStatus,
  AssetRef,
  ResolvedAsset,
  ContentSourceCapabilities,
  ContentSourceProvider,
} from "./types.ts";

// FS adapter exports — prefer @warpgogol/content-source/fs for new consumers.
// Re-exported here for backward compatibility with existing imports.
export * from "./fs.ts";
