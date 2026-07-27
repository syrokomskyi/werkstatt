/**
 * PBP Policy base entity and scope.
 *
 * @see pbp-specification-package/entity-model §20 (Policy base)
 * @see RFC-0439
 */

import type { PbpEntity } from "../envelope.js";
import type { PbpEntityRef } from "../entity-ref.js";
import { pbpSchemaId } from "../schema-id.js";

export const POLICY_SCHEMA_ID = pbpSchemaId("policy");

export type PbpPolicyKind =
  | "service-level"
  | "guarantee"
  | "ownership"
  | "exit"
  | "data-retention"
  | "cancellation"
  | "price-changes";

export const PBP_POLICY_KINDS: readonly PbpPolicyKind[] = [
  "service-level",
  "guarantee",
  "ownership",
  "exit",
  "data-retention",
  "cancellation",
  "price-changes",
] as const;

export function isPbpPolicyKind(value: string): value is PbpPolicyKind {
  return PBP_POLICY_KINDS.includes(value as PbpPolicyKind);
}

export interface PbpPolicy extends PbpEntity {
  type: "policy";
  kind: PbpPolicyKind;
  name: string;
  scope?: { offeringRefs: Record<string, PbpEntityRef> };
  terms?: Record<string, unknown>;
}
