/**
 * PBP primitive types — common value types used by all entity schemas.
 *
 * @see pbp-specification-package/entity-model §4 (Common primitives)
 * @see RFC-0400
 */

export interface PbpLocalizedString {
  value: string;
  language: string;
}

export interface PbpMoney {
  value: string;
  currency: string;
}

export interface PbpMoneyRange {
  minimum: PbpMoney;
  maximum: PbpMoney;
}

export type PbpIsoDuration = string;

export interface PbpQuantitativeDuration {
  value: number;
  unitRef: string;
}

export type PbpTimestamp = string;

export interface PbpQuantitativeValue {
  value?: string;
  minimum?: string;
  maximum?: string;
  unitRef: string;
}

export interface PbpExternalIdentifier {
  schemeRef: string;
  value: string;
  authorityRef?: string;
}

export interface PbpControlledValue {
  valueRef: string;
}
