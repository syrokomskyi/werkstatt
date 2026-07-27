/**
 * PBP Reference resolution and graph integrity contracts.
 *
 * @see pbp-specification-package/compiler §8 (Reference Resolution)
 * @see RFC-0407
 */

export type PbpReferenceClass = "required" | "optional" | "external-opaque" | "deferred-runtime";

export type PbpExternalRefKind =
  "trusted-registry-snapshot" | "resolvable-https" | "cached-verified-record" | "opaque-identifier";

export type PbpGraphErrorKind =
  | "missing-internal-ref"
  | "type-mismatch"
  | "cycle-detected"
  | "external-ref-unresolvable"
  | "locale-suffix-in-id";

export interface PbpGraphIntegrityError {
  kind: PbpGraphErrorKind;
  entityId: string;
  refPath: string;
  message: string;
}

export type PbpCycleCheckType =
  | "requires"
  | "category-broader"
  | "successor-chain"
  | "product-intrinsic-composition"
  | "offering-optional-relation";

export interface PbpCycleCheckResult {
  checkType: PbpCycleCheckType;
  hasCycle: boolean;
  cyclePath?: string[];
}
