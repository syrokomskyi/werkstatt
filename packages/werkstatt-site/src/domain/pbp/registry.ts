/**
 * PBP Registry and Resolver types.
 *
 * @see pbp-specification-package/system-spec §4.1 (Global Semantic Layer), §3.7 (Reproducibility)
 * @see RFC-0423
 */

export type PbpRegistryKind =
  | "category"
  | "comparison-profile"
  | "derivation-contract"
  | "identifier-scheme"
  | "unit-definition"
  | "metric-definition"
  | "controlled-vocabulary";

export const PBP_REGISTRY_KINDS: readonly PbpRegistryKind[] = [
  "category",
  "comparison-profile",
  "derivation-contract",
  "identifier-scheme",
  "unit-definition",
  "metric-definition",
  "controlled-vocabulary",
] as const;

export function isPbpRegistryKind(value: string): value is PbpRegistryKind {
  return PBP_REGISTRY_KINDS.includes(value as PbpRegistryKind);
}

export interface PbpRegistryEntry {
  id: string;
  kind: PbpRegistryKind;
  schema: string;
  authority: string;
  canonicalUri: string;
}

export type PbpResolverStatus = "resolved" | "not-found" | "ambiguous" | "stale";

export interface PbpResolverResult {
  ref: string;
  status: PbpResolverStatus;
  canonicalUri?: string;
  entry?: PbpRegistryEntry;
}
