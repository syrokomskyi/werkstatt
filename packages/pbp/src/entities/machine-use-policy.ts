/**
 * PBP MachineUsePolicy entity and AI access projection.
 *
 * @see pbp-specification-package/system-spec §25 (MachineUsePolicy)
 * @see RFC-0434
 */

import type { PbpEntity } from "../envelope.js";
import type { PbpEntityRef } from "../entity-ref.js";
import { pbpSchemaId } from "../schema-id.js";

export const MACHINE_USE_POLICY_SCHEMA_ID = pbpSchemaId("machine-use-policy");

export type PbpMachineUsePermission =
  | "discovery"
  | "retrieval"
  | "indexing"
  | "summarization"
  | "quotation"
  | "attribution"
  | "source-link-requirement"
  | "training"
  | "automated-purchasing"
  | "caching"
  | "redistribution";

export const PBP_MACHINE_USE_PERMISSIONS: readonly PbpMachineUsePermission[] = [
  "discovery",
  "retrieval",
  "indexing",
  "summarization",
  "quotation",
  "attribution",
  "source-link-requirement",
  "training",
  "automated-purchasing",
  "caching",
  "redistribution",
] as const;

export function isPbpMachineUsePermission(value: string): value is PbpMachineUsePermission {
  return PBP_MACHINE_USE_PERMISSIONS.includes(value as PbpMachineUsePermission);
}

export type PbpMachineUseVerdict = "allowed" | "denied" | "conditional";

export const PBP_MACHINE_USE_VERDICTS: readonly PbpMachineUseVerdict[] = [
  "allowed",
  "denied",
  "conditional",
] as const;

export function isPbpMachineUseVerdict(value: string): value is PbpMachineUseVerdict {
  return PBP_MACHINE_USE_VERDICTS.includes(value as PbpMachineUseVerdict);
}

export interface PbpMachineUsePolicy extends PbpEntity {
  type: "machine-use-policy";
  name: string;
  permissions: Record<PbpMachineUsePermission, PbpMachineUseVerdict>;
  conditions?: Record<string, string>;
}
