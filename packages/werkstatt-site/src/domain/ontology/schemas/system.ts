/*
<MODULE_CONTRACT>
<purpose>
Zod schema for per-app system.yaml — the top-level manifest that binds a client
application to a cosmic identity, a single Biome, and an optional set of
Constellations (DNA-23, RFC-0025). Also declares the growth block (RFC-0027).
Stored at apps/<app-slug>/system.yaml.
</purpose>
<non-goals>
  <item>Do not parse YAML here; the caller is responsible for parsing.</item>
  <item>Do not reference app business logic or client-specific content.</item>
  <item>Do not add rendering logic.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Wave 1 (RFC-0025): Initial creation.</item>
  <item>Wave 1 (RFC-0027): Added growth block — vendor adapter binding, active funnels, active experiments.</item>
  <item>RFC-0328: Added "legal" to semanticPageTypeSchema.</item>
  <item>RFC-0303 Phase 3: split the flat 822-line file into sub-modules under system/; this file is now the re-export shim.</item>
</CHANGE_SUMMARY>
*/

export {
  systemSharedContextSchema,
  systemGrowthSchema,
  growthVendorSchema,
} from "./system/growth.ts";
export type { SystemGrowth, GrowthVendor } from "./system/growth.ts";

export { systemPassportSchema, systemReleaseSchema } from "./system/release.ts";
export type { SystemPassport, SystemRelease } from "./system/release.ts";

export {
  systemTextNormalizeSignalsSchema,
  systemTextNormalizeSchema,
  systemTextSchema,
} from "./system/text.ts";
export type { SystemText } from "./system/text.ts";

export { systemIntegrationsSchema } from "./system/integrations.ts";
export type { SystemIntegrations } from "./system/integrations.ts";

export {
  semanticPageTypeSchema,
  articleMetadataSchema,
  llmsPolicySchema,
  sitemapProjectionSchema,
  robotsProjectionSchema,
  pageOutputSchema,
} from "./system/page-output.ts";

export { systemManifestSchema } from "./system/manifest.ts";
export type { SystemManifest, SystemPagePin, SystemPlanetPin } from "./system/manifest.ts";
