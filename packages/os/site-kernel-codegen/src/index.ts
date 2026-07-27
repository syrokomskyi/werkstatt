/*
<MODULE_CONTRACT>
<purpose>Acts as a central export hub for various utility functions related to icon management and Compass operations.</purpose>
<non-goals>
  <item>Do not implement the internal logic of the exported functions.</item>
  <item>Do not manage state or configuration for the utilities.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0348: added runCompassMarkupMigrate export; updated header to v2 two-block contract.</item>
</CHANGE_SUMMARY>
*/

export {
  runGenerateIcons,
  runCleanIcons,
  runGenerateMaterialCreditsPage,
  runGenerateI18nMiddleware,
  renderMaterialCreditProse,
  selectLocalizedCreditRecords,
  loadMaterialCreditLabels,
  discoverUsageLocations,
} from "./service.ts";

export {
  runGenerateOpenSourcePage,
  openSourceLabelsSchema,
  loadOpenSourceLabels,
  normalizeLicense,
  detectLicenseConflict,
  classifyPackage,
  deduplicatePackages,
  buildCycloneDxSbom,
  openSourceRegistryDataSchema,
  type OpenSourceLabels,
  type OpenSourceRegistryData,
} from "./open-source-page.ts";

export {
  runGenerateOverlayPages,
  runGenerateRoutes,
  runGenerateGlobalStyles,
  runGenerateScriptsOrchestrator,
  runGeneratePublicInfrastructure,
  runGenerateAgentsDocs,
  runAppBoilerplateValidate,
} from "./app-boilerplate.ts";

export { runBiomeCssGenerate } from "./biome-css.ts";

export { runFontsImportsGenerate } from "./fonts-imports.ts";

export { runGenerateApiRoutes } from "./api-routes.ts";

export { runSectionScaffold, runSystemMdCompile } from "./section-scaffold.ts";
export { runLegalScaffold } from "./legal-scaffold.ts";

export {
  GENERATED_MARKER,
  hasGeneratedMarker,
  stripGeneratedMarker,
  buildGeneratedHeader,
  type StripGeneratedMarkerResult,
  type GeneratedHeaderInput,
} from "./generated-marker.ts";

export { runMaterialMetadataWrite } from "./material-metadata-write.ts";

// RFC-0527: content reference index generator
export { runContentRefIndexGenerate } from "./content-ref-index-generate.ts";

// RFC-0529: content reference brace→braceless migrator
export { runContentRefMigrate } from "./content-ref-migrate.ts";

// RFC-0262: manifest propsSchema -> generated TypeScript prop types
export {
  runPropsTypesGenerate,
  jsonSchemaToInterface,
  emitType,
  propsSchemaSourceHash,
  discoverManifestPropsInfo,
  type ManifestPropsInfo,
  type PropsTypesGenerateResult,
} from "./props-types.ts";
