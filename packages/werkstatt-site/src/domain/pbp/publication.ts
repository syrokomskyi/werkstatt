/**
 * PBP git revision, canonical snapshot, and publication snapshot contract.
 *
 * @see pbp-specification-package/compiler §4 (Build context), §24 (Canonical Snapshot)
 * @see RFC-0435, RFC-0442
 */

export interface PbpGitRevision {
  ref: string;
  commitSha: string;
  clean: boolean;
}

export type PbpCanonicalSerializationStep =
  | "convert-to-json-compatible"
  | "validate-i-json"
  | "preserve-decimal-as-string"
  | "remove-undefined"
  | "canonicalize-rfc-8785"
  | "hash";

export const PBP_CANONICAL_SERIALIZATION_STEPS: readonly PbpCanonicalSerializationStep[] = [
  "convert-to-json-compatible",
  "validate-i-json",
  "preserve-decimal-as-string",
  "remove-undefined",
  "canonicalize-rfc-8785",
  "hash",
] as const;

export function isPbpCanonicalSerializationStep(
  value: string,
): value is PbpCanonicalSerializationStep {
  return PBP_CANONICAL_SERIALIZATION_STEPS.includes(value as PbpCanonicalSerializationStep);
}

export interface PbpCanonicalSerialization {
  steps: PbpCanonicalSerializationStep[];
}

export interface PbpCanonicalSnapshotIncluded {
  resolvedEntityGraphSubset: unknown;
  locale: string;
  schemaIds: string[];
  sourceRevision: string;
  derivationIds: string[];
  normativeFacts: unknown;
  projectionType?: string;
}

export interface PbpCanonicalSnapshotExcluded {
  buildPath: true;
  localFilesystemPath: true;
  irrelevantTimestamps: true;
  logOrder: true;
  nonDeterministicMetrics: true;
  signature: true;
}

export interface PbpCanonicalSnapshot {
  included: PbpCanonicalSnapshotIncluded;
  excluded: PbpCanonicalSnapshotExcluded;
  serialization: PbpCanonicalSerialization;
}

export interface PbpPublicationSnapshot {
  canonicalSnapshot: PbpCanonicalSnapshot;
  digest: string;
  publishedAt: string;
  signature?: { algorithm: string; value: string };
}

export interface PbpJcsCanonicalization {
  rfc: "RFC 8785";
  excludeUndefined: true;
  preserveDecimalStrings: true;
}
