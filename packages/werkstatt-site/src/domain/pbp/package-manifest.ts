/**
 * PBP package manifest, locale profile, and build config types.
 *
 * @see pbp-specification-package/compiler §3.1 (Package manifest), §3.3 (Build request)
 * @see pbp-specification-package/decision-log ADR-026
 * @see RFC-0402
 */

import type { PbpEntityRef } from "./entity-ref.js";

export interface PbpLocaleProfile {
  sourceRef: string;
  fallbackRef?: string;
}

export interface PbpBuildConfig {
  strict: boolean;
  failOnWarnings: boolean;
}

export interface PbpPackageManifest {
  schema: string;
  id: string;
  defaultLocale: string;
  locales: Record<string, PbpLocaleProfile>;
  sources: Record<string, { sourceRef?: string; path?: string; type: string }>;
  registries?: Record<string, { sourceRef: string }>;
  buyerViewSchemaRef?: PbpEntityRef;
  build: PbpBuildConfig;
}

export interface PbpBuildRequest {
  locale: string;
  asOf?: string;
  projectionTargets: string[];
  includeRuntimeState: boolean;
  strictness: "production" | "migration";
}
