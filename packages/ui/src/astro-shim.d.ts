/*
<MODULE_CONTRACT>
<purpose>Provides ambient type declarations for `.astro` modules to enable type-safe integration within the UI package.</purpose>
<non-goals>
  <item>Do not implement any runtime logic for Astro components.</item>
  <item>Do not perform content parsing or transformation of `.astro` files.</item>
  <item>Do not manage or configure Astro environment settings.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Enhance type safety by adding ambient declarations for `.astro` modules.</item>
</CHANGE_SUMMARY>
*/

// Ambient declarations for `.astro` modules so type-checking inside
// @warpgogol/ui can re-export Astro components from a TypeScript file.
// (Astro itself supplies these in app workspaces via env.d.ts; this package
// is consumed by apps but type-checked standalone, so we shim it here.)

declare module "*.astro" {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Component: (_props: any) => any;
  export default Component;
}
