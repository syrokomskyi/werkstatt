/*
<MODULE_CONTRACT>
<purpose>
Master barrel for @warpgogol/ontology — re-exports all public APIs from the
enums, manifest, and cosmic sub-modules so consumers can import from the
package root or sub-paths.
</purpose>
<non-goals>
  <item>Do not add business logic here — keep as a pure re-export barrel.</item>
  <item>Do not re-export internal helpers (semver/kebab validators).</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial barrel created as part of Wave 1 (RFC-0023 rollout).</item>
  <item>Wave 1 (RFC-0025): Added cosmic catalog re-exports (DNA-23).</item>
</CHANGE_SUMMARY>
*/

// ---------------------------------------------------------------------------
// Enums — Layer
// ---------------------------------------------------------------------------
export { LayerValues, layerSchema } from "./enums.ts";
export type { Layer } from "./enums.ts";

// ---------------------------------------------------------------------------
// Enums — SemanticRole (RFC-0084: open, archetype-derived; type alias only)
// ---------------------------------------------------------------------------
export type { SemanticRole } from "./enums.ts";

// ---------------------------------------------------------------------------
// Enums — ComponentRole
// ---------------------------------------------------------------------------
export { ComponentRoleValues, componentRoleSchema } from "./enums.ts";
export type { ComponentRole } from "./enums.ts";

// ---------------------------------------------------------------------------
// Enums — Industry
// ---------------------------------------------------------------------------
export { IndustryValues, industrySchema, IndustryLabels } from "./enums.ts";
export type { Industry } from "./enums.ts";

// ---------------------------------------------------------------------------
// Manifest schema + types
// ---------------------------------------------------------------------------
export {
  KNOWN_INTENTS,
  pageManifestSchema,
  sectionManifestSchema,
  componentManifestSchema,
  manifestSchema,
} from "./manifest.ts";
export type {
  KnownIntent,
  PageManifest,
  SectionManifest,
  ComponentManifest,
  Manifest,
} from "./manifest.ts";

// ---------------------------------------------------------------------------
// Schemas — Constellation, Biome, SiteFamily, SystemManifest (DNA-23, RFC-0025, RFC-0071)
// ---------------------------------------------------------------------------
export {
  constellationSchema,
  constellationSlotSchema,
  biomeSchema,
  biomeAxesSchema,
  biomeConstraintsSchema,
  biomeFontEntrySchema,
  biomeFontsSchema,
  biomeGeometrySchema,
  biomeMotionSchema,
  biomePaletteSchema,
  biomeProvenanceSchema,
  biomeSiteBackgroundSchema,
  biomeSpacingSchema,
  biomeTypographySchema,
  siteFamilySchema,
  siteFamilyDetectionSchema,
  siteFamilyRecipeSchema,
  SiteFamilyContract,
  sectionArchetypeSchema,
  systemManifestSchema,
} from "./schemas/index.ts";
export type {
  Constellation,
  ConstellationSlot,
  Biome,
  BiomeAxes,
  BiomeConstraints,
  BiomeFontEntry,
  BiomeFontsConfig,
  BiomeGeometry,
  BiomeMotion,
  BiomePalette,
  BiomeProvenance,
  BiomeSiteBackground,
  BiomeSpacing,
  BiomeTypography,
  SiteFamily,
  SiteFamilyDetection,
  SiteFamilyRecipe,
  SectionArchetypeContract,
  SectionArchetypeId,
  SectionArchetypeLayoutHint,
  SystemManifest,
  SystemPagePin,
  SystemPlanetPin,
} from "./schemas/index.ts";

// ---------------------------------------------------------------------------
// Schemas — PageEntry, BlockEntry (DNA-24, RFC-0026)
// ---------------------------------------------------------------------------
export { PageEntrySchema, BlockEntrySchema, getSectionPropsSchema } from "./schemas/index.ts";
export type { PageEntry, BlockEntry } from "./schemas/index.ts";

// ---------------------------------------------------------------------------
// Schemas — Capability catalog (RFC-0288)
// ---------------------------------------------------------------------------
export { capabilityInputOutputSchema, capabilityRecordSchema } from "./schemas/index.ts";
export type { CapabilityInputOutputSchema, CapabilityRecord } from "./schemas/index.ts";

// ---------------------------------------------------------------------------
// Shared section props fragments (RFC-0101, RFC-0102, RFC-0103)
// ---------------------------------------------------------------------------
export {
  SHARED_SECTION_PROPS,
  isSharedSectionPropsId,
  composeManifestPropsSchema,
  sharedSectionPropsChangelog,
} from "./shared-section-props/index.ts";
export type {
  JsonSchemaFragment,
  SharedSectionPropsId,
  SharedSectionPropsRef,
} from "./shared-section-props/index.ts";

// ---------------------------------------------------------------------------
// Cosmic catalogs (DNA-23, RFC-0025)
// ---------------------------------------------------------------------------
export {
  StarCatalog,
  starNameSchema,
  PlanetCatalog,
  planetNameSchema,
  MoonCatalog,
  moonNameSchema,
  cosmicNameSchema,
} from "./cosmic/index.ts";
export type { StarName, PlanetName, MoonName, CosmicName } from "./cosmic/index.ts";

// ---------------------------------------------------------------------------
// Biome token projection (RFC-0071 consolidated mapping)
// ---------------------------------------------------------------------------
export {
  BIOME_TO_TOKEN_MAP,
  BIOME_TOKEN_ALIASES,
  BIOME_TOKEN_DERIVED,
  getBiomeField,
  projectBiomeToTokens,
  getAllProjectedTokenNames,
} from "./biome-token-projection.ts";
export type { BiomeTokenAlias, BiomeTokenDerived } from "./biome-token-projection.ts";
