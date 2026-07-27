/*
<MODULE_CONTRACT>
<purpose>Thin re-export shim over archetype/* (RFC-0303 split): the RFC-0072 archetype
catalog and section contract command set.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0303: split into archetype/{registry-build,cosmic-name,section-contract,similarity,constellation,shared}.ts; this file is now a thin re-export shim so existing "./archetype.ts" imports keep working unchanged.</item>
</CHANGE_SUMMARY>
*/

export { ARCHETYPE_REGISTRY_FILENAME } from "./archetype/shared.ts";
export {
  runArchetypeRegistryBuild,
  runArchetypeRegistryValidate,
  runPlanetImportPathsLint,
} from "./archetype/registry-build.ts";
export { runCosmicNamePick, runCosmicNameRename } from "./archetype/cosmic-name.ts";
export { runSectionContractValidate } from "./archetype/section-contract.ts";
export { runSectionSimilarityReport } from "./archetype/similarity.ts";
export { runConstellationContractValidate } from "./archetype/constellation.ts";
