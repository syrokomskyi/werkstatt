/**
 * PBP derivation contract: pure function execution model and result envelope.
 *
 * @see pbp-specification-package/compiler §11 (Derivation Engine)
 * @see RFC-0431
 */

export type PbpDerivationStatus = "derived" | "skipped" | "failed";

export const PBP_DERIVATION_STATUSES: readonly PbpDerivationStatus[] = [
  "derived",
  "skipped",
  "failed",
] as const;

export function isPbpDerivationStatus(value: string): value is PbpDerivationStatus {
  return PBP_DERIVATION_STATUSES.includes(value as PbpDerivationStatus);
}

export type PbpDerivationMode = "exact" | "range" | "parameterized";

export const PBP_DERIVATION_MODES: readonly PbpDerivationMode[] = [
  "exact",
  "range",
  "parameterized",
] as const;

export function isPbpDerivationMode(value: string): value is PbpDerivationMode {
  return PBP_DERIVATION_MODES.includes(value as PbpDerivationMode);
}

export interface PbpDerivationProvenance {
  derivationRef: string;
  implementationVersion: string;
  inputDigests: string[];
}

export interface PbpDerivationContract {
  derivationRef: string;
  contractVersion: string;
  implementationVersion: string;
  requiredInputs: string[];
  parameters?: Record<string, unknown>;
}

export interface PbpDerivationResult {
  status: PbpDerivationStatus;
  mode: PbpDerivationMode;
  value?: unknown;
  minimum?: unknown;
  maximum?: unknown;
  formulaDescription?: string;
  requiredParameters?: Record<string, { unitRef: string }>;
  provenance: PbpDerivationProvenance;
}
