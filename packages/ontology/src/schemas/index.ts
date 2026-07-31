/*
<MODULE_CONTRACT>
<purpose>
Barrel export for @warpgogol/ontology/schemas sub-path.
Re-exports the Constellation, Biome, SiteFamily, and SystemManifest schemas and types.
</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Wave 1 (RFC-0025): Initial creation.</item>
  <item>RFC-0071: Re-export site-family contract and expanded biome surface.</item>
  <item>RFC-0371: Re-export biome font entry schema and types.</item>
  <item>Architecture review 2026-07-10: extracted platform operations schemas to @warpgogol/ontology/operations; re-export getSectionPropsSchema from manifest-resolver.ts.</item>
</CHANGE_SUMMARY>
*/

export { constellationSchema, constellationSlotSchema } from "./constellation.ts";
export type { Constellation, ConstellationSlot } from "./constellation.ts";

export {
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
} from "./biome.ts";
export type {
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
} from "./biome.ts";

export {
  SiteFamilyContract,
  siteFamilyDetectionSchema,
  siteFamilyRecipeSchema,
  siteFamilySchema,
} from "./site-family.ts";
export type { SiteFamily, SiteFamilyDetection, SiteFamilyRecipe } from "./site-family.ts";

export { sectionArchetypeSchema } from "./section-archetype.ts";
export type {
  SectionArchetypeContract,
  SectionArchetypeId,
  SectionArchetypeLayoutHint,
} from "./section-archetype.ts";

export { systemManifestSchema } from "./system.ts";
export type { SystemManifest, SystemPagePin, SystemPlanetPin } from "./system.ts";

// Architecture review 2026-07-10: Re-export growthVendorSchema for @warpgogol/growth/config.ts.
export { growthVendorSchema } from "./system.ts";
export type { GrowthVendor } from "./system.ts";

export { PageEntrySchema, BlockEntrySchema } from "./page-entry.ts";
export type { PageEntry, BlockEntry } from "./page-entry.ts";
// getSectionPropsSchema is NOT re-exported here — it lives in manifest-resolver.ts
// which imports node:fs/promises. Re-exporting it from this barrel pulls Node-only
// modules into the Vite client bundle (growth/config.ts imports growthVendorSchema
// from this barrel). Node-side consumers import from
// @warpgogol/ontology/schemas/manifest-resolver directly.

// RFC-0288: Agent Surface closed capability catalog record.
export { capabilityInputOutputSchema, capabilityRecordSchema } from "./capability.ts";
export type { CapabilityInputOutputSchema, CapabilityRecord } from "./capability.ts";

// Platform operations schemas (handoff, sternsystem, werkstatt, mission,
// release, leitstand, notausgang, materialization, artifact-store,
// naming-policy) have been extracted to @warpgogol/ontology/operations.
