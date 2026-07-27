/**
 * PBP Service Level Policy specialized schema.
 *
 * @see pbp-specification-package/entity-model §21 (SLA Policy)
 * @see RFC-0447
 */

import type { PbpPolicy } from "./policy.js";

export type PbpSlaOperator = "greater-than-or-equal" | "less-than-or-equal" | "equals";

export const PBP_SLA_OPERATORS: readonly PbpSlaOperator[] = [
  "greater-than-or-equal",
  "less-than-or-equal",
  "equals",
] as const;

export function isPbpSlaOperator(value: string): value is PbpSlaOperator {
  return PBP_SLA_OPERATORS.includes(value as PbpSlaOperator);
}

export interface PbpSlaObjective {
  metricRef: string;
  operator: PbpSlaOperator;
  threshold: { value: string; unitRef: string };
  measurementWindow: string;
}

export type PbpSlaRemedyType = "service-credit" | "continued-performance";

export const PBP_SLA_REMEDY_TYPES: readonly PbpSlaRemedyType[] = [
  "service-credit",
  "continued-performance",
] as const;

export function isPbpSlaRemedyType(value: string): value is PbpSlaRemedyType {
  return PBP_SLA_REMEDY_TYPES.includes(value as PbpSlaRemedyType);
}

export interface PbpSlaRemedy {
  trigger: "objective-not-met";
  type: PbpSlaRemedyType;
  value?: { model: string; periods?: number };
  application: "automatic" | "on-request";
}

export interface PbpServiceLevelPolicy extends PbpPolicy {
  kind: "service-level";
  objective: PbpSlaObjective;
  measurement?: { methodRef: string; evidenceSourceRef: string };
  exclusions?: Record<string, { reasonRef: string }>;
  remedy?: PbpSlaRemedy;
}
