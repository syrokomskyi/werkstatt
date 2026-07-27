/**
 * PBP Validation severity and error code taxonomy.
 *
 * @see pbp-specification-package/compiler §12 (Semantic Validation), §13 (Validation Severity), §14 (Error Code Taxonomy)
 * @see RFC-0422
 */

export type PbpValidationSeverity = "fatal" | "error" | "warning" | "info";

export const PBP_VALIDATION_SEVERITIES: readonly PbpValidationSeverity[] = [
  "fatal",
  "error",
  "warning",
  "info",
] as const;

export function isPbpValidationSeverity(value: string): value is PbpValidationSeverity {
  return PBP_VALIDATION_SEVERITIES.includes(value as PbpValidationSeverity);
}

export type PbpErrorPrefix =
  | "PBP-PARSE"
  | "PBP-SCHEMA"
  | "PBP-ID"
  | "PBP-REF"
  | "PBP-LOC"
  | "PBP-PRODUCT"
  | "PBP-CATALOG"
  | "PBP-OFFER"
  | "PBP-PRICE"
  | "PBP-POLICY"
  | "PBP-CLAIM"
  | "PBP-DERIVE"
  | "PBP-RUNTIME"
  | "PBP-PROJECT"
  | "PBP-SIGN";

export const PBP_ERROR_PREFIXES: readonly PbpErrorPrefix[] = [
  "PBP-PARSE",
  "PBP-SCHEMA",
  "PBP-ID",
  "PBP-REF",
  "PBP-LOC",
  "PBP-PRODUCT",
  "PBP-CATALOG",
  "PBP-OFFER",
  "PBP-PRICE",
  "PBP-POLICY",
  "PBP-CLAIM",
  "PBP-DERIVE",
  "PBP-RUNTIME",
  "PBP-PROJECT",
  "PBP-SIGN",
] as const;

export function isPbpErrorPrefix(value: string): value is PbpErrorPrefix {
  return PBP_ERROR_PREFIXES.includes(value as PbpErrorPrefix);
}

export interface PbpValidationError {
  code: string;
  severity: PbpValidationSeverity;
  entityId?: string;
  path?: string;
  message: string;
}
