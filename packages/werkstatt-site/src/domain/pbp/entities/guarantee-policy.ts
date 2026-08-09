/**
 * PBP Guarantee Policy specialized schema.
 *
 * @see pbp-specification-package/entity-model §22 (Guarantee Policy)
 * @see RFC-0448
 */

import type { PbpPolicy } from "./policy.js";

export type PbpGuaranteeOperator = "less-than-or-equal" | "greater-than-or-equal" | "equals";

export const PBP_GUARANTEE_OPERATORS: readonly PbpGuaranteeOperator[] = [
  "less-than-or-equal",
  "greater-than-or-equal",
  "equals",
] as const;

export function isPbpGuaranteeOperator(value: string): value is PbpGuaranteeOperator {
  return PBP_GUARANTEE_OPERATORS.includes(value as PbpGuaranteeOperator);
}

export type PbpGuaranteeRemedyType = "continued-performance" | "service-credit" | "refund";

export const PBP_GUARANTEE_REMEDY_TYPES: readonly PbpGuaranteeRemedyType[] = [
  "continued-performance",
  "service-credit",
  "refund",
] as const;

export function isPbpGuaranteeRemedyType(value: string): value is PbpGuaranteeRemedyType {
  return PBP_GUARANTEE_REMEDY_TYPES.includes(value as PbpGuaranteeRemedyType);
}

export interface PbpGuaranteeCondition {
  trigger: { event: string };
  objective: {
    metricRef: string;
    operator: PbpGuaranteeOperator;
    threshold: { value: string; unitRef: string };
  };
}

export interface PbpGuaranteeRemedy {
  type: PbpGuaranteeRemedyType;
  additionalCharge: boolean;
  until: string;
}

export interface PbpGuaranteePolicy extends PbpPolicy {
  kind: "guarantee";
  condition: PbpGuaranteeCondition;
  remedy: PbpGuaranteeRemedy;
}
