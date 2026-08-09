/**
 * PBP tax treatment and buyer presentation.
 *
 * @see pbp-specification-package/entity-model §17.1 (Pricing header, tax)
 * @see RFC-0446
 */

export type PbpTaxTreatment = "not-declared" | "gross" | "net" | "vat-included";

export const PBP_TAX_TREATMENTS: readonly PbpTaxTreatment[] = [
  "not-declared",
  "gross",
  "net",
  "vat-included",
] as const;

export function isPbpTaxTreatment(value: string): value is PbpTaxTreatment {
  return PBP_TAX_TREATMENTS.includes(value as PbpTaxTreatment);
}

export interface PbpTaxJurisdiction {
  countryCode: string;
}

export interface PbpTax {
  treatment: PbpTaxTreatment;
  jurisdiction?: PbpTaxJurisdiction;
}
