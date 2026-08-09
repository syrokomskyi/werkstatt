/**
 * PBP incremental and bulk processing contract.
 *
 * @see pbp-specification-package/compiler §26 (Incremental Build), §27 (Build Reports)
 * @see RFC-0430
 */

export interface PbpCacheKey {
  entityDigest: string;
  locale: string;
  schemaSetDigest: string;
  derivationSetDigest: string;
}

export type PbpDependencyInvalidationRule =
  | "policy-change-invalidates-offerings"
  | "comparison-profile-change-invalidates-comparisons"
  | "locale-change-invalidates-locale-projections"
  | "product-name-change-invalidates-catalog-entry-display";

export const PBP_DEPENDENCY_INVALIDATION_RULES: readonly PbpDependencyInvalidationRule[] = [
  "policy-change-invalidates-offerings",
  "comparison-profile-change-invalidates-comparisons",
  "locale-change-invalidates-locale-projections",
  "product-name-change-invalidates-catalog-entry-display",
] as const;

export function isPbpDependencyInvalidationRule(
  value: string,
): value is PbpDependencyInvalidationRule {
  return PBP_DEPENDENCY_INVALIDATION_RULES.includes(value as PbpDependencyInvalidationRule);
}

export interface PbpDependencyGraph {
  nodes: Record<string, string[]>;
}

export interface PbpIncrementalBuildConfig {
  enabled: boolean;
  cacheKey: PbpCacheKey;
  dependencyGraph: PbpDependencyGraph;
}

export interface PbpBulkProcessingConfig {
  streaming: boolean;
  batchSize: number;
  maxInMemoryEntities: number;
}
