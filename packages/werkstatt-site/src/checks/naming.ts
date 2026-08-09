/*
<MODULE_CONTRACT>
<purpose>Thin re-export shim over naming/* (RFC-0303 split): naming.pages.lint,
naming.components.lint, naming.styles.lint, assets.structure.lint,
naming.suffixes.lint, and naming.layouts.lint.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0303: split into naming/{pages,components,styles,assets,suffixes,shared}.ts; this file is now a thin re-export shim so existing "./naming.ts" imports keep working unchanged.</item>
</CHANGE_SUMMARY>
*/

export { runNamingPagesLint, runNamingLayoutsLint } from "./naming/pages.ts";
export { runNamingComponentsLint } from "./naming/components.ts";
export { runNamingStylesLint } from "./naming/styles.ts";
export { runAssetsStructureLint } from "./naming/assets.ts";
export { runNamingSuffixesLint } from "./naming/suffixes.ts";
